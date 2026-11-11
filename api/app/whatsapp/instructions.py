"""Shared server typed-instruction parser and explicit-confirm transaction.

Both authenticated app text-proposals and helper transcripts call these functions.
No LLM output is executable SQL or a catalogue mutation.
"""

import json
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException


def parse(text):
    value = text.strip()
    m = re.fullmatch(
        r"(?:raise|set|change|update)\s+(.+?)\s+price\s+to\s+(.+)", value, re.IGNORECASE
    )
    if m:
        money = re.fullmatch(
            r"(?:₦|NGN\s*|N\s*)?([0-9]+(?:\.[0-9]{1,2})?)(k)?", m[2].replace(",", ""), re.IGNORECASE
        )
        try:
            amount = Decimal(money[1]) * (100000 if money[2] else 100) if money else 0
        except InvalidOperation:
            amount = 0
        if 0 < amount <= 10**12 and amount == int(amount):
            return m[1].casefold(), {"kind": "price", "value": int(amount)}
    m = re.fullmatch(
        r"(?:mark\s+)?(.+?)\s+(?:as\s+)?(?:finished|sold out|out of stock)", value, re.IGNORECASE
    )
    if m:
        return m[1].casefold(), {"kind": "stock", "value": 0}
    m = re.fullmatch(r"(?:set|update)\s+(.+?)\s+stock\s+to\s+([0-9]+)", value, re.IGNORECASE)
    if m and int(m[2]) <= 10**7:
        return m[1].casefold(), {"kind": "stock", "value": int(m[2])}
    raise HTTPException(
        422, "Try “black sneakers finished”, “set sneakers stock to 8” or “raise bag price to 20k”."
    )


def product(row):
    return {
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "revision": row["revision"],
        "name": row["name"],
        "description": row["description"],
        "kind": row["kind"],
        "category": row["category"],
        "priceKobo": row["price_kobo"],
        "lowestPriceKobo": row["lowest_price_kobo"],
        "stock": row["stock_count"],
        "lowStockThreshold": row["low_stock_threshold"],
        "archived": row["archived"],
        "variants": [],
        "photos": [],
        "details": json.loads(row["details"])
        if isinstance(row["details"], str)
        else row["details"],
    }


async def propose(conn, vendor, member, text):
    query, change = parse(text)
    # Literal matching, not LIKE metacharacters. Ambiguity never chooses arbitrarily.
    rows = await conn.fetch(
        "SELECT * FROM products WHERE vendor_id=$1 AND NOT archived AND strpos(lower(name),$2)>0 ORDER BY name LIMIT 20",
        vendor,
        query,
    )
    candidates = [
        {
            "id": str(p["id"]),
            "name": p["name"],
            "summary": f"Mark {p['name']} as out of stock?"
            if change == {"kind": "stock", "value": 0}
            else f"Set {p['name']} {change['kind']} to {change['value'] / 100 if change['kind'] == 'price' else change['value']}{' NGN' if change['kind'] == 'price' else ''}?",
            "revision": p["revision"],
        }
        for p in rows
    ]
    if not rows:
        raise HTTPException(422, "No matching item. Use the exact catalogue name.")
    row = await conn.fetchrow(
        "INSERT INTO typed_proposals(vendor_id,member_id,input_text,candidates,instruction_change,expires_at) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING *",
        vendor,
        member,
        text,
        json.dumps(candidates),
        json.dumps(change),
        datetime.now(UTC) + timedelta(seconds=599),
    )
    return {"id": str(row["id"]), "text": text, "candidates": candidates}


async def confirm(conn, vendor, member, proposal_id, product_id):
    await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", f"commerce:{vendor}")
    proposal = await conn.fetchrow(
        "SELECT * FROM typed_proposals WHERE id=$1 AND member_id=$2 FOR UPDATE", proposal_id, member
    )
    if not proposal or proposal["expires_at"] <= datetime.now(UTC):
        raise HTTPException(409, "Proposal expired. Send the instruction again.")
    candidates = (
        json.loads(proposal["candidates"])
        if isinstance(proposal["candidates"], str)
        else proposal["candidates"]
    )
    candidate = next((p for p in candidates if p["id"] == str(product_id)), None)
    if not candidate:
        raise HTTPException(409, "Select an item from this proposal.")
    row = await conn.fetchrow("SELECT * FROM products WHERE id=$1 FOR UPDATE", product_id)
    if proposal["status"] == "confirmed":
        if proposal["selected_product_id"] != product_id:
            raise HTTPException(409, "Already confirmed for a different item.")
        return product(row)
    if (
        proposal["status"] != "pending"
        or not row
        or row["archived"]
        or row["revision"] != candidate["revision"]
    ):
        raise HTTPException(409, "Catalogue changed. Review a new proposal.")
    if await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM product_variants WHERE product_id=$1)", product_id
    ):
        raise HTTPException(
            409, "Variant-specific edits need review in the app; no variants were changed."
        )
    change = json.loads(proposal["instruction_change"])
    if change["kind"] == "price":
        if change["value"] < row["lowest_price_kobo"]:
            raise HTTPException(409, "Price is below the configured floor.")
        row = await conn.fetchrow(
            "UPDATE products SET price_kobo=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            product_id,
            change["value"],
        )
    else:
        if row["stock_count"] is None:
            raise HTTPException(409, "This item does not track stock.")
        delta = change["value"] - row["stock_count"]
        row = await conn.fetchrow(
            "UPDATE products SET stock_count=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
            product_id,
            change["value"],
        )
        if delta:
            await conn.execute(
                "INSERT INTO stock_movements(vendor_id,product_id,requested,delta,reason,dedupe_key) VALUES($1,$2,$3,$4,'correction',$5)",
                vendor,
                product_id,
                abs(delta),
                delta,
                f"typed:{proposal_id}",
            )
    await conn.execute(
        "UPDATE typed_proposals SET status='confirmed',selected_product_id=$2,expected_revision=$3 WHERE id=$1",
        proposal_id,
        product_id,
        row["revision"],
    )
    await conn.execute(
        "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,(SELECT user_id FROM vendor_members WHERE id=$2),'catalogue.instruction.confirmed','product',$3)",
        vendor,
        member,
        product_id,
    )
    return product(row)
