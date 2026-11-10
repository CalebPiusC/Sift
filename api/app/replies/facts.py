"""The sole business-fact lookup. Never ask a wording model for facts."""

import hashlib
import json
import re


def fingerprint(sheet: dict) -> str:
    return hashlib.sha256(
        json.dumps(sheet, sort_keys=True, default=str, separators=(",", ":")).encode()
    ).hexdigest()


async def get_product_facts(conn, vendor, conversation, customer_text: str) -> dict:
    # RLS is already tenant scoped. Explicit vendor predicates are defence in depth.
    rows = await conn.fetch(
        "SELECT id,name,price_kobo,lowest_price_kobo,stock_count,revision,kind FROM products WHERE vendor_id=$1 AND NOT archived ORDER BY id LIMIT 501 FOR SHARE",
        vendor,
    )
    matches = [
        dict(r)
        for r in rows
        if re.search(r"(?<!\w)" + re.escape(r["name"]) + r"(?!\w)", customer_text, re.IGNORECASE)
    ]
    products = []
    if len(rows) <= 500 and len(matches) == 1:
        p = matches[0]
        variants = await conn.fetch(
            "SELECT id,name,price_kobo,stock_count,revision FROM product_variants WHERE vendor_id=$1 AND product_id=$2 ORDER BY id FOR SHARE",
            vendor,
            p["id"],
        )
        p["variants"] = [{**dict(v), "lowest_price_kobo": p["lowest_price_kobo"]} for v in variants]
        reserved = await conn.fetchval(
            "SELECT coalesce(sum(quantity),0)::int FROM stock_reservations WHERE vendor_id=$1 AND product_id=$2 AND variant_id IS NULL AND status='active' AND expires_at>now()",
            vendor,
            p["id"],
        )
        if p["stock_count"] is not None:
            p["stock_count"] -= reserved
        for v in p["variants"]:
            reserved_variant = await conn.fetchval(
                "SELECT coalesce(sum(quantity),0)::int FROM stock_reservations WHERE vendor_id=$1 AND variant_id=$2 AND status='active' AND expires_at>now()",
                vendor,
                v["id"],
            )
            if v["stock_count"] is not None:
                v["stock_count"] -= reserved_variant
        # Variant requests must not silently use base-product prices or availability.
        choices = [
            v
            for v in p["variants"]
            if re.search(
                r"(?<!\w)" + re.escape(v["name"]) + r"(?!\w)", customer_text, re.IGNORECASE
            )
        ]
        if choices:
            if len(choices) == 1:
                p = {
                    **p,
                    **choices[0],
                    "name": p["name"] + " / " + choices[0]["name"],
                    "variants": p["variants"],
                }
            else:
                p = None
        if p:
            products = [p]
    fees = await conn.fetch(
        "SELECT id,city,fee_kobo FROM delivery_fees WHERE vendor_id=$1 ORDER BY id FOR SHARE",
        vendor,
    )
    delivery = [
        dict(f)
        for f in fees
        if re.search(r"\b" + re.escape(f["city"]) + r"\b", customer_text, re.IGNORECASE)
    ]
    alternatives = []
    if len(products) == 1:
        for item in rows:
            if (
                item["id"] == matches[0]["id"]
                or item["kind"] != products[0]["kind"]
                or item["stock_count"] is None
            ):
                continue
            reserved = await conn.fetchval(
                "SELECT coalesce(sum(quantity),0)::int FROM stock_reservations WHERE vendor_id=$1 AND product_id=$2 AND variant_id IS NULL AND status='active' AND expires_at>now()",
                vendor,
                item["id"],
            )
            if item["stock_count"] > reserved:
                alternatives.append({**dict(item), "stock_count": item["stock_count"] - reserved})
            if len(alternatives) >= 3:
                break
    # Never trust a customer-supplied order ID/payment screenshot as ownership or payment proof.
    orders = await conn.fetch(
        "SELECT o.id,o.status,o.payment_status,o.payment_source,o.total_kobo,o.delivery_fee_kobo,o.revision FROM orders o JOIN conversations c ON c.customer_id=o.customer_id AND c.vendor_id=o.vendor_id WHERE c.id=$2 AND o.vendor_id=$1 ORDER BY o.created_at DESC LIMIT 2 FOR SHARE OF o",
        vendor,
        conversation,
    )
    sheet = {
        "products": products,
        "alternatives": alternatives,
        "delivery": delivery,
        "quantity": 1,
        "order_status": orders[0]["status"] if len(orders) == 1 else None,
        "payment_verified": bool(
            len(orders) == 1
            and orders[0]["payment_status"] == "paid"
            and orders[0]["payment_source"] in ("vendor", "paystack")
        ),
        "orders": [dict(o) for o in orders],
    }
    # Totals are derived from explicit quantities, never inferred from an offered price.
    from .core import detect

    quantity = detect(customer_text).quantity
    sheet["quantity"] = quantity
    if len(products) == 1 and quantity > 0:
        sheet["total_kobo"] = (
            products[0]["price_kobo"] * quantity + sum(f["fee_kobo"] for f in delivery)
            if len(delivery) == 1
            else None
        )
    return json.loads(json.dumps(sheet, default=str))


def cards(sheet: dict) -> list[dict]:
    result = []
    for p in sheet.get("products", []):
        for label, key in [
            ("Product", "name"),
            ("List price (kobo)", "price_kobo"),
            ("Lowest price (kobo)", "lowest_price_kobo"),
            ("Stock", "stock_count"),
        ]:
            result.append(
                {
                    "label": label,
                    "value": str(p[key]),
                    "sourceId": p["id"],
                    "sourceRevision": p["revision"],
                }
            )
    for f in sheet.get("delivery", []):
        result.append(
            {
                "label": "Delivery: " + f["city"],
                "value": str(f["fee_kobo"]) + " kobo",
                "sourceId": f["id"],
            }
        )
    return result
