import json
from datetime import UTC, datetime

import httpx

from app.channels.gmail import ChannelError
from app.commerce.paystack import Paystack

from .meter import account, current


def matches(data, c):
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("customer"), dict)
        or not isinstance(data["customer"].get("email"), str)
    ):
        return False
    plan = data.get("plan_object") or data.get("plan")
    if isinstance(plan, dict):
        plan = plan.get("plan_code")
    return (
        data.get("status") == "success"
        and data.get("reference") == c["reference"]
        and type(data.get("amount")) is int
        and data["amount"] == c["amount_kobo"]
        and data.get("currency") == "NGN"
        and (data.get("customer") or {}).get("email", "").casefold() == c["email"].casefold()
        and (c["kind"] == "bundle" or plan == c["plan_code"])
    )


async def payment(worker, job):
    vendor = job["vendor_id"]
    async with worker.db.transaction(vendor) as (conn, _):
        c = await conn.fetchrow(
            "SELECT * FROM billing_checkouts WHERE id=$1", job["billing_checkout_id"]
        )
        e = await conn.fetchrow(
            "SELECT * FROM webhook_events WHERE id=$1 AND signature_verified",
            job["webhook_event_id"],
        )
        if not c or not e or c["status"] == "paid":
            return
        raw = worker.crypto.open(
            bytes(e["payload_ciphertext"]), e["key_version"], f"{vendor}:paystack:webhook"
        )
        event = json.loads(raw)
        if event.get("event") != "charge.success" or not matches(event["data"], c):
            raise ChannelError("BILLING_WEBHOOK_MISMATCH", False)
    async with httpx.AsyncClient(timeout=20) as client:
        verified = await Paystack(worker.settings, client).verify(c["reference"])
    if not matches(verified, c) or str(verified.get("id")) != str(event["data"].get("id")):
        raise ChannelError("BILLING_VERIFY_MISMATCH", False)
    try:
        paid = datetime.fromisoformat(verified["paid_at"])
        if not paid.tzinfo or paid > datetime.now(UTC):
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise ChannelError("BILLING_BAD_PAID_AT", False) from None
    async with worker.db.transaction(vendor) as (conn, _):
        await account(conn, vendor)
        c = await conn.fetchrow("SELECT * FROM billing_checkouts WHERE id=$1 FOR UPDATE", c["id"])
        inserted = await conn.fetchval(
            "INSERT INTO billing_payments(vendor_id,checkout_id,provider_transaction,reference,amount_kobo,paid_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
            vendor,
            c["id"],
            str(verified["id"]),
            c["reference"],
            c["amount_kobo"],
            paid,
        )
        if not inserted:
            return
        if c["kind"] == "bundle":
            await conn.execute(
                "UPDATE billing_accounts SET bundle_balance=bundle_balance+$2 WHERE vendor_id=$1",
                vendor,
                c["conversations"],
            )
        else:
            # Paid period anchored to payment time, never webhook retry time.
            await conn.execute(
                "UPDATE billing_accounts SET plan='growth',status='active',entitlement_limit=$2,entitlement_ends_at=$3::timestamptz+make_interval(months=>$4),next_billing_at=$3::timestamptz+make_interval(months=>$4),monthly_price_kobo=$5 WHERE vendor_id=$1 AND (entitlement_ends_at IS NULL OR entitlement_ends_at<=$3::timestamptz+make_interval(months=>$4))",
                vendor,
                c["conversations"],
                paid,
                c["interval_months"],
                c["amount_kobo"] // c["interval_months"],
            )
        await conn.execute(
            "UPDATE billing_checkouts SET status='paid',paid_at=$2,provider_customer=$3 WHERE id=$1",
            c["id"],
            paid,
            str((verified.get("customer") or {}).get("customer_code", "")),
        )
        await current(conn, vendor)
