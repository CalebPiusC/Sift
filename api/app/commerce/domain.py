import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.pipeline.jobs import enqueue

STATES = {
    "draft": {"awaiting_payment", "cancelled"},
    "awaiting_payment": {"cancelled"},
    "paid": {"preparing", "cancelled"},
    "preparing": {"out_for_delivery", "cancelled"},
    "out_for_delivery": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}


async def lock(conn, vendor, oid):
    # Chat lock first, matching the reply/send worker; serialize per vendor commerce writes.
    cid = await conn.fetchval(
        "SELECT conversation_id FROM orders WHERE vendor_id=$1 AND id=$2", vendor, oid
    )
    if cid:
        await conn.fetchrow("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", cid)
    await conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "commerce:" + str(vendor)
    )
    order = await conn.fetchrow(
        "SELECT * FROM orders WHERE vendor_id=$1 AND id=$2 FOR UPDATE", vendor, oid
    )
    if not order:
        raise HTTPException(404, "Order not found")
    return order


async def lines(conn, oid):
    return await conn.fetch(
        "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id,variant_id NULLS FIRST,id",
        oid,
    )


async def notice(conn, order, label):
    await conn.execute(
        "INSERT INTO order_timeline(vendor_id,order_id,label) VALUES($1,$2,$3)",
        order["vendor_id"],
        order["id"],
        label,
    )
    if order["conversation_id"]:
        await enqueue(
            conn,
            order["vendor_id"],
            "order_message",
            f"{order['id']}:{order['revision']}:{label}",
            order_id=order["id"],
            conversation_id=order["conversation_id"],
        )


async def reserve(conn, order):
    items = await lines(conn, order["id"])
    if (
        not items
        or sum(i["quantity"] * i["unit_price_kobo"] for i in items) + order["delivery_fee_kobo"]
        != order["total_kobo"]
    ):
        raise HTTPException(409, "Review order items and totals")
    if not order["delivery_address"].strip() or not order["delivery_city"]:
        raise HTTPException(409, "Collect delivery details in chat first")
    context = (
        json.loads(order["chat_context"])
        if isinstance(order["chat_context"], str)
        else order["chat_context"]
    )
    if context and not context.get("complete"):
        raise HTTPException(409, "Collect the remaining details in chat")
    fees = await conn.fetch(
        "SELECT fee_kobo FROM delivery_fees WHERE vendor_id=$1 AND city=$2 FOR SHARE",
        order["vendor_id"],
        order["delivery_city"],
    )
    if len(fees) != 1 or fees[0]["fee_kobo"] != order["delivery_fee_kobo"]:
        raise HTTPException(409, "Delivery fee changed or unavailable; review draft in chat")
    expiry = datetime.now(UTC) + timedelta(minutes=30)
    for item in items:
        product = await conn.fetchrow(
            "SELECT * FROM products WHERE id=$1 FOR UPDATE", item["product_id"]
        )
        if not product or product["archived"]:
            raise HTTPException(409, "Product unavailable")
        variant = (
            await conn.fetchrow(
                "SELECT * FROM product_variants WHERE id=$1 FOR UPDATE", item["variant_id"]
            )
            if item["variant_id"]
            else None
        )
        current = variant or product
        if current["price_kobo"] != item["unit_price_kobo"]:
            raise HTTPException(409, "Price changed; review draft in chat")
        if current["stock_count"] is not None:
            held = await conn.fetchval(
                "SELECT coalesce(sum(quantity),0)::int FROM stock_reservations WHERE product_id=$1 AND variant_id IS NOT DISTINCT FROM $2 AND status='active' AND expires_at>now() AND order_id<>$3",
                item["product_id"],
                item["variant_id"],
                order["id"],
            )
            if current["stock_count"] - held < item["quantity"]:
                raise HTTPException(409, "Insufficient unreserved stock")
            await conn.execute(
                "INSERT INTO stock_reservations(vendor_id,order_id,order_item_id,product_id,variant_id,quantity,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
                order["vendor_id"],
                order["id"],
                item["id"],
                item["product_id"],
                item["variant_id"],
                item["quantity"],
                expiry,
            )
    await conn.execute(
        "UPDATE orders SET reservation_expires_at=$2 WHERE id=$1", order["id"], expiry
    )
    await enqueue(
        conn,
        order["vendor_id"],
        "reservation_expiry",
        "reservation:" + str(order["id"]),
        order_id=order["id"],
        run_at=expiry,
    )


async def transition(conn, order, target, expected):
    if order["status"] == target:
        return order
    if order["revision"] != expected:
        raise HTTPException(409, "Order changed. Review the latest version.")
    if target not in STATES[order["status"]]:
        raise HTTPException(409, "Invalid order transition; payment must be verified separately")
    if target == "awaiting_payment":
        await reserve(conn, order)
    if target == "cancelled":
        await conn.execute(
            "UPDATE stock_reservations SET status='released' WHERE order_id=$1 AND status='active'",
            order["id"],
        )
        await conn.execute(
            "INSERT INTO audit_log(vendor_id,action,entity_type,entity_id) VALUES($1,'order.cancelled_no_automatic_refund_or_restock','order',$2)",
            order["vendor_id"],
            order["id"],
        )
    row = await conn.fetchrow(
        "UPDATE orders SET status=$2 WHERE id=$1 RETURNING *", order["id"], target
    )
    await notice(conn, row, target)
    return row


async def stock_payment(conn, order):
    """All-or-nothing deduction. Lock parent then variant; never silently oversell."""
    items = await lines(conn, order["id"])
    if (
        not items
        or sum(i["quantity"] * i["unit_price_kobo"] for i in items) + order["delivery_fee_kobo"]
        != order["total_kobo"]
    ):
        raise HTTPException(409, "Invalid payment totals")
    await conn.execute(
        "UPDATE stock_reservations SET status='committed' WHERE order_id=$1 AND status='active'",
        order["id"],
    )
    for item in items:
        parent = await conn.fetchrow(
            "SELECT * FROM products WHERE id=$1 FOR UPDATE", item["product_id"]
        )
        current = (
            await conn.fetchrow(
                "SELECT * FROM product_variants WHERE id=$1 FOR UPDATE", item["variant_id"]
            )
            if item["variant_id"]
            else parent
        )
        if current["stock_count"] is None:
            continue
        held = await conn.fetchval(
            "SELECT coalesce(sum(quantity),0)::int FROM stock_reservations WHERE product_id=$1 AND variant_id IS NOT DISTINCT FROM $2 AND status='active' AND expires_at>now() AND order_id<>$3",
            item["product_id"],
            item["variant_id"],
            order["id"],
        )
        if current["stock_count"] - held < item["quantity"]:
            raise HTTPException(409, "STOCK_UNAVAILABLE")
        table = "product_variants" if item["variant_id"] else "products"
        await conn.execute(
            f"UPDATE {table} SET stock_count=stock_count-$2 WHERE id=$1",
            current["id"],
            item["quantity"],
        )
        await conn.execute(
            "INSERT INTO stock_movements(vendor_id,product_id,variant_id,order_id,requested,delta,reason,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,'sale',$7)",
            order["vendor_id"],
            item["product_id"],
            item["variant_id"],
            order["id"],
            item["quantity"],
            -item["quantity"],
            "sale:" + str(item["id"]),
        )


async def paid(conn, order, source, reference, member=None):
    if order["payment_status"] == "paid":
        return order
    if order["status"] != "awaiting_payment":
        raise HTTPException(409, "Order is not awaiting payment")
    if order["total_kobo"] <= 0:
        raise HTTPException(409, "Positive order total required")
    await stock_payment(conn, order)
    await conn.execute(
        "INSERT INTO payments(vendor_id,order_id,source,amount_kobo,reference,verified_at,verified_by) VALUES($1,$2,$3,$4,$5,now(),$6)",
        order["vendor_id"],
        order["id"],
        source,
        order["total_kobo"],
        reference,
        member,
    )
    row = await conn.fetchrow(
        "UPDATE orders SET status='paid',payment_status='paid',payment_source=$2,payment_reference=$3,paid_at=now(),paid_at_source='verified',payment_review=NULL WHERE id=$1 RETURNING *",
        order["id"],
        source,
        reference,
    )
    await issue_receipt(conn, row)
    await notice(conn, row, "paid")
    return row


async def issue_receipt(conn, order):
    existing = await conn.fetchval("SELECT id FROM receipts WHERE order_id=$1", order["id"])
    if existing:
        return existing
    if order["payment_status"] != "paid" or not await conn.fetchval(
        "SELECT id FROM payments WHERE order_id=$1 AND amount_kobo=$2",
        order["id"],
        order["total_kobo"],
    ):
        raise HTTPException(409, "Verified payment ledger is required")
    # Caller holds vendor commerce advisory lock; vendor row also serializes legacy issuance.
    vendor = await conn.fetchrow("SELECT * FROM vendors WHERE id=$1 FOR UPDATE", order["vendor_id"])
    existing = await conn.fetchval("SELECT id FROM receipts WHERE order_id=$1", order["id"])
    if existing:
        return existing
    items = await lines(conn, order["id"])
    customer = await conn.fetchval(
        "SELECT display_name FROM customers WHERE id=$1", order["customer_id"]
    )
    number = await conn.fetchval(
        "SELECT coalesce(max(receipt_number),0)+1 FROM receipts WHERE vendor_id=$1",
        order["vendor_id"],
    )
    snapshot = {
        "vendorName": vendor["business_name"],
        "customerName": customer,
        "subtotalKobo": order["total_kobo"] - order["delivery_fee_kobo"],
        "deliveryFeeKobo": order["delivery_fee_kobo"],
        "paymentSource": order["payment_source"],
        "items": [
            {
                "productId": str(i["product_id"]),
                "name": i["name_snapshot"],
                "variantId": str(i["variant_id"]) if i["variant_id"] else None,
                "variantName": i["variant_name_snapshot"],
                "quantity": i["quantity"],
                "unitPriceKobo": i["unit_price_kobo"],
            }
            for i in items
        ],
    }
    return await conn.fetchval(
        "INSERT INTO receipts(vendor_id,order_id,receipt_number,snapshot,total_kobo) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id",
        order["vendor_id"],
        order["id"],
        number,
        json.dumps(snapshot),
        order["total_kobo"],
    )


async def restock_cancelled(conn, order, user):
    if order["status"] != "cancelled" or order["payment_status"] != "paid":
        raise HTTPException(409, "Paid cancelled order required")
    if order["restocked_at"]:
        return
    for item in await lines(conn, order["id"]):
        sale = await conn.fetchrow(
            "SELECT * FROM stock_movements WHERE order_id=$1 AND dedupe_key=$2",
            order["id"],
            "sale:" + str(item["id"]),
        )
        if not sale:
            continue
        await conn.fetchrow("SELECT id FROM products WHERE id=$1 FOR UPDATE", item["product_id"])
        table = "product_variants" if item["variant_id"] else "products"
        await conn.execute(
            f"UPDATE {table} SET stock_count=stock_count+$2 WHERE id=$1",
            item["variant_id"] or item["product_id"],
            -sale["delta"],
        )
        await conn.execute(
            "INSERT INTO stock_movements(vendor_id,product_id,variant_id,order_id,requested,delta,reason,dedupe_key) VALUES($1,$2,$3,$4,$5,$5,'restock',$6)",
            order["vendor_id"],
            item["product_id"],
            item["variant_id"],
            order["id"],
            -sale["delta"],
            "cancel-restock:" + str(item["id"]),
        )
    await conn.execute("UPDATE orders SET restocked_at=now() WHERE id=$1", order["id"])
    await conn.execute(
        "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'order.explicit_restock','order',$3)",
        order["vendor_id"],
        user,
        order["id"],
    )
