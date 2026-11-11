import hashlib
import hmac
import json
import secrets
import time
from uuid import UUID

from fastapi import HTTPException

from app.pipeline.crypto import b64, unb64


def dto(row):
    snap = json.loads(row["snapshot"]) if isinstance(row["snapshot"], str) else row["snapshot"]
    if "vendor_name" in snap:  # Frozen B0 snapshot, never re-read mutable catalogue names.
        snap = {
            "vendorName": snap["vendor_name"],
            "customerName": snap["customer_name"],
            "subtotalKobo": snap["subtotal_kobo"],
            "deliveryFeeKobo": snap["delivery_fee_kobo"],
            "paymentSource": snap["payment_source"],
            "items": [
                {
                    "productId": i["product_id"],
                    "name": i["name"],
                    "variantId": i.get("variant_id"),
                    "variantName": i.get("variant"),
                    "quantity": i["quantity"],
                    "unitPriceKobo": i["unit_price_kobo"],
                }
                for i in snap["items"]
            ],
        }
    if (
        not all(
            k in snap
            for k in (
                "vendorName",
                "customerName",
                "subtotalKobo",
                "deliveryFeeKobo",
                "paymentSource",
                "items",
            )
        )
        or not snap["items"]
    ):
        raise HTTPException(
            409,
            "Historical receipt snapshot is incomplete; it cannot be reconstructed from mutable facts",
        )
    return {
        **snap,
        "id": str(row["id"]),
        "vendorId": str(row["vendor_id"]),
        "orderId": str(row["order_id"]),
        "number": row["receipt_number"],
        "totalKobo": row["total_kobo"],
        "issuedAt": row["issued_at"].isoformat()
        if "issued_at" in row
        else row["created_at"].isoformat(),
        "shareUrl": None,
    }


async def share(conn, rt, row, renew=False):
    if not rt.settings.public_web_url.startswith("https://"):
        raise HTTPException(503, "Secure receipt hosting URL is not configured")
    old = await conn.fetchrow(
        "SELECT * FROM receipt_shares WHERE receipt_id=$1 ORDER BY created_at DESC LIMIT 1",
        row["id"],
    )
    if old:
        if (
            not old["revoked_at"]
            and old["expires_at"].timestamp() > time.time()
            and old["token_ciphertext"]
        ):
            token = rt.crypto.open(
                bytes(old["token_ciphertext"]),
                old["key_version"],
                f"{row['vendor_id']}:{row['id']}:share",
            ).decode()
            return rt.settings.public_web_url.rstrip("/") + "/receipts/shared#token=" + token
        if not renew:
            return None
    payload = {
        "vendor": str(row["vendor_id"]),
        "receipt": str(row["id"]),
        "exp": int(time.time()) + 7 * 86400,
        "nonce": secrets.token_urlsafe(32),
    }
    body = b64(json.dumps(payload, sort_keys=True).encode())
    token = body + "." + rt.crypto.digest("receipt-share", body)
    await conn.execute(
        "INSERT INTO receipt_shares(vendor_id,receipt_id,token_hash,expires_at,token_ciphertext,key_version) VALUES($1,$2,$3,to_timestamp($4),$5,$6)",
        row["vendor_id"],
        row["id"],
        hashlib.sha256(token.encode()).hexdigest(),
        payload["exp"],
        rt.crypto.seal(token.encode(), f"{row['vendor_id']}:{row['id']}:share"),
        rt.crypto.version,
    )
    return rt.settings.public_web_url.rstrip("/") + "/receipts/shared#token=" + token


async def resolve(rt, token):
    try:
        body, signature = token.split(".")
        if not hmac.compare_digest(signature, rt.crypto.digest("receipt-share", body)):
            raise ValueError()
        payload = json.loads(unb64(body))
        if payload["exp"] <= time.time():
            raise ValueError()
        vendor, rid = UUID(payload["vendor"]), UUID(payload["receipt"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(404, "Receipt link is invalid or expired") from None
    async with rt.db.transaction(vendor) as (conn, _):
        row = await conn.fetchrow(
            "SELECT r.* FROM receipts r JOIN receipt_shares s ON s.vendor_id=r.vendor_id AND s.receipt_id=r.id WHERE r.id=$1 AND s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>now()",
            rid,
            hashlib.sha256(token.encode()).hexdigest(),
        )
    if not row:
        raise HTTPException(404, "Receipt link is invalid, expired or revoked")
    return dto(row)
