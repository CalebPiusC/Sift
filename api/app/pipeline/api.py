import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.auth import Identity, current_user
from app.config import Settings, get_settings

from . import oauth
from .crypto import Crypto
from .db import Database
from .jobs import Queue, enqueue

router = APIRouter(prefix="/v1")


class Runtime:
    def __init__(self, settings):
        self.settings, self.crypto = settings, Crypto(settings)
        self.db, self.queue = Database(settings), Queue(settings.redis_url)


async def runtime(request: Request, settings: Annotated[Settings, Depends(get_settings)]):
    if not settings.pipeline_enabled:
        raise HTTPException(503, "Message pipeline is not configured")
    if not getattr(request.app.state, "pipeline", None):
        try:
            request.app.state.pipeline = Runtime(settings)
        except (ValueError, KeyError, TypeError):
            raise HTTPException(503, "Pipeline key configuration is invalid") from None
    return request.app.state.pipeline


RuntimeDep = Annotated[Runtime, Depends(runtime)]
UserDep = Annotated[Identity, Depends(current_user)]
VendorDep = Annotated[UUID, Header(alias="X-Vendor-Id")]


def ok(data):
    return {"ok": True, "data": data}


def message(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "conversationId": str(row["conversation_id"]),
        "sender": row["sender"],
        "kind": row["kind"],
        "text": row["content"],
        "voice": {
            "transcript": row["voice_transcript"],
            "durationSeconds": row["voice_duration_seconds"],
            "audioUrl": None,
            "detectedLanguage": row["media_language"]
            or row["detected_language"]
            or row["language"],
        }
        if row["kind"] == "voice"
        else None,
        "status": row["status"],
        "language": row["language"] if row["language"] in ("en", "pcm") else "en",
        "englishSummary": row["english_summary"],
        "createdAt": row["created_at"].isoformat(),
        "deliveryErrorCode": row["delivery_error_code"],
    }


def conversation(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "customerId": str(row["customer_id"]),
        "customerName": row["customer_name"],
        "channel": row["channel"],
        "status": row["status"],
        "stage": row["stage"],
        "lastMessage": row["last_text"] or "",
        "unreadCount": row["unread"],
        "updatedAt": row["updated_at"].isoformat(),
        "humanModeUntil": row["human_mode_until"].isoformat() if row["human_mode_until"] else None,
        "threadUrl": row["thread_url"],
        "suggestedReplies": row["suggested_replies"],
        "assignedTo": str(row["assigned_member_id"]) if row["assigned_member_id"] else None,
        "assignedName": row["assigned_name"],
    }


CONVERSATIONS = """SELECT c.*,coalesce(canonical.display_name,cu.display_name) customer_name,ca.channel,am.name assigned_name,
 lm.content last_text,(SELECT count(*)::int FROM messages mm WHERE mm.conversation_id=c.id AND mm.sender='customer'
 AND mm.created_at>coalesce((SELECT last_read_at FROM conversation_reads cr WHERE cr.conversation_id=c.id AND cr.member_id=$2),'-infinity')) unread
 FROM conversations c JOIN customers cu ON cu.id=c.customer_id AND cu.vendor_id=c.vendor_id
 LEFT JOIN customers canonical ON canonical.id=cu.merged_into_id AND canonical.vendor_id=cu.vendor_id
 JOIN channel_accounts ca ON ca.id=c.channel_account_id AND ca.vendor_id=c.vendor_id
 LEFT JOIN messages lm ON lm.id=c.last_message_id AND lm.vendor_id=c.vendor_id
 LEFT JOIN vendor_members am ON am.id=c.assigned_member_id AND am.vendor_id=c.vendor_id WHERE c.vendor_id=$1"""


async def accessible(conn, vendor, member, cid):
    row = await conn.fetchrow(
        "SELECT * FROM conversations WHERE vendor_id=$1 AND id=$2", vendor, cid
    )
    if not row:
        raise HTTPException(404, "Conversation not found")
    if member["role"] == "agent" and row["assigned_member_id"] not in (None, member["id"]):
        raise HTTPException(403, "Conversation belongs to another agent")
    return row


def page(items, limit, cursor=None):
    return {
        "items": items,
        "total": len(items),
        "offset": 0,
        "limit": limit,
        "nextCursor": cursor,
        "hasMore": cursor is not None,
    }


@router.get("/conversations")
async def conversations(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    search: str = "",
    channel: str | None = None,
    stage: str | None = None,
    needsMe: bool = False,
):
    scope = {
        "vendor": str(vendor),
        "resource": "inbox",
        "search": search,
        "channel": channel,
        "stage": stage,
        "needsMe": needsMe,
    }
    mark = rt.crypto.read_cursor(cursor, scope) if cursor else None
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        args = [vendor, member["id"], limit + 1, search, channel, stage, needsMe]
        sql = (
            CONVERSATIONS
            + " AND ($4='' OR cu.display_name ILIKE '%'||$4||'%' OR lm.content ILIKE '%'||$4||'%') AND ($5::text IS NULL OR ca.channel=$5) AND ($6::text IS NULL OR c.stage=$6) AND (NOT $7 OR EXISTS(SELECT 1 FROM approvals a WHERE a.conversation_id=c.id AND a.status='pending'))"
        )
        if member["role"] == "agent":
            sql += " AND (c.assigned_member_id IS NULL OR c.assigned_member_id=$2)"
        if mark:
            args.extend([datetime.fromisoformat(mark["at"]), UUID(mark["id"])])
            sql += " AND (c.updated_at,c.id)<($8,$9)"
        rows = await conn.fetch(sql + " ORDER BY c.updated_at DESC,c.id DESC LIMIT $3", *args)
    more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        rt.crypto.cursor(
            {**scope, "at": rows[-1]["updated_at"].isoformat(), "id": str(rows[-1]["id"])}
        )
        if more
        else None
    )
    return ok(page([conversation(r) for r in rows], limit, next_cursor))


@router.get("/conversations/{cid}")
async def get_conversation(cid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await accessible(conn, vendor, member, cid)
        row = await conn.fetchrow(CONVERSATIONS + " AND c.id=$3", vendor, member["id"], cid)
    return ok(conversation(row))


@router.get("/messages")
async def messages(
    conversationId: UUID,
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    latest: bool = True,
):
    scope = {"vendor": str(vendor), "resource": "messages", "conversation": str(conversationId)}
    mark = rt.crypto.read_cursor(cursor, scope) if cursor else None
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await accessible(conn, vendor, member, conversationId)
        sql, args = (
            "SELECT * FROM messages WHERE vendor_id=$1 AND conversation_id=$2",
            [vendor, conversationId, limit + 1],
        )
        if mark:
            sql += " AND (created_at,id)<($4,$5)"
            args += [datetime.fromisoformat(mark["at"]), UUID(mark["id"])]
        rows = await conn.fetch(sql + " ORDER BY created_at DESC,id DESC LIMIT $3", *args)
    more, rows = len(rows) > limit, rows[:limit]
    next_cursor = (
        rt.crypto.cursor(
            {**scope, "at": rows[-1]["created_at"].isoformat(), "id": str(rows[-1]["id"])}
        )
        if more
        else None
    )
    return ok(page([message(r) for r in reversed(rows)], limit, next_cursor))


class Send(BaseModel):
    conversationId: UUID
    text: str = Field(min_length=1, max_length=4000)


@router.post("/messages", status_code=202)
async def send(
    data: Send,
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    key: Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=128)],
):
    text = data.text.strip()
    if not text:
        raise HTTPException(422, "Reply is empty")
    request_hash = hashlib.sha256(
        json.dumps(
            {"conversation": str(data.conversationId), "text": text}, sort_keys=True
        ).encode()
    ).hexdigest()
    key_hash = rt.crypto.digest("idempotency", key)
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        c = await accessible(conn, vendor, member, data.conversationId)
        idem = await conn.fetchrow(
            "INSERT INTO idempotency_keys(vendor_id,actor_scope,operation,key_hash,request_hash,expires_at) VALUES($1,$2,'messages.send',$3,$4,now()+interval '7 days') ON CONFLICT(vendor_id,actor_scope,operation,key_hash) DO UPDATE SET key_hash=excluded.key_hash RETURNING *",
            vendor,
            str(user.id),
            key_hash,
            request_hash,
        )
        if idem["request_hash"] != request_hash:
            raise HTTPException(409, "Idempotency key used for different reply")
        if idem["message_id"]:
            return ok(
                message(
                    await conn.fetchrow("SELECT * FROM messages WHERE id=$1", idem["message_id"])
                )
            )
        account = await conn.fetchrow(
            "SELECT * FROM channel_accounts WHERE id=$1", c["channel_account_id"]
        )
        if account["provider"] not in ("gmail", "whatsapp") or account["status"] != "connected":
            raise HTTPException(409, "Connect a channel before replying")
        parent = await conn.fetchrow(
            "SELECT * FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
            c["id"],
        )
        mid = uuid4()
        row = await conn.fetchrow(
            "INSERT INTO messages(id,vendor_id,conversation_id,sender,content,status,rfc_message_id,email_subject) VALUES($1,$2,$3,'vendor',$4,'queued',$5,$6) RETURNING *",
            mid,
            vendor,
            c["id"],
            text,
            f"<{mid}@selvora.invalid>",
            parent["email_subject"] if parent else "Your enquiry",
        )
        await conn.execute(
            "INSERT INTO message_deliveries(vendor_id,message_id,channel_account_id,dedupe_key) VALUES($1,$2,$3,$4)",
            vendor,
            mid,
            account["id"],
            str(mid),
        )
        await enqueue(
            conn,
            vendor,
            "send",
            str(mid),
            channel_account_id=account["id"],
            conversation_id=c["id"],
            message_id=mid,
        )
        response = json.dumps(message(row)).encode()
        await conn.execute(
            "UPDATE idempotency_keys SET message_id=$2,status='completed',response_ciphertext=$3,key_version=$4,http_status=202 WHERE id=$1",
            idem["id"],
            mid,
            rt.crypto.seal(response, f"{vendor}:idempotency"),
            rt.crypto.version,
        )
    await rt.queue.wake(vendor)
    return ok(message(row))


@router.post("/messages/{mid}/retry")
async def retry(mid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        m = await conn.fetchrow("SELECT * FROM messages WHERE id=$1 FOR UPDATE", mid)
        if not m or m["status"] != "failed":
            raise HTTPException(409, "Only failed messages can be retried")
        await accessible(conn, vendor, member, m["conversation_id"])
        job = await conn.fetchrow(
            "UPDATE jobs SET status='queued',run_at=now(),attempts=0,locked_until=NULL,lease_token=NULL WHERE message_id=$1 AND kind='send' AND status IN ('failed','dead') RETURNING id",
            mid,
        )
        if not job:
            raise HTTPException(409, "Message is still processing")
        if m["delivery_error_code"] != "DELIVERY_UNCERTAIN":
            await conn.execute(
                "UPDATE messages SET status='queued',delivery_error_code=NULL WHERE id=$1", mid
            )
    await rt.queue.wake(vendor)
    return ok({"id": str(mid)})


@router.post("/conversations/{cid}/read")
async def mark_read(cid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await accessible(conn, vendor, member, cid)
        await conn.execute(
            "INSERT INTO conversation_reads(vendor_id,conversation_id,member_id) VALUES($1,$2,$3) ON CONFLICT(vendor_id,conversation_id,member_id) DO UPDATE SET last_read_at=now()",
            vendor,
            cid,
            member["id"],
        )
    return await get_conversation(cid, rt, user, vendor)


class HumanMode(BaseModel):
    until: datetime | None


@router.patch("/conversations/{cid}/human-mode")
async def takeover(cid: UUID, data: HumanMode, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if data.until and (data.until.tzinfo is None or data.until <= datetime.now(UTC)):
        raise HTTPException(422, "Use a future timezone-aware expiry")
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await accessible(conn, vendor, member, cid)
        await conn.execute(
            "UPDATE conversations SET human_mode=$2,human_mode_until=$3 WHERE id=$1",
            cid,
            bool(data.until),
            data.until,
        )
    return await get_conversation(cid, rt, user, vendor)


@router.get("/channels")
async def channels(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, _):
        rows = await conn.fetch(
            "SELECT * FROM channel_accounts WHERE vendor_id=$1 AND NOT helper_account", vendor
        )
    result = [
        {
            "id": str(r["id"]),
            "vendorId": str(vendor),
            "channel": r["channel"],
            "displayName": r["display_name"],
            "status": r["status"],
            "ownAccount": True,
        }
        for r in rows
    ]
    if not any(r["channel"] == "whatsapp" for r in result):
        result.append(
            {
                "id": "whatsapp-unconnected",
                "vendorId": str(vendor),
                "channel": "whatsapp",
                "displayName": "WhatsApp Business",
                "status": "disconnected",
                "ownAccount": True,
            }
        )
    return ok(result)


class Connect(BaseModel):
    channel: str


@router.post("/channels/connections")
async def connect(data: Connect, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if data.channel == "whatsapp":
        from app.whatsapp.signup import begin

        async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (_, member):
            member_id = member["id"]
        return ok(await begin(rt, vendor, member_id))
    if data.channel != "email":
        raise HTTPException(501, "Only Gmail is connected in this pipeline")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (_, member):
        member_id = member["id"]
    return ok(await oauth.begin(rt, vendor, member_id))


@router.get("/channels/oauth/gmail/callback")
async def callback(rt: RuntimeDep, state: str = "", code: str = "", error: str = ""):
    if error or not code or not state:
        raise HTTPException(400, "Gmail authorization was cancelled")
    await oauth.complete(rt, state, code)
    return HTMLResponse(
        "<main><h1>Gmail connected</h1><p>Return to Selvora and refresh Channels. Initial email sync is queued.</p></main>"
    )


@router.post("/channels/connections/{attempt}/complete")
async def connection_status(attempt: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        row = await conn.fetchrow(
            "SELECT ca.* FROM channel_attempts a JOIN channel_accounts ca ON ca.id=a.channel_account_id AND ca.vendor_id=a.vendor_id WHERE a.id=$1 AND a.status='completed'",
            attempt,
        )
        if not row:
            raise HTTPException(409, "Complete Google authorization first")
    return ok(
        {
            "id": str(row["id"]),
            "vendorId": str(vendor),
            "channel": row["channel"],
            "displayName": row["display_name"],
            "status": row["status"],
            "ownAccount": True,
        }
    )


@router.post("/webhooks/gmail", status_code=202)
async def gmail_push(request: Request, rt: RuntimeDep):
    if int(request.headers.get("content-length", 0)) > 65536:
        raise HTTPException(413, "Push notification too large")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 65536:
            raise HTTPException(413, "Push notification too large")
    async with httpx.AsyncClient(timeout=10) as client:
        await oauth.verify_push(
            request.headers.get("authorization", "").removeprefix("Bearer "), rt.settings, client
        )
    try:
        from .crypto import unb64

        envelope = json.loads(raw)
        payload = json.loads(unb64(envelope["message"]["data"]))
        address = payload["emailAddress"].casefold()
        history = str(payload["historyId"])
        provider_id = str(envelope["message"]["messageId"])
        if not history.isdigit() or not provider_id or len(provider_id) > 256:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, "Invalid Gmail push notification") from None
    async with rt.db.transaction() as (conn, _):
        route = await conn.fetchrow(
            "SELECT * FROM b2_mailbox_route($1)", rt.crypto.digest("mailbox", address)
        )
    if not route:
        # Already-disconnected mailbox must not trigger endless Pub/Sub retries.
        return ok({"accepted": True})
    vendor, account = route["vendor_id"], route["account_id"]
    async with rt.db.transaction(vendor) as (conn, _):
        digest = hashlib.sha256(raw).hexdigest()
        event = await conn.fetchrow(
            "INSERT INTO webhook_events(vendor_id,channel_account_id,provider,provider_event_id,payload_ciphertext,key_version,payload_hash,signature_verified,expires_at) VALUES($1,$2,'email',$3,$4,$5,$6,true,now()+interval '7 days') ON CONFLICT DO NOTHING RETURNING id",
            vendor,
            account,
            provider_id,
            rt.crypto.seal(bytes(raw), f"{vendor}:{account}:webhook"),
            rt.crypto.version,
            digest,
        )
        if event:
            await enqueue(
                conn,
                vendor,
                "gmail_sync",
                f"push:{provider_id}",
                channel_account_id=account,
                webhook_event_id=event["id"],
            )
    await rt.queue.wake(vendor)
    return ok({"accepted": True})


@router.get("/jobs/dead")
async def dead_jobs(
    rt: RuntimeDep, user: UserDep, vendor: VendorDep, limit: int = Query(50, ge=1, le=100)
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        rows = await conn.fetch(
            "SELECT id,kind,last_error_code,attempts,run_at FROM jobs WHERE vendor_id=$1 AND status='dead' ORDER BY run_at DESC,id DESC LIMIT $2",
            vendor,
            limit,
        )
    return ok([dict(r) for r in rows])


class Merge(BaseModel):
    targetCustomerId: UUID | None


@router.patch("/customers/{source}/merge")
async def merge(source: UUID, data: Merge, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", f"merge:{vendor}"
        )
        previous = await conn.fetchval(
            "SELECT merged_into_id FROM customers WHERE id=$1 FOR UPDATE", source
        )
        row = await conn.fetchrow(
            "UPDATE customers SET merged_into_id=$2 WHERE id=$1 RETURNING id",
            source,
            data.targetCustomerId,
        )
        if not row:
            raise HTTPException(404, "Customer not found")
        await conn.execute(
            "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,source_customer_id,target_customer_id) VALUES($1,$2,$3,'customer',$4,$5)",
            vendor,
            user.id,
            "customer.merged" if data.targetCustomerId else "customer.unmerged",
            source,
            data.targetCustomerId or previous,
        )
    return ok(
        {
            "id": str(source),
            "mergedIntoId": str(data.targetCustomerId) if data.targetCustomerId else None,
        }
    )
