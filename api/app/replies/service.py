"""Transactional reply orchestration; providers only ever see verified outgoing text."""

import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.pipeline.jobs import enqueue

from .core import decide, verify
from .facts import cards, fingerprint, get_product_facts


def document(value):
    return json.loads(value) if isinstance(value, str) else value


def approval_reason(reason):
    return (
        reason
        if reason
        in (
            "discount_below_floor",
            "bulk_order",
            "complaint",
            "refund",
            "low_confidence",
            "unknown_intent",
            "unverified_facts",
        )
        else "unverified_facts"
        if reason in ("missing_facts", "stale_facts")
        else "unknown_intent"
    )


async def policy(conn, vendor):
    return await conn.fetchrow(
        "SELECT s.*,v.tone,v.auto_negotiation FROM business_settings s JOIN vendors v ON v.id=s.vendor_id WHERE s.vendor_id=$1 FOR SHARE OF s,v",
        vendor,
    )


async def make_approval(conn, vendor, inbound, sheet, text, reason, confidence):
    return await conn.fetchval(
        """INSERT INTO approvals(vendor_id,conversation_id,message_id,customer_message,facts,proposed_reply,reason,confidence,fact_snapshot,fact_hash,safety_reason)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11)
    ON CONFLICT(vendor_id,message_id) WHERE fact_snapshot IS NOT NULL DO UPDATE SET proposed_reply=excluded.proposed_reply,facts=excluded.facts,fact_snapshot=excluded.fact_snapshot,fact_hash=excluded.fact_hash,safety_reason=excluded.safety_reason,reason=excluded.reason
    RETURNING id""",
        vendor,
        inbound["conversation_id"],
        inbound["id"],
        inbound["content"],
        json.dumps(cards(sheet)),
        text,
        approval_reason(reason),
        confidence,
        json.dumps(sheet),
        fingerprint(sheet),
        reason,
    )


async def queue_reply(conn, vendor, inbound, text, sheet, *, approval=None):
    mid = uuid4()
    c = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1", inbound["conversation_id"])
    context = {
        "source_message_id": str(inbound["id"]),
        "source_text": inbound["voice_transcript"] or inbound["content"],
        "sheet": sheet,
        "hash": fingerprint(sheet),
        "approved": approval is not None,
    }
    await conn.execute(
        "INSERT INTO messages(id,vendor_id,conversation_id,sender,content,status,rfc_message_id,email_subject,reply_context,reply_to_message_id) VALUES($1,$2,$3,'ai',$4,'queued',$5,$6,$7::jsonb,$8)",
        mid,
        vendor,
        c["id"],
        text,
        f"<{mid}@selvora.invalid>",
        inbound["email_subject"] or "Your enquiry",
        json.dumps(context),
        inbound["id"],
    )
    await conn.execute(
        "INSERT INTO message_deliveries(vendor_id,message_id,channel_account_id,dedupe_key) VALUES($1,$2,$3,$4)",
        vendor,
        mid,
        c["channel_account_id"],
        str(mid),
    )
    await enqueue(
        conn,
        vendor,
        "send",
        str(mid),
        message_id=mid,
        conversation_id=c["id"],
        channel_account_id=c["channel_account_id"],
    )
    await conn.execute("UPDATE conversations SET last_message_id=$2 WHERE id=$1", c["id"], mid)
    return mid


async def process(conn, vendor, mid):
    # Same conversation lock serializes reply/approval/takeover and avoids parallel decisions.
    inbound = await conn.fetchrow("SELECT * FROM messages WHERE id=$1 AND sender='customer'", mid)
    if not inbound:
        return
    from app.extras.safety import allowed

    if not await allowed(conn, vendor, inbound["conversation_id"]):
        return
    c = await conn.fetchrow(
        "SELECT * FROM conversations WHERE id=$1 FOR UPDATE", inbound["conversation_id"]
    )
    inbound = await conn.fetchrow("SELECT * FROM messages WHERE id=$1", mid)
    if inbound["lane"] is not None:
        return
    settings = await policy(conn, vendor)
    if (
        not settings
        or not settings["reply_engine_enabled"]
        or inbound["created_at"] < settings["reply_engine_enabled_at"]
    ):
        return
    if c["status"] != "open":
        return
    if c["human_mode"] and (not c["human_mode_until"] or c["human_mode_until"] > datetime.now(UTC)):
        await conn.execute(
            "UPDATE messages SET lane='paused',lane_reason='human_takeover' WHERE id=$1", mid
        )
        return  # Never replay old human-handled enquiries on hand-back.
    from app.commerce.chat import handle as handle_order_chat

    if await handle_order_chat(conn, vendor, inbound):
        return
    source = inbound["voice_transcript"] or inbound["content"]
    sheet = await get_product_facts(conn, vendor, c["id"], source)
    decision = decide(
        source, sheet, settings["auto_intents"], settings["tone"], settings["auto_negotiation"]
    )
    await conn.execute(
        "UPDATE messages SET lane=$2,lane_reason=$3,detected_language=$4,detection_confidence=$5 WHERE id=$1",
        mid,
        decision.lane,
        decision.reason,
        decision.detection.language,
        decision.detection.confidence,
    )
    if decision.lane == "auto":
        await queue_reply(conn, vendor, inbound, decision.text, sheet)
    else:
        await make_approval(
            conn,
            vendor,
            inbound,
            sheet,
            decision.text,
            decision.reason,
            decision.detection.confidence,
        )


async def recheck(conn, vendor, message):
    """Immediately-before-send freshness check. Approvals do not bypass verification."""
    context = document(message["reply_context"])
    if context:
        source = context["source_text"]
    else:
        source = (
            await conn.fetchval(
                "SELECT coalesce(voice_transcript,content) FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
                message["conversation_id"],
            )
            or ""
        )
    sheet = await get_product_facts(conn, vendor, message["conversation_id"], source)
    if context and "negotiated_kobo" in context["sheet"]:
        settings = await policy(conn, vendor)
        decide(
            source, sheet, settings["auto_intents"], settings["tone"], settings["auto_negotiation"]
        )
    verdict = verify(message["content"], sheet)
    stale = bool(context and fingerprint(sheet) != context["hash"])
    if context and not context.get("approved"):
        settings = await policy(conn, vendor)
        if not settings or not settings["reply_engine_enabled"]:
            return False, "engine_disabled", sheet
        decision = decide(
            source, sheet, settings["auto_intents"], settings["tone"], settings["auto_negotiation"]
        )
        if decision.lane != "auto":
            return False, decision.reason, sheet
    return (
        not stale and verdict.safe,
        "stale_facts" if stale else "unverified_facts" if not verdict.safe else "verified",
        sheet,
    )


async def block_send(conn, vendor, message, reason, sheet):
    await conn.execute(
        "UPDATE messages SET status='blocked',delivery_error_code='UNVERIFIED_FACTS' WHERE id=$1",
        message["id"],
    )
    context = document(message["reply_context"])
    inbound = (
        await conn.fetchrow(
            "SELECT * FROM messages WHERE id=$1", UUID(context["source_message_id"])
        )
        if context
        else await conn.fetchrow(
            "SELECT * FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
            message["conversation_id"],
        )
    )
    if not inbound:
        inbound = message
    existing = await conn.fetchrow(
        "SELECT * FROM approvals WHERE vendor_id=$1 AND message_id=$2 AND fact_snapshot IS NOT NULL",
        vendor,
        inbound["id"],
    )
    if existing and existing["status"] != "pending":
        await conn.execute(
            "INSERT INTO approvals(vendor_id,conversation_id,message_id,customer_message,facts,proposed_reply,reason,fact_snapshot,fact_hash,safety_reason) VALUES($1,$2,$3,$4,$5::jsonb,$6,'unverified_facts',$7::jsonb,$8,$9) ON CONFLICT DO NOTHING",
            vendor,
            message["conversation_id"],
            message["id"],
            inbound["content"],
            json.dumps(cards(sheet)),
            message["content"],
            json.dumps(sheet),
            fingerprint(sheet),
            reason,
        )
    else:
        await make_approval(conn, vendor, inbound, sheet, message["content"], reason, 0)
