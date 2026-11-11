import hmac
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, accessible, ok
from app.pipeline.jobs import enqueue

from . import instructions, service, signup
from .cloud import signature

router = APIRouter(prefix="/v1")


@router.get("/webhooks/whatsapp")
async def verify(request: Request, rt: RuntimeDep):
    token = rt.settings.meta_verify_token.get_secret_value()
    q = request.query_params
    if (
        not token
        or q.get("hub.mode") != "subscribe"
        or not hmac.compare_digest(q.get("hub.verify_token", ""), token)
        or not q.get("hub.challenge", "").isdigit()
        or len(q.get("hub.challenge", "")) > 200
    ):
        raise HTTPException(403, "Webhook verification failed")
    return PlainTextResponse(q["hub.challenge"])


@router.post("/webhooks/whatsapp", status_code=202)
async def webhook(request: Request, rt: RuntimeDep):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 256 * 1024:
            raise HTTPException(413, "Webhook too large")
    if not signature(
        bytes(raw),
        request.headers.get("x-hub-signature-256"),
        rt.settings.meta_app_secret.get_secret_value(),
    ):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        data = json.loads(raw)
        if data.get("object") != "whatsapp_business_account":
            raise ValueError()
        entries = data.get("entry", [])
        if len(entries) > 100:
            raise ValueError()
        for entry in entries:
            for change in entry.get("changes", []):
                if change.get("field") == "messages":
                    await service.accept(rt, change["value"])
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(400, "Malformed WhatsApp webhook") from None
    return ok({"accepted": True, "sandbox": rt.settings.whatsapp_mode == "sandbox"})


class SignupComplete(BaseModel):
    code: str = Field(default="", max_length=4096)
    phoneNumberId: str = Field(default="", max_length=80)
    wabaId: str = Field(default="", max_length=80)


@router.post("/channels/whatsapp/signup/{attempt}/complete")
async def complete(
    attempt: UUID, data: SignupComplete, rt: RuntimeDep, user: UserDep, vendor: VendorDep
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (_, member):
        member_id = member["id"]
    return ok(await signup.complete(rt, vendor, member_id, attempt, data))


async def helper_dto(rt, vendor, member):
    async with rt.db.transaction(vendor) as (conn, _):
        row = await conn.fetchrow(
            "SELECT * FROM helper_links WHERE vendor_id=$1 AND member_id=$2 AND status IN ('pending','linked') ORDER BY created_at DESC LIMIT 1",
            vendor,
            member,
        )
    if not row or (row["status"] == "pending" and row["expires_at"] <= datetime.now(UTC)):
        return None
    raw = await rt.queue.redis.get("selvora:helper-view:" + str(row["id"]))
    code = (
        rt.crypto.open(bytes(raw), row["key_version"], f"{vendor}:helper-view").decode()
        if raw and row["status"] == "pending"
        else ""
    )
    return {
        "id": str(row["id"]),
        "code": code,
        "expiresAt": row["expires_at"].isoformat(),
        "status": row["status"],
        "helperNumber": rt.settings.whatsapp_helper_number or None,
        "sandbox": rt.settings.whatsapp_mode == "sandbox",
    }


@router.get("/channels/whatsapp/helper")
async def helper(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (_, member):
        member_id = member["id"]
    return ok(await helper_dto(rt, vendor, member_id))


@router.post("/channels/whatsapp/helper/codes")
async def new_code(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        if not rt.settings.whatsapp_helper_phone_id or not rt.settings.whatsapp_helper_number:
            raise HTTPException(503, "WhatsApp helper is not configured")
        # Serialize Redis issuance + DB bookkeeping for this member.
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            f"wa-code:{vendor}:{member['id']}",
        )
        binding = await service.codes(rt).issue(vendor, member["id"])
        await conn.execute(
            "UPDATE helper_links SET status='invalidated',linked_at=NULL,pending_proposal_id=NULL WHERE member_id=$1",
            member["id"],
        )
        await conn.execute(
            "INSERT INTO helper_links(id,vendor_id,member_id,code_hash,expires_at,created_at,key_version) VALUES($1,$2,$3,$4,$5,$5::timestamptz-interval '10 minutes',$6)",
            UUID(binding["id"]),
            vendor,
            member["id"],
            binding["hash"],
            datetime.fromtimestamp(binding["expires"], UTC),
            rt.crypto.version,
        )
        await rt.queue.redis.set(
            "selvora:helper-view:" + binding["id"],
            rt.crypto.seal(binding["code"].encode(), f"{vendor}:helper-view"),
            ex=600,
        )
        member_id = member["id"]
    return ok(await helper_dto(rt, vendor, member_id))


class TextInstruction(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post("/catalogue/text-proposals")
async def proposal(data: TextInstruction, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        return ok(await instructions.propose(conn, vendor, member["id"], data.text))


class ConfirmInstruction(BaseModel):
    productId: UUID


@router.post("/catalogue/text-proposals/{pid}/confirm")
async def confirm_instruction(
    pid: UUID, data: ConfirmInstruction, rt: RuntimeDep, user: UserDep, vendor: VendorDep
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        return ok(await instructions.confirm(conn, vendor, member["id"], pid, data.productId))


@router.get("/messages/{mid}/media")
async def private_media(mid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        msg = await conn.fetchrow("SELECT * FROM messages WHERE id=$1", mid)
        if not msg:
            raise HTTPException(404, "Media not found")
        await accessible(conn, vendor, member, msg["conversation_id"])
        event = await conn.fetchrow(
            "SELECT * FROM webhook_events WHERE vendor_id=$1 AND channel_account_id=$2 AND provider='whatsapp' AND provider_event_id=$3 AND expires_at>now()",
            vendor,
            msg["provider_account_id"],
            msg["provider_message_id"],
        )
        if not event or not event["media_ciphertext"]:
            raise HTTPException(404, "Media not found or expired")
        raw = rt.crypto.open(
            bytes(event["media_ciphertext"]),
            event["media_key_version"],
            f"{vendor}:{event['id']}:media",
        )
    return Response(
        raw,
        media_type=event["media_mime"],
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'attachment; filename="whatsapp-media"',
        },
    )


class TemplateSend(BaseModel):
    conversationId: UUID
    name: str = Field(pattern=r"^[a-z0-9_]{1,100}$")
    language: str = Field(pattern=r"^[A-Za-z_]{2,12}$")


@router.post("/channels/whatsapp/templates/send")
async def template_send(data: TemplateSend, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    # Explicit vendor action; never automatic conversion of a free-text AI reply.
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        conversation = await accessible(conn, vendor, member, data.conversationId)
        account = await conn.fetchrow(
            "SELECT * FROM channel_accounts WHERE id=$1 AND provider='whatsapp' AND NOT helper_account AND status='connected'",
            conversation["channel_account_id"],
        )
        if not account:
            raise HTTPException(409, "Connect WhatsApp first")
        mid = uuid4()
        await conn.execute(
            "INSERT INTO messages(id,vendor_id,conversation_id,sender,content,status,template_context) VALUES($1,$2,$3,'vendor',$4,'queued',$5::jsonb)",
            mid,
            vendor,
            data.conversationId,
            f"Approved WhatsApp template: {data.name} ({data.language})",
            json.dumps({"name": data.name, "language": data.language}),
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
            message_id=mid,
            conversation_id=data.conversationId,
            channel_account_id=account["id"],
        )
    await rt.queue.wake(vendor)
    return ok({"id": str(mid), "status": "queued"})


@router.get("/channels/whatsapp/{account}/templates")
async def approved_templates(account: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with (
        rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _),
        service.http_client(rt.settings) as client,
    ):
        cloud = await service.adapter(rt, conn, vendor, account, client)
        rows = await cloud.templates()
    return ok([{"name": row["name"], "language": row["language"]} for row in rows])
