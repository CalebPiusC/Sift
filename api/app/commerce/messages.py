import json
import time
from uuid import UUID, uuid4

from app.pipeline.jobs import enqueue
from app.replies.core import naira, verify
from app.replies.facts import get_product_facts

from . import receipts

TEXTS = {
    "draft": "Your draft order is ready.",
    "awaiting_payment": "Your order is awaiting payment.",
    "paid": "Payment received for your order. Thank you. Please share any additional instructions. The team will confirm the next steps.",
    "preparing": "Your order is being prepared.",
    "out_for_delivery": "Your order is out for delivery.",
    "delivered": "Your order has been delivered. Thank you.",
    "cancelled": "Your order has been cancelled.",
}


async def queue(conn, vendor, cid, text, order, collection=False):
    mid = uuid4()
    c = await conn.fetchrow("SELECT * FROM conversations WHERE id=$1", cid)
    parent = await conn.fetchrow(
        "SELECT * FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
        cid,
    )
    context = {
        "order_id": str(order["id"]) if order else None,
        "status": order["status"] if order else None,
        "collection": collection,
        "text": text,
    }
    await conn.execute(
        "INSERT INTO messages(id,vendor_id,conversation_id,sender,content,status,rfc_message_id,email_subject,commerce_context) VALUES($1,$2,$3,'ai',$4,'queued',$5,$6,$7::jsonb)",
        mid,
        vendor,
        cid,
        text,
        f"<{mid}@selvora.invalid>",
        parent["email_subject"] if parent else "Your order",
        json.dumps(context),
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
    )
    await conn.execute("UPDATE conversations SET last_message_id=$2 WHERE id=$1", cid, mid)
    return mid


async def notify(worker, job):
    async with worker.db.transaction(job["vendor_id"]) as (conn, _):
        if await conn.fetchval(
            "SELECT id FROM messages WHERE vendor_id=$1 AND commerce_context->>'notice_job'=$2",
            job["vendor_id"],
            str(job["id"]),
        ):
            return
        o = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", job["order_id"])
        if not o or not o["conversation_id"]:
            return
        text = TEXTS[o["status"]]
        if job["dedupe_key"].endswith(":reservation_expired"):
            text = "Your checkout reservation has expired. Please contact the team before making a payment."
        elif o["status"] == "awaiting_payment":
            text += f" Total: {naira(o['total_kobo'])}."
            if o["payment_link"]:
                text += " Pay securely: " + o["payment_link"]
        if o["payment_status"] == "paid":
            r = await conn.fetchrow("SELECT * FROM receipts WHERE order_id=$1", o["id"])
            if r and worker.settings.public_web_url:
                url = await receipts.share(conn, worker, r)
                if url:
                    text += " Receipt: " + url
        mid = await queue(conn, job["vendor_id"], o["conversation_id"], text, o)
        await conn.execute(
            "UPDATE messages SET commerce_context=commerce_context||jsonb_build_object('notice_job',$2::text) WHERE id=$1",
            mid,
            str(job["id"]),
        )
        await conn.execute(
            "UPDATE order_timeline SET customer_message_id=$2 WHERE order_id=$1 AND label=$3 AND customer_message_id IS NULL",
            o["id"],
            mid,
            job["dedupe_key"].split(":")[-1],
        )


async def validate(worker, conn, vendor, message):
    ctx = (
        json.loads(message["commerce_context"])
        if isinstance(message["commerce_context"], str)
        else message["commerce_context"]
    )
    o = (
        await conn.fetchrow("SELECT * FROM orders WHERE id=$1 FOR SHARE", UUID(ctx["order_id"]))
        if ctx["order_id"]
        else None
    )
    if o and o["status"] != ctx["status"]:
        return False
    if (
        o
        and o["status"] == "awaiting_payment"
        and o["reservation_expires_at"]
        and o["reservation_expires_at"].timestamp() <= time.time()
        and "Pay securely:" in message["content"]
    ):
        return False
    if message["content"] != ctx["text"]:
        return False
    sheet = await get_product_facts(
        conn, vendor, message["conversation_id"], "", order_id=o["id"] if o else None
    )
    text = message["content"]
    if "#token=" in text:
        token = text.split("#token=", 1)[1].strip()
        try:
            dto = await receipts.resolve(worker, token)
            if not o or dto["orderId"] != str(o["id"]):
                return False
        except Exception:  # noqa: BLE001 -- fail closed, no private token/exception logging
            return False
        sheet.setdefault("allowed_links", []).append(
            worker.settings.public_web_url.rstrip("/") + "/receipts/shared#token=" + token
        )
    # Exact non-factual collection questions do not invent a delivery service or payment.
    collection = {
        "Please tell us which listed variant you would like.",
        "Your draft order is ready. Reply confirm order to proceed to payment.",
        "How many units would you like? Please share your delivery address and city in this chat.",
        "Please share your delivery address and city in this chat.",
        "Please share the missing quantity and delivery address before confirming.",
        "Thank you. Your additional instructions have been recorded. The team will confirm the next steps.",
    }
    if text in collection:
        return True
    if (
        o
        and o["payment_review"] == "RESERVATION_EXPIRED"
        and text
        == "Your checkout reservation has expired. Please contact the team before making a payment."
    ):
        return True
    return verify(text, sheet).safe
