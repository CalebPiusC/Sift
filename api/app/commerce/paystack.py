"""Paystack boundary: signed ingress is NOT enough; reconcile via authenticated verify API."""

import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import quote, urlparse

import httpx
from fastapi import HTTPException

from app.channels.gmail import ChannelError

from . import domain


class Paystack:
    def __init__(self, settings, client):
        self.secret = settings.paystack_secret_key.get_secret_value()
        self.client = client
        if not self.secret:
            raise ChannelError("PAYSTACK_NOT_CONFIGURED", False)

    async def request(self, method, path, **kwargs):
        try:
            r = await self.client.request(
                method,
                "https://api.paystack.co" + path,
                headers={"Authorization": "Bearer " + self.secret},
                **kwargs,
            )
        except httpx.HTTPError:
            raise ChannelError("PAYSTACK_NETWORK", True, ambiguous=method == "POST") from None
        if r.status_code >= 500 or r.status_code == 429:
            raise ChannelError("PAYSTACK_TRANSIENT", True, ambiguous=method == "POST")
        if not r.is_success:
            raise ChannelError("PAYSTACK_REJECTED", False)
        result = r.json()
        if result.get("status") is not True:
            raise ChannelError("PAYSTACK_REJECTED", False)
        return result["data"]

    async def verify(self, reference):
        return await self.request("GET", "/transaction/verify/" + quote(reference, safe=""))


def signature(raw, header, secret):
    return bool(
        secret
        and len(header) == 128
        and hmac.compare_digest(hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest(), header)
    )


def matches(data, order):
    return (
        data.get("status") == "success"
        and data.get("reference") == order["checkout_reference"]
        and type(data.get("amount")) is int
        and data["amount"] == order["total_kobo"]
        and data.get("currency") == "NGN"
    )


async def initialize(worker, job):
    if not worker.settings.paystack_secret_key.get_secret_value():
        raise ChannelError("PAYSTACK_NOT_CONFIGURED", False)
    vendor = job["vendor_id"]
    async with worker.db.transaction(vendor) as (conn, _):
        order = await domain.lock(conn, vendor, job["order_id"])
        if (
            order["status"] != "awaiting_payment"
            or order["payment_status"] == "paid"
            or order["payment_link"]
        ):
            return
        if (
            not order["reservation_expires_at"]
            or order["reservation_expires_at"].timestamp() <= time.time()
        ):
            raise ChannelError("RESERVATION_EXPIRED", False)
        email = await conn.fetchval("SELECT email FROM customers WHERE id=$1", order["customer_id"])
        if not email:
            raise ChannelError("CUSTOMER_EMAIL_REQUIRED", False)
        ref = order["checkout_reference"] or "sv_" + secrets.token_hex(24)
        if order["checkout_started_at"]:
            # Initialize has no guaranteed idempotent replay contract. Never issue a new reference.
            raise ChannelError("CHECKOUT_UNCERTAIN", False)
        await conn.execute(
            "UPDATE orders SET checkout_reference=$2,checkout_started_at=now() WHERE id=$1",
            order["id"],
            ref,
        )
    async with httpx.AsyncClient(timeout=20) as client:
        data = await Paystack(worker.settings, client).request(
            "POST",
            "/transaction/initialize",
            json={
                "email": email,
                "amount": order["total_kobo"],
                "currency": "NGN",
                "reference": ref,
            },
        )
    url = data.get("authorization_url", "")
    parsed = urlparse(url)
    if (
        data.get("reference") != ref
        or parsed.scheme != "https"
        or parsed.hostname not in ("checkout.paystack.com", "paystack.com")
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ChannelError("INVALID_CHECKOUT_RESPONSE", False)
    async with worker.db.transaction(vendor) as (conn, _):
        current = await domain.lock(conn, vendor, order["id"])
        if current["status"] != "awaiting_payment":
            return
        await conn.execute("UPDATE orders SET payment_link=$2 WHERE id=$1", order["id"], url)
        current = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", order["id"])
        await domain.notice(conn, current, "checkout_ready")


async def reconcile(worker, job):
    vendor = job["vendor_id"]
    async with worker.db.transaction(vendor) as (conn, _):
        order = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", job["order_id"])
        event = await conn.fetchrow(
            "SELECT * FROM webhook_events WHERE id=$1", job["webhook_event_id"]
        )
        if event["processed_at"]:
            return
        envelope = json.loads(
            worker.crypto.open(
                bytes(event["payload_ciphertext"]),
                event["key_version"],
                f"{vendor}:paystack:webhook",
            )
        )
    async with httpx.AsyncClient(timeout=20) as client:
        data = await Paystack(worker.settings, client).verify(order["checkout_reference"])
    async with worker.db.transaction(vendor) as (conn, _):
        order = await domain.lock(conn, vendor, order["id"])
        reason = None
        if not matches(envelope.get("data", {}), order) or not matches(data, order):
            reason = "PAYMENT_MISMATCH"
        elif order["payment_status"] == "paid":
            if (
                order["payment_source"] != "paystack"
                or order["payment_reference"] != data["reference"]
            ):
                reason = "DUPLICATE_PAYMENT_REVIEW"
        elif order["status"] != "awaiting_payment":
            reason = "LATE_PAYMENT_REVIEW"
        else:
            try:
                async with conn.transaction():
                    await domain.paid(conn, order, "paystack", data["reference"])
            except HTTPException as error:
                if error.status_code != 409:
                    raise
                reason = "STOCK_OR_ORDER_REVIEW"
        if reason:
            await conn.execute(
                "UPDATE orders SET payment_review=$2 WHERE id=$1", order["id"], reason
            )
            await conn.execute(
                "INSERT INTO audit_log(vendor_id,action,entity_type,entity_id) VALUES($1,$2,'order',$3)",
                vendor,
                "payment.review." + reason.lower(),
                order["id"],
            )
        await conn.execute("UPDATE webhook_events SET processed_at=now() WHERE id=$1", event["id"])


async def refund(worker, job):
    async with worker.db.transaction(job["vendor_id"]) as (conn, _):
        o = await domain.lock(conn, job["vendor_id"], job["order_id"])
        if o["status"] != "cancelled" or not o["refund_requested_at"] or o["refund_reference"]:
            return
        if o["payment_source"] != "paystack":
            return  # Manual bank refund stays explicitly pending.
        if o["refund_status"] != "requested":
            if o["refund_status"] == "processing":
                await conn.execute(
                    "UPDATE orders SET refund_status='uncertain' WHERE id=$1", o["id"]
                )
            return
        await conn.execute("UPDATE orders SET refund_status='processing' WHERE id=$1", o["id"])
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            data = await Paystack(worker.settings, client).request(
                "POST",
                "/refund",
                json={
                    "transaction": o["payment_reference"],
                    "amount": o["total_kobo"],
                    "currency": "NGN",
                },
            )
    except ChannelError:
        async with worker.db.transaction(job["vendor_id"]) as (conn, _):
            await conn.execute("UPDATE orders SET refund_status='uncertain' WHERE id=$1", o["id"])
        raise ChannelError("REFUND_RECONCILIATION_REQUIRED", False) from None
    async with worker.db.transaction(job["vendor_id"]) as (conn, _):
        await conn.execute(
            "UPDATE orders SET refund_reference=$2,refund_status='pending' WHERE id=$1",
            o["id"],
            str(data["id"]),
        )
