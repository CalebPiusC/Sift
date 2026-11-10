import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, accessible, ok, page

from .core import AUTO, decide, verify
from .facts import cards, fingerprint, get_product_facts
from .service import document, policy, queue_reply

router = APIRouter(prefix="/v1")


def approval(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "conversationId": str(row["conversation_id"]),
        "messageId": str(row["message_id"]),
        "customerMessage": row["customer_message"],
        "facts": document(row["facts"]),
        "proposedReply": row["proposed_reply"],
        "reason": row["reason"],
        "safetyReason": row["safety_reason"],
        "confidence": float(row["confidence"]),
        "status": row["status"],
        "createdAt": row["created_at"].isoformat(),
        "holdingReplyDueAt": row["holding_reply_due_at"].isoformat(),
        "holdingReplySentAt": row["holding_reply_sent_at"].isoformat()
        if row["holding_reply_sent_at"]
        else None,
    }


@router.get("/approvals")
async def approvals(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    status: str = "pending",
    limit: int = Query(100, ge=1, le=100),
):
    if status not in ("pending", "sent", "edited", "rejected"):
        raise HTTPException(422, "Invalid approval status")
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        rows = await conn.fetch(
            "SELECT a.* FROM approvals a JOIN conversations c ON c.id=a.conversation_id AND c.vendor_id=a.vendor_id WHERE a.vendor_id=$1 AND a.status=$2 AND ($3::text<>'agent' OR c.assigned_member_id IS NULL OR c.assigned_member_id=$4) ORDER BY a.created_at DESC,a.id DESC LIMIT $5",
            vendor,
            status,
            member["role"],
            member["id"],
            limit,
        )
    return ok(page([approval(r) for r in rows], limit))


class DecisionInput(BaseModel):
    action: str
    editedReply: str | None = Field(default=None, max_length=4000)


@router.post("/approvals/{aid}/decision")
async def decision(
    aid: UUID, data: DecisionInput, rt: RuntimeDep, user: UserDep, vendor: VendorDep
):
    if data.action not in ("send", "edit", "reject"):
        raise HTTPException(422, "Invalid decision")
    stale = False
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        # Conversation first: same lock order as worker/takeover.
        cid = await conn.fetchval("SELECT conversation_id FROM approvals WHERE id=$1", aid)
        if not cid:
            raise HTTPException(404, "Approval not found")
        await conn.fetchrow("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", cid)
        await accessible(conn, vendor, member, cid)
        row = await conn.fetchrow("SELECT * FROM approvals WHERE id=$1 FOR UPDATE", aid)
        if row["status"] != "pending":
            if row["decision_action"] == data.action and (
                data.action != "edit" or row["proposed_reply"] == data.editedReply
            ):
                return ok(approval(row))
            raise HTTPException(409, "Approval already decided")
        if data.action != "reject":
            inbound = await conn.fetchrow("SELECT * FROM messages WHERE id=$1", row["message_id"])
            # Re-review of a blocked outgoing message uses its original incoming context.
            context = document(inbound["reply_context"])
            if context:
                inbound = await conn.fetchrow(
                    "SELECT * FROM messages WHERE id=$1", UUID(context["source_message_id"])
                )
            source = inbound["voice_transcript"] or inbound["content"]
            sheet = await get_product_facts(conn, vendor, cid, source)
            settings = await policy(conn, vendor)
            previous = document(row["fact_snapshot"])
            if previous and "negotiated_kobo" in previous:
                decide(
                    source,
                    sheet,
                    settings["auto_intents"],
                    settings["tone"],
                    settings["auto_negotiation"],
                )
            text = (data.editedReply if data.action == "edit" else row["proposed_reply"]) or ""
            stale = bool(not row["fact_hash"] or fingerprint(sheet) != row["fact_hash"])
            if stale:
                await conn.execute(
                    "UPDATE approvals SET facts=$2::jsonb,fact_snapshot=$3::jsonb,fact_hash=$4,safety_reason='stale_facts' WHERE id=$1",
                    aid,
                    json.dumps(cards(sheet)),
                    json.dumps(sheet),
                    fingerprint(sheet),
                )
            else:
                if not verify(text, sheet).safe:
                    raise HTTPException(
                        409,
                        "Reply contains unsupported claims. Edit using the current facts; nothing was sent.",
                    )
                mid = await queue_reply(conn, vendor, inbound, text.strip(), sheet, approval=aid)
                await conn.execute(
                    "UPDATE approvals SET outgoing_message_id=$2,proposed_reply=$3 WHERE id=$1",
                    aid,
                    mid,
                    text.strip(),
                )
        if not stale:
            row = await conn.fetchrow(
                "UPDATE approvals SET status=$2,decision_action=$3,decided_at=now(),decided_by=$4 WHERE id=$1 RETURNING *",
                aid,
                "rejected"
                if data.action == "reject"
                else "edited"
                if data.action == "edit"
                else "sent",
                data.action,
                member["id"],
            )
            await conn.execute(
                "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,'approval',$4)",
                vendor,
                user.id,
                "approval." + data.action,
                aid,
            )
    if stale:
        raise HTTPException(
            409, "Facts changed. The card has refreshed; review it again before sending."
        )
    await rt.queue.wake(vendor)
    return ok(approval(row))


class ReplySettings(BaseModel):
    enabled: bool
    autoIntents: list[str]
    autoNegotiation: bool = False
    tone: str = "friendly"


@router.patch("/settings/reply-engine")
async def settings(data: ReplySettings, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if data.tone not in ("friendly", "professional", "Pidgin-friendly"):
        raise HTTPException(422, "Unsupported tone")
    if not set(data.autoIntents) <= AUTO:
        raise HTTPException(422, "Only supported safe intents may be automatic")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        await conn.execute(
            "INSERT INTO business_settings(vendor_id,reply_engine_enabled,auto_intents) VALUES($1,$2,$3) ON CONFLICT(vendor_id) DO UPDATE SET reply_engine_enabled=excluded.reply_engine_enabled,auto_intents=excluded.auto_intents",
            vendor,
            data.enabled,
            data.autoIntents,
        )
        await conn.execute(
            "UPDATE vendors SET auto_negotiation=$2,tone=$3 WHERE id=$1",
            vendor,
            data.autoNegotiation,
            data.tone,
        )
    return ok(data.model_dump())


@router.get("/settings/reply-engine")
async def get_settings(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, _):
        s = await policy(conn, vendor)
        if not s:
            raise HTTPException(409, "Business settings must be initialized")
        return ok(
            {
                "enabled": s["reply_engine_enabled"],
                "autoIntents": s["auto_intents"],
                "autoNegotiation": s["auto_negotiation"],
                "tone": s["tone"],
            }
        )
