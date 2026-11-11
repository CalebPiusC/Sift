import json
import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException

from app.pipeline.jobs import enqueue

from .safety import allowed

FOLLOW_TEXT = "Hello again. Would you still like help with your enquiry? Reply STOP to opt out."
CONSENT = re.compile(
    r"\b(?:yes[, ]+)?(?:you can follow up|follow up with me|remind me|notify me|let me know when)\b",
    re.IGNORECASE,
)


def doc(value):
    return json.loads(value) if isinstance(value, str) else value


async def schedule(conn, vendor, cid, consent_mid, template=None):
    c = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1 FOR UPDATE", cid)
    s = await conn.fetchrow("SELECT * FROM followup_settings WHERE vendor_id=$1", vendor)
    consent = await conn.fetchrow(
        "SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND sender='customer'",
        consent_mid,
        cid,
    )
    latest = await conn.fetchrow(
        "SELECT * FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
        cid,
    )
    if (
        not c
        or c["stage"] != "cold"
        or c["status"] != "open"
        or not s
        or not s["enabled"]
        or not consent
        or not CONSENT.search(consent["content"])
        or not latest
        or not await allowed(conn, vendor, cid)
    ):
        raise HTTPException(
            409, "Cold open lead, recorded customer consent and enabled follow-ups required"
        )
    if await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND payment_status='paid')",
        c["customer_id"],
    ):
        raise HTTPException(409, "Customer has purchased; follow-up stopped")
    return await conn.fetchrow(
        "INSERT INTO followups(vendor_id,conversation_id,customer_id,scheduled_at,message_style,content,consent_at,source_message_id,dedupe_key,template_context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(vendor_id,dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING *",
        vendor,
        cid,
        c["customer_id"],
        max(datetime.now(UTC), latest["created_at"] + timedelta(hours=s["after_hours"])),
        s["style"],
        FOLLOW_TEXT,
        consent["created_at"],
        latest["id"],
        "follow:" + str(latest["id"]),
        json.dumps(template) if template else None,
    )


async def valid_followup(conn, vendor, f):
    if (
        not f
        or f["status"] != "scheduled"
        or not f["consent_at"]
        or f["opt_out_at"]
        or not await allowed(conn, vendor, f["conversation_id"])
    ):
        return False
    c = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1", f["conversation_id"])
    latest = await conn.fetchval(
        "SELECT id FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
        f["conversation_id"],
    )
    enabled = await conn.fetchval(
        "SELECT enabled FROM followup_settings WHERE vendor_id=$1", vendor
    )
    purchased = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id=$1 AND payment_status='paid')",
        f["customer_id"],
    )
    return bool(
        enabled
        and c["stage"] == "cold"
        and c["status"] == "open"
        and not purchased
        and (not f["source_message_id"] or latest == f["source_message_id"])
    )


async def stock(conn, r):
    p = await conn.fetchrow("SELECT * FROM products WHERE id=$1 AND NOT archived", r["product_id"])
    if not p:
        return None
    if r["variant_id"]:
        v = await conn.fetchrow(
            "SELECT * FROM product_variants WHERE id=$1 AND product_id=$2", r["variant_id"], p["id"]
        )
        if not v or v["stock_count"] is None or v["stock_count"] <= 0:
            return None
        return p["name"] + " · " + v["name"]
    if await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM product_variants WHERE product_id=$1)", p["id"]
    ):
        return None
    return p["name"] if p["stock_count"] is not None and p["stock_count"] > 0 else None


async def queue_notice(
    conn, vendor, cid, text, context, template=None, followup=None, restock=None
):
    if not await allowed(conn, vendor, cid):
        raise HTTPException(409, "Contact suppressed")
    c = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1 FOR UPDATE", cid)
    provider = await conn.fetchval(
        "SELECT provider FROM channel_accounts WHERE id=$1", c["channel_account_id"]
    )
    if provider not in ("gmail", "whatsapp"):
        raise HTTPException(409, "Platform adapter unavailable; no send queued")
    if (
        provider == "whatsapp"
        and (
            not c["last_customer_at"]
            or c["last_customer_at"] <= datetime.now(UTC) - timedelta(hours=24)
        )
        and not template
    ):
        raise HTTPException(409, "Outside WhatsApp window; approved fixed template required")
    mid = uuid4()
    await conn.execute(
        "INSERT INTO messages(id,vendor_id,conversation_id,sender,content,status,rfc_message_id,extras_context,template_context) VALUES($1,$2,$3,'ai',$4,'queued',$5,$6::jsonb,$7::jsonb)",
        mid,
        vendor,
        cid,
        text,
        f"<{mid}@selvora.invalid>",
        json.dumps(context),
        json.dumps(template) if template else None,
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
        conversation_id=cid,
        channel_account_id=c["channel_account_id"],
        followup_id=followup,
        restock_request_id=restock,
    )
    return mid


async def followup(worker, job):
    async with worker.db.transaction(job["vendor_id"]) as (conn, _):
        f = await conn.fetchrow(
            "SELECT * FROM followups WHERE id=$1 FOR UPDATE", job["followup_id"]
        )
        if not await valid_followup(conn, job["vendor_id"], f):
            return
        if f["message_id"]:
            return
        if f["scheduled_at"] > datetime.now(UTC):
            from app.pipeline.worker import Deferred

            raise Deferred(f["scheduled_at"])
        mid = await queue_notice(
            conn,
            job["vendor_id"],
            f["conversation_id"],
            FOLLOW_TEXT,
            {"kind": "followup", "id": str(f["id"])},
            doc(f["template_context"]),
            followup=f["id"],
        )
        await conn.execute("UPDATE followups SET message_id=$2 WHERE id=$1", f["id"], mid)


async def restock(worker, job):
    async with worker.db.transaction(job["vendor_id"]) as (conn, _):
        r = await conn.fetchrow(
            "SELECT * FROM restock_requests WHERE id=$1 FOR UPDATE", job["restock_request_id"]
        )
        if (
            not r
            or r["status"] != "waiting"
            or not r["consent_at"]
            or not r["conversation_id"]
            or r["message_id"]
        ):
            return
        name = await stock(conn, r)
        if not name or not await allowed(conn, job["vendor_id"], r["conversation_id"]):
            return
        text = f"Back in stock: {name}. Reply STOP to opt out."
        mid = await queue_notice(
            conn,
            job["vendor_id"],
            r["conversation_id"],
            text,
            {"kind": "restock", "id": str(r["id"])},
            doc(r["template_context"]),
            restock=r["id"],
        )
        await conn.execute("UPDATE restock_requests SET message_id=$2 WHERE id=$1", r["id"], mid)


async def validate(conn, vendor, row):
    context = doc(row["extras_context"])
    if context["kind"] == "followup":
        f = await conn.fetchrow(
            "SELECT * FROM followups WHERE id=$1", __import__("uuid").UUID(context["id"])
        )
        return await valid_followup(conn, vendor, f) and row["content"] == FOLLOW_TEXT
    r = await conn.fetchrow(
        "SELECT * FROM restock_requests WHERE id=$1", __import__("uuid").UUID(context["id"])
    )
    if not r or r["status"] != "waiting" or not r["consent_at"]:
        return False
    name = await stock(conn, r)
    return bool(name and row["content"] == f"Back in stock: {name}. Reply STOP to opt out.")
