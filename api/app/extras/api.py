import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, accessible, ok, page
from app.pipeline.jobs import enqueue

from . import safety, workflow

router = APIRouter(prefix="/v1")


async def audit(conn, vendor, user, action, entity, entity_id):
    await conn.execute(
        "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4,$5)",
        vendor,
        user,
        action,
        entity,
        entity_id,
    )


def customer(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "name": row["display_name"],
        "notes": row["notes"],
        "tags": list(row["tags"]),
        "flagged": row["flagged"],
        "email": row["email"],
        "phone": row["phone"],
        "city": row["city"],
        "language": row["language"],
        "createdAt": row["created_at"].isoformat(),
        "optedOutAt": row["opted_out_at"].isoformat() if row["opted_out_at"] else None,
    }


async def customer_access(conn, vendor, member, cid):
    row = await conn.fetchrow("SELECT * FROM customers WHERE id=$1", cid)
    if not row:
        raise HTTPException(404, "Customer not found")
    if member["role"] == "agent" and not await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE customer_id=$1 AND (assigned_member_id IS NULL OR assigned_member_id=$2))",
        cid,
        member["id"],
    ):
        raise HTTPException(403, "Customer is not assigned to you")
    return row


@router.get("/customers")
async def customers(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    search: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        rows = await conn.fetch(
            "SELECT * FROM customers c WHERE vendor_id=$1 AND ($2='' OR strpos(lower(display_name||' '||coalesce(city,'')||' '||notes||' '||array_to_string(tags,' ')),lower($2))>0) AND ($3<>'agent' OR EXISTS(SELECT 1 FROM conversations t WHERE t.customer_id=c.id AND (t.assigned_member_id IS NULL OR t.assigned_member_id=$4))) ORDER BY c.id LIMIT $5 OFFSET $6",
            vendor,
            search,
            member["role"],
            member["id"],
            limit + 1,
            offset,
        )
    result = page([customer(r) for r in rows[:limit]], limit)
    result.update(offset=offset, hasMore=len(rows) > limit)
    return ok(result)


@router.get("/customers/{cid}")
async def get_customer(cid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        return ok(customer(await customer_access(conn, vendor, member, cid)))


class Notes(BaseModel):
    notes: str = Field(max_length=2000)
    tags: list[str] = Field(max_length=10)
    flagged: bool


@router.patch("/customers/{cid}")
async def notes(cid: UUID, data: Notes, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if any(not t.strip() or len(t) > 30 for t in data.tags):
        raise HTTPException(422, "Tags must contain 1–30 characters")
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await customer_access(conn, vendor, member, cid)
        row = await conn.fetchrow(
            "UPDATE customers SET notes=$2,tags=$3,flagged=$4,updated_at=now() WHERE id=$1 RETURNING *",
            cid,
            data.notes,
            data.tags,
            data.flagged,
        )
        await audit(conn, vendor, user.id, "customer.notes.updated", "customer", cid)
    return ok(customer(row))


@router.post("/customers/{cid}/opt-out")
async def optout(cid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        await customer_access(conn, vendor, member, cid)
        await safety.opt_out(conn, vendor, cid)
        await audit(conn, vendor, user.id, "customer.opted_out", "customer", cid)
    return ok({"suppressed": True})


def followup(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "customerName": row.get("customer_name", ""),
        "conversationId": str(row["conversation_id"]),
        "scheduledAt": row["scheduled_at"].isoformat(),
        "sentAt": row["sent_at"].isoformat() if row["sent_at"] else None,
        "status": row["status"],
        "text": row["content"],
    }


def flag(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "customerName": row["customer_name"],
        "channel": row["channel"],
        "text": row["content"],
        "reason": row["reason"],
        "createdAt": row["created_at"].isoformat(),
        "status": row["status"],
    }


FLAG_SQL = "SELECT f.*,m.content,c.id cid,cu.display_name customer_name,a.channel FROM moderation_flags f JOIN messages m ON m.id=f.message_id JOIN conversations c ON c.id=m.conversation_id JOIN customers cu ON cu.id=c.customer_id JOIN channel_accounts a ON a.id=c.channel_account_id"


def restock(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "productId": str(row["product_id"]),
        "variantId": str(row["variant_id"]) if row["variant_id"] else None,
        "productName": row["product_name"],
        "customerName": row["customer_name"],
        "createdAt": row["created_at"].isoformat(),
        "status": row["status"],
    }


@router.get("/extras")
async def extras(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        settings = await conn.fetchrow("SELECT * FROM followup_settings WHERE vendor_id=$1", vendor)
        f = await conn.fetch(
            "SELECT f.*,c.display_name customer_name FROM followups f JOIN customers c ON c.id=f.customer_id ORDER BY f.created_at DESC LIMIT 100"
        )
        flags = await conn.fetch(FLAG_SQL + " ORDER BY f.created_at DESC LIMIT 100")
        r = await conn.fetch(
            "SELECT r.*,p.name||coalesce(' · '||v.name,'') product_name,c.display_name customer_name FROM restock_requests r JOIN products p ON p.id=r.product_id LEFT JOIN product_variants v ON v.id=r.variant_id JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at DESC LIMIT 100"
        )
    return ok(
        {
            "followupSettings": {
                "enabled": settings["enabled"] if settings else False,
                "afterHours": settings["after_hours"] if settings else 48,
                "style": settings["style"] if settings else "friendly",
            },
            "followups": [followup(x) for x in f],
            "flags": [flag(x) for x in flags],
            "restock": [restock(x) for x in r],
        }
    )


class FollowSettings(BaseModel):
    enabled: bool
    afterHours: int = Field(ge=24, le=720)
    style: Literal["friendly", "professional", "Pidgin-friendly"]


@router.patch("/extras/followups/settings")
async def configure(data: FollowSettings, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        await conn.execute(
            "INSERT INTO followup_settings(vendor_id,enabled,after_hours,style) VALUES($1,$2,$3,$4) ON CONFLICT(vendor_id) DO UPDATE SET enabled=excluded.enabled,after_hours=excluded.after_hours,style=excluded.style",
            vendor,
            data.enabled,
            data.afterHours,
            data.style,
        )
        if not data.enabled:
            await conn.execute("UPDATE followups SET status='cancelled' WHERE status='scheduled'")
        await audit(conn, vendor, user.id, "followups.settings.updated", "vendor", vendor)
    return ok(data.model_dump())


class Template(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9_]{1,100}$")
    language: str = Field(pattern=r"^[A-Za-z_]{2,12}$")


class Schedule(BaseModel):
    conversationId: UUID
    consentMessageId: UUID
    template: Template | None = None


@router.post("/extras/followups")
async def schedule(data: Schedule, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        await accessible(conn, vendor, member, data.conversationId)
        f = await workflow.schedule(
            conn,
            vendor,
            data.conversationId,
            data.consentMessageId,
            data.template.model_dump() if data.template else None,
        )
    await rt.queue.wake(vendor)
    return ok(followup(f))


class FollowAction(BaseModel):
    action: Literal["cancel"]


@router.patch("/extras/followups/{fid}")
async def cancel(fid: UUID, data: FollowAction, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        row = await conn.fetchrow(
            "UPDATE followups SET status=CASE WHEN status='scheduled' THEN 'cancelled' ELSE status END WHERE id=$1 RETURNING *",
            fid,
        )
        if not row:
            raise HTTPException(404, "Follow-up not found")
        await audit(conn, vendor, user.id, "followup.cancelled", "followup", fid)
    return ok(followup(row))


class Moderate(BaseModel):
    action: Literal["not_spam", "block"]


@router.patch("/extras/flags/{fid}")
async def moderate(fid: UUID, data: Moderate, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        row = await conn.fetchrow(FLAG_SQL + " WHERE f.id=$1 FOR UPDATE OF f", fid)
        if not row:
            raise HTTPException(404, "Flag not found")
        if row["status"] == "blocked" and data.action == "not_spam":
            raise HTTPException(
                409, "Blocked contacts require separate review; this action cannot unblock"
            )
        state = "cleared" if data.action == "not_spam" else "blocked"
        await conn.execute(
            "UPDATE moderation_flags SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1",
            fid,
            state,
            member["id"],
        )
        if data.action == "block":
            await conn.execute(
                "INSERT INTO blocked_identities(vendor_id,identity_id,flag_id,blocked_by) SELECT $1,i.id,$2,$3 FROM customer_identities i JOIN conversations c ON c.customer_id=i.customer_id AND c.channel_account_id=i.channel_account_id WHERE c.id=$4 ON CONFLICT(vendor_id,identity_id) DO UPDATE SET active=true",
                vendor,
                fid,
                member["id"],
                row["cid"],
            )
        else:
            await conn.execute(
                "UPDATE messages SET lane=NULL,lane_reason=NULL WHERE id=$1 AND lane_reason='moderation_review'",
                row["message_id"],
            )
            await enqueue(
                conn,
                vendor,
                "reply",
                "cleared:" + str(fid),
                message_id=row["message_id"],
                conversation_id=row["cid"],
            )
        await audit(conn, vendor, user.id, "moderation." + state, "message", row["message_id"])
        result = await conn.fetchrow(FLAG_SQL + " WHERE f.id=$1", fid)
    await rt.queue.wake(vendor)
    return ok(flag(result))


class RestockSubscribe(Schedule):
    productId: UUID
    variantId: UUID | None = None


@router.post("/extras/restock")
async def subscribe(data: RestockSubscribe, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        c = await accessible(conn, vendor, member, data.conversationId)
        consent = await conn.fetchrow(
            "SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND sender='customer'",
            data.consentMessageId,
            c["id"],
        )
        p = await conn.fetchrow(
            "SELECT * FROM products WHERE id=$1 AND NOT archived", data.productId
        )
        v = (
            await conn.fetchrow(
                "SELECT * FROM product_variants WHERE id=$1 AND product_id=$2",
                data.variantId,
                data.productId,
            )
            if data.variantId
            else None
        )
        if not p or (data.variantId and not v):
            raise HTTPException(404, "Product/variant not found")
        if (
            not consent
            or not workflow.CONSENT.search(consent["content"])
            or p["name"].casefold() not in consent["content"].casefold()
            or (v and v["name"].casefold() not in consent["content"].casefold())
            or not await safety.allowed(conn, vendor, c["id"])
        ):
            raise HTTPException(409, "Recorded customer opt-in naming the item is required")
        identity = await conn.fetchval(
            "SELECT id FROM customer_identities WHERE customer_id=$1 AND channel_account_id=$2",
            c["customer_id"],
            c["channel_account_id"],
        )
        if not identity:
            raise HTTPException(409, "Customer identity unavailable")
        rid = await conn.fetchval(
            "INSERT INTO restock_requests(vendor_id,product_id,variant_id,customer_id,identity_id,conversation_id,consent_at,template_context) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING id",
            vendor,
            p["id"],
            data.variantId,
            c["customer_id"],
            identity,
            c["id"],
            consent["created_at"],
            json.dumps(data.template.model_dump()) if data.template else None,
        )
        if not rid:
            rid = await conn.fetchval(
                "SELECT id FROM restock_requests WHERE customer_id=$1 AND product_id=$2 AND variant_id IS NOT DISTINCT FROM $3 AND status='waiting'",
                c["customer_id"],
                p["id"],
                data.variantId,
            )
    await rt.queue.wake(vendor)
    return ok({"id": str(rid), "status": "waiting"})


@router.post("/extras/restock/{rid}")
async def notify_restock(rid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        r = await conn.fetchrow("SELECT * FROM restock_requests WHERE id=$1", rid)
        if not r or not r["consent_at"]:
            raise HTTPException(409, "Opted-in restock request required")
        await enqueue(
            conn,
            vendor,
            "restock",
            "manual-restock:" + str(rid),
            restock_request_id=rid,
            conversation_id=r["conversation_id"],
        )
    await rt.queue.wake(vendor)
    return ok({"id": str(rid), "status": r["status"], "queued": True})


class Stage(BaseModel):
    stage: Literal["new", "interested", "ready_to_pay", "paid", "cold"]


@router.patch("/conversations/{cid}/stage")
async def stage(cid: UUID, data: Stage, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if data.stage == "paid":
        raise HTTPException(409, "Only verified payment can mark paid")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        await accessible(conn, vendor, member, cid)
        await conn.execute(
            "UPDATE conversations SET stage=$2,revision=revision+1 WHERE id=$1", cid, data.stage
        )
    return ok({"id": str(cid), "stage": data.stage})


@router.get("/notifications")
async def notifications(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        rows = await conn.fetch(
            "SELECT * FROM notifications WHERE member_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
            member["id"],
            limit + 1,
            offset,
        )
    return ok(
        {
            "items": [dict(r) for r in rows[:limit]],
            "hasMore": len(rows) > limit,
            "offset": offset,
            "limit": limit,
        }
    )


@router.patch("/notifications/{nid}")
async def read_notification(nid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        row = await conn.fetchrow(
            "UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND member_id=$2 RETURNING id",
            nid,
            member["id"],
        )
        if not row:
            raise HTTPException(404, "Notification not found")
    return ok({"id": str(nid), "read": True})


@router.get("/team")
async def team(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        members = await conn.fetch(
            "SELECT id,vendor_id,name,coalesce(member_email,'') email,role,status FROM vendor_members WHERE status='active'"
        )
        invites = await conn.fetch(
            "SELECT id,vendor_id,name,email,role,'invited' status,delivery_status FROM team_invitations WHERE status='pending' AND expires_at>now()"
        )
    return ok([dict(r) for r in [*members, *invites]])


class Invite(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    role: Literal["agent", "manager"]


@router.post("/team/invitations")
async def invite(data: Invite, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if (
        not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", data.email)
        or "\n" in data.name
        or "\r" in data.name
    ):
        raise HTTPException(422, "Invalid invitation")
    if (
        not rt.settings.email_api_key.get_secret_value()
        or not rt.settings.email_from
        or not rt.settings.public_web_url.startswith("https://")
    ):
        raise HTTPException(503, "Invitation email service/public HTTPS origin is not configured")
    token = secrets.token_urlsafe(32)
    iid = uuid4()
    async with rt.db.transaction(vendor, user.id, ("owner",)) as (conn, member):
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            "invite:" + str(vendor) + ":" + data.email.lower(),
        )
        await conn.execute(
            "UPDATE team_invitations SET status='revoked' WHERE email=$1 AND status='pending'",
            data.email.strip().lower(),
        )
        await conn.execute(
            "INSERT INTO team_invitations(id,vendor_id,email,name,role,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
            iid,
            vendor,
            data.email.strip().lower(),
            data.name,
            data.role,
            member["id"],
            datetime.now(UTC) + timedelta(days=7),
        )
        await conn.execute(
            "INSERT INTO invitation_secrets(vendor_id,invitation_id,token_hash,token_ciphertext,key_version) VALUES($1,$2,$3,$4,$5)",
            vendor,
            iid,
            rt.crypto.digest("invite", token),
            rt.crypto.seal(token.encode(), f"{vendor}:invite:{iid}"),
            rt.crypto.version,
        )
        await enqueue(conn, vendor, "invitation_email", str(iid), invitation_id=iid)
        await audit(conn, vendor, user.id, "team.invited", "invitation", iid)
    await rt.queue.wake(vendor)
    return ok(
        {
            "id": str(iid),
            "vendorId": str(vendor),
            "name": data.name,
            "email": data.email,
            "role": data.role,
            "status": "invited",
            "deliveryStatus": "queued",
        }
    )


class Accept(BaseModel):
    token: str = Field(min_length=32, max_length=200)


@router.post("/team/invitations/accept")
async def accept(data: Accept, rt: RuntimeDep, user: UserDep):
    if not user.email or not user.email_confirmed_at:
        raise HTTPException(403, "Sign in with the verified invited email")
    async with rt.db.transaction() as (conn, _):
        route = await conn.fetchrow(
            "SELECT * FROM b7_invite_route($1)", rt.crypto.digest("invite", data.token)
        )
    if not route:
        raise HTTPException(409, "Invitation expired or revoked")
    vendor = route["vendor_id"]
    async with rt.db.transaction(vendor) as (conn, _):
        i = await conn.fetchrow(
            "SELECT * FROM team_invitations WHERE id=$1 FOR UPDATE", route["invitation_id"]
        )
        if i["email"] != user.email.strip().lower():
            raise HTTPException(403, "This invitation belongs to another email")
        active = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM vendor_members WHERE id=$1 AND role='owner' AND status='active')",
            i["invited_by"],
        )
        if not active:
            raise HTTPException(409, "Inviter no longer authorized")
        existing = await conn.fetchrow(
            "SELECT * FROM vendor_members WHERE vendor_id=$1 AND user_id=$2 FOR UPDATE",
            vendor,
            user.id,
        )
        if existing and existing["status"] != "active":
            raise HTTPException(403, "Suspended membership cannot be reactivated by invitation")
        if i["status"] == "accepted" and (
            not existing or i["accepted_member_id"] != existing["id"]
        ):
            raise HTTPException(409, "Invitation already used")
        member = (
            existing["id"]
            if existing
            else await conn.fetchval(
                "INSERT INTO vendor_members(vendor_id,user_id,role,name,member_email) VALUES($1,$2,$3,$4,$5) RETURNING id",
                vendor,
                user.id,
                i["role"],
                i["name"],
                i["email"],
            )
        )
        if i["status"] != "accepted":
            await conn.execute(
                "UPDATE team_invitations SET status='accepted',accepted_member_id=$2 WHERE id=$1",
                i["id"],
                member,
            )
            await audit(conn, vendor, user.id, "team.invitation.accepted", "invitation", i["id"])
    return ok({"vendorId": str(vendor), "memberId": str(member)})


class Role(BaseModel):
    role: Literal["agent", "manager"]


@router.patch("/team/{mid}/role")
async def role(mid: UUID, data: Role, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner",)) as (conn, _):
        row = await conn.fetchrow(
            "UPDATE vendor_members SET role=$2 WHERE id=$1 AND role<>'owner' AND status='active' RETURNING *",
            mid,
            data.role,
        )
        if not row:
            raise HTTPException(409, "Active non-owner membership required")
        await audit(conn, vendor, user.id, "team.role.changed", "member", mid)
    return ok(
        {
            "id": str(mid),
            "vendorId": str(vendor),
            "name": row["name"],
            "email": row["member_email"] or "",
            "role": row["role"],
            "status": row["status"],
        }
    )


class Assignment(BaseModel):
    memberId: UUID | None


@router.patch("/conversations/{cid}/assignment")
async def assign(cid: UUID, data: Assignment, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        await accessible(conn, vendor, member, cid)
        if data.memberId and not await conn.fetchval(
            "SELECT id FROM vendor_members WHERE id=$1 AND status='active'", data.memberId
        ):
            raise HTTPException(409, "Active member in this workspace required")
        await conn.execute(
            "UPDATE conversations SET assigned_member_id=$2,revision=revision+1 WHERE id=$1",
            cid,
            data.memberId,
        )
        await audit(conn, vendor, user.id, "conversation.assigned", "conversation", cid)
        from app.pipeline.api import get_conversation
    return await get_conversation(cid, rt, user, vendor)


@router.get("/team/audit")
async def audit_log(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        rows = await conn.fetch(
            "SELECT a.*,coalesce(m.name,'System') actor_name FROM audit_log a LEFT JOIN vendor_members m ON m.vendor_id=a.vendor_id AND m.user_id=a.actor_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2",
            limit,
            offset,
        )
    return ok(
        [
            {
                "id": str(r["id"]),
                "vendorId": str(vendor),
                "actorName": r["actor_name"],
                "action": r["action"],
                "subject": r["entity_type"] + ":" + str(r["entity_id"] or ""),
                "at": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    )


@router.get("/business/export")
async def export_business(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    # Explicit allowlist: never export credentials, encrypted identities, webhook bodies,
    # invitation tokens, private media bytes or other members' authentication data.
    tables = (
        "customers",
        "conversations",
        "messages",
        "orders",
        "order_items",
        "products",
        "product_variants",
        "followups",
        "restock_requests",
        "moderation_flags",
        "notifications",
        "audit_log",
    )
    excluded = {"media_ciphertext", "media_storage_key", "media_key_version"}
    async with rt.db.transaction(vendor, user.id, ("owner",), allow_closed=True) as (conn, _):
        data = {}
        for table in tables:
            rows = await conn.fetch(f"SELECT * FROM {table} WHERE vendor_id=$1 LIMIT 10001", vendor)
            if len(rows) > 10000:
                raise HTTPException(
                    413,
                    "Use an operator-assisted paginated export for this business; no partial export returned",
                )
            data[table] = [
                {
                    k: v
                    for k, v in dict(row).items()
                    if k not in excluded and not isinstance(v, bytes)
                }
                for row in rows
            ]
        await audit(conn, vendor, user.id, "business.exported", "vendor", vendor)
    return ok({"vendorId": str(vendor), "generatedAt": datetime.now(UTC), "data": data})


class DeleteRequest(BaseModel):
    confirmation: Literal["DELETE MY BUSINESS"]


@router.post("/business/deletion")
async def delete_business(data: DeleteRequest, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    # Deliberately a request, not a false claim of physical erasure. Receipts and
    # payment evidence need a reviewed retention policy before deletion execution.
    async with rt.db.transaction(vendor, user.id, ("owner",), allow_closed=True) as (conn, _):
        await conn.execute(
            "UPDATE vendors SET deletion_requested_at=coalesce(deletion_requested_at,now()),deletion_state='requested' WHERE id=$1",
            vendor,
        )
        await conn.execute("UPDATE followups SET status='cancelled' WHERE status='scheduled'")
        await conn.execute("UPDATE restock_requests SET status='cancelled' WHERE status='waiting'")
        await conn.execute("UPDATE team_invitations SET status='revoked' WHERE status='pending'")
        await conn.execute("UPDATE channel_accounts SET status='disconnected'")
        await audit(conn, vendor, user.id, "business.deletion.requested", "vendor", vendor)
    return ok(
        {
            "status": "requested",
            "automationDisabled": True,
            "physicallyDeleted": False,
            "retentionReviewRequired": True,
        }
    )
