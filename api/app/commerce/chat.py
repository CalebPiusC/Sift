"""Conservative slot collection in customer chat. Never a vendor order form."""

import json
import re
from uuid import UUID

from app.pipeline.jobs import enqueue
from app.replies.core import detect
from app.replies.facts import get_product_facts

from . import domain


async def handle(conn, vendor, inbound):
    text = inbound["voice_transcript"] or inbound["content"]
    d = detect(text)
    if (
        d.hostile
        or d.intent in ("payment_claim", "refund", "complaint", "custom", "bulk_order", "discount")
        or d.language == "other"
    ):
        return False
    oid = await conn.fetchval(
        "SELECT id FROM orders WHERE conversation_id=$1 AND status IN ('draft','awaiting_payment','paid','preparing','out_for_delivery') ORDER BY created_at DESC LIMIT 1",
        inbound["conversation_id"],
    )
    buying = bool(
        re.search(r"\b(buy|order|purchase|i want|i need|make i buy)\b", text, re.IGNORECASE)
    ) and not re.search(r"\b(order status|where is|track)\b", text, re.IGNORECASE)
    if not oid and not buying:
        return False
    # Only recognized structured slots/explicit decisions update an existing deal.
    if oid:
        order = await domain.lock(conn, vendor, oid)
        if order["payment_status"] == "paid":
            if re.search(r"^\s*(?:delivery )?instructions?\s*:", text, re.IGNORECASE):
                await conn.execute(
                    "UPDATE orders SET delivery_instructions=$2 WHERE id=$1",
                    oid,
                    text.split(":", 1)[1].strip()[:2000],
                )
                await send(
                    conn,
                    vendor,
                    inbound,
                    "Thank you. Your additional instructions have been recorded. The team will confirm the next steps.",
                    order,
                )
                return True
            return False
        if order["status"] == "awaiting_payment":
            if re.fullmatch(r"\s*cancel (?:my )?order[.!]?\s*", text, re.IGNORECASE):
                await domain.transition(conn, order, "cancelled", order["revision"])
                return True
            return False
    else:
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "commerce:" + str(vendor)
        )
        order = None
    context = (
        json.loads(order["chat_context"])
        if order and isinstance(order["chat_context"], str)
        else dict(order["chat_context"] or {})
        if order
        else {}
    )
    if order and re.fullmatch(r"\s*confirm (?:my )?order[.!]?\s*", text, re.IGNORECASE):
        if not context.get("complete"):
            await send(
                conn,
                vendor,
                inbound,
                "Please share the missing quantity and delivery address before confirming.",
                order,
            )
        else:
            await domain.transition(conn, order, "awaiting_payment", order["revision"])
            await enqueue(conn, vendor, "checkout", "checkout:" + str(oid), order_id=oid)
            await conn.execute(
                "UPDATE messages SET lane='auto',lane_reason='order_confirmed' WHERE id=$1",
                inbound["id"],
            )
        return True
    if order and not (
        buying
        or re.search(r"\b(address|deliver|city|units?|pieces?|pcs|quantity)\b", text, re.IGNORECASE)
        or re.fullmatch(r"\s*\d+\s*", text)
    ):
        return False
    combined = (context.get("source", "") + "\n" + text).strip()
    quantity = re.search(
        r"\b(\d+)\s*(?:units?|pieces?|pcs|pairs?|items?)\b", combined, re.IGNORECASE
    )
    if order and re.fullmatch(r"\s*\d+\s*", text):
        quantity = int(text)
        context["quantity"] = quantity
    else:
        quantity = int(quantity[1]) if quantity else context.get("quantity")
    if quantity is not None and not 1 <= quantity < 10:
        return False
    facts = await get_product_facts(conn, vendor, inbound["conversation_id"], combined)
    if len(facts["products"]) != 1:
        return False
    p = facts["products"][0]
    if p["kind"] != "product":
        return False  # Custom/service fulfilment remains vendor-reviewed.
    if p.get("variants") and not p.get("variant_id"):
        await send(
            conn, vendor, inbound, "Please tell us which listed variant you would like.", order
        )
        return True
    address_match = re.search(r"(?:address\s*:|deliver to)\s*([^\n;]+)", combined, re.IGNORECASE)
    address = address_match[1].strip()[:1000] if address_match else ""
    fee = facts["delivery"][0] if len(facts["delivery"]) == 1 else None
    complete = bool(quantity and address and fee)
    q = quantity or 1
    total = p["price_kobo"] * q + (fee["fee_kobo"] if fee else 0)
    if total > 9007199254740991:
        return False
    context = {"source": combined[-20000:], "quantity": quantity, "complete": complete}
    if not order:
        oid = await conn.fetchval(
            "INSERT INTO orders(vendor_id,customer_id,conversation_id,total_kobo,delivery_fee_kobo,delivery_city,delivery_address,chat_context,payment_review) SELECT $1,customer_id,id,$3,$4,$5,$6,$7::jsonb,$8 FROM conversations WHERE id=$2 RETURNING id",
            vendor,
            inbound["conversation_id"],
            total,
            fee["fee_kobo"] if fee else 0,
            fee["city"] if fee else None,
            address,
            json.dumps(context),
            None if complete else "DETAILS_REQUIRED",
        )
        await conn.execute(
            "INSERT INTO order_items(vendor_id,order_id,product_id,variant_id,quantity,unit_price_kobo,name_snapshot,variant_name_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            vendor,
            oid,
            UUID(p.get("parent_id", p["id"])),
            UUID(p["variant_id"]) if p.get("variant_id") else None,
            q,
            p["price_kobo"],
            p["name"],
            p.get("variant_name"),
        )
    else:
        await conn.execute(
            "UPDATE orders SET total_kobo=$2,delivery_fee_kobo=$3,delivery_city=$4,delivery_address=$5,chat_context=$6::jsonb,payment_review=$7 WHERE id=$1",
            oid,
            total,
            fee["fee_kobo"] if fee else 0,
            fee["city"] if fee else None,
            address,
            json.dumps(context),
            None if complete else "DETAILS_REQUIRED",
        )
        await conn.execute(
            "UPDATE order_items SET quantity=$2,unit_price_kobo=$3 WHERE order_id=$1",
            oid,
            q,
            p["price_kobo"],
        )
    order = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", oid)
    reply = (
        "Your draft order is ready. Reply confirm order to proceed to payment."
        if complete
        else "How many units would you like? Please share your delivery address and city in this chat."
        if not quantity
        else "Please share your delivery address and city in this chat."
    )
    await send(conn, vendor, inbound, reply, order, collection=True)
    return True


async def send(conn, vendor, inbound, text, order, collection=False):
    from .messages import queue

    await conn.execute(
        "UPDATE messages SET lane='auto',lane_reason='order_details_collected' WHERE id=$1",
        inbound["id"],
    )
    await queue(conn, vendor, inbound["conversation_id"], text, order, collection=collection)
