import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, accessible, ok, page
from app.pipeline.jobs import enqueue

from . import domain, paystack, receipts

router = APIRouter(prefix="/v1")


async def order_dto(conn, o):
    items = await domain.lines(conn, o["id"])
    timeline = await conn.fetch(
        "SELECT t.*,m.content FROM order_timeline t LEFT JOIN messages m ON m.id=t.customer_message_id WHERE order_id=$1 ORDER BY occurred_at,t.id",
        o["id"],
    )
    movements = await conn.fetch(
        "SELECT * FROM stock_movements WHERE order_id=$1 AND reason='sale' ORDER BY created_at",
        o["id"],
    )
    return {
        "id": str(o["id"]),
        "vendorId": str(o["vendor_id"]),
        "revision": o["revision"],
        "conversationId": str(o["conversation_id"]) if o["conversation_id"] else None,
        "deliveryAddress": o["delivery_address"],
        "deliveryInstructions": o["delivery_instructions"],
        "paymentScreenshotReceived": o["payment_screenshot_received"],
        "paymentLink": o["payment_link"],
        "paidAt": o["paid_at"].isoformat() if o["paid_at"] else None,
        "customerId": str(o["customer_id"]),
        "customerName": await conn.fetchval(
            "SELECT display_name FROM customers WHERE id=$1", o["customer_id"]
        ),
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
        "status": o["status"],
        "city": o["delivery_city"],
        "deliveryFeeKobo": o["delivery_fee_kobo"],
        "totalKobo": o["total_kobo"],
        "paymentStatus": o["payment_status"],
        "paymentSource": o["payment_source"],
        "createdAt": o["created_at"].isoformat(),
        "paymentReview": o["payment_review"],
        "refundStatus": o["refund_status"],
        "restockedAt": o["restocked_at"].isoformat() if o["restocked_at"] else None,
        "stockMovements": [
            {
                "productId": str(m["product_id"]),
                "variantId": str(m["variant_id"]) if m["variant_id"] else None,
                "requested": m["requested"],
                "deducted": -m["delta"],
                "shortfall": m["shortfall"],
                "note": "Verified payment deduction",
            }
            for m in movements
        ],
        "timeline": [
            {
                "id": str(t["id"]),
                "at": t["occurred_at"].isoformat(),
                "label": t["label"],
                "customerMessage": t["content"],
            }
            for t in timeline
        ],
    }


async def authorize(conn, vendor, member, o):
    if o["conversation_id"]:
        await accessible(conn, vendor, member, o["conversation_id"])


@router.get("/orders")
async def list_orders(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str = "",
):
    if status and status not in domain.STATES:
        raise HTTPException(422, "Unknown order status")
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        rows = await conn.fetch(
            "SELECT o.* FROM orders o LEFT JOIN conversations c ON c.id=o.conversation_id JOIN customers cu ON cu.id=o.customer_id WHERE o.vendor_id=$1 AND ($2::text IS NULL OR o.status=$2) AND ($3::text<>'agent' OR c.assigned_member_id IS NULL OR c.assigned_member_id=$4) AND ($7='' OR cu.display_name ILIKE '%'||$7||'%') ORDER BY o.created_at DESC,o.id DESC LIMIT $5 OFFSET $6",
            vendor,
            status,
            member["role"],
            member["id"],
            limit,
            offset,
            search,
        )
        data = [await order_dto(conn, o) for o in rows]
        total = await conn.fetchval(
            "SELECT count(*) FROM orders o LEFT JOIN conversations c ON c.id=o.conversation_id JOIN customers cu ON cu.id=o.customer_id WHERE o.vendor_id=$1 AND ($2::text IS NULL OR o.status=$2) AND ($3::text<>'agent' OR c.assigned_member_id IS NULL OR c.assigned_member_id=$4) AND ($5='' OR cu.display_name ILIKE '%'||$5||'%')",
            vendor,
            status,
            member["role"],
            member["id"],
            search,
        )
    return ok({**page(data, limit), "offset": offset, "total": total})


@router.get("/orders/{oid}")
async def get_order(oid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        o = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", oid)
        if not o:
            raise HTTPException(404, "Order not found")
        await authorize(conn, vendor, member, o)
        return ok(await order_dto(conn, o))


class Transition(BaseModel):
    status: str
    expectedRevision: int = Field(ge=1)


@router.patch("/orders/{oid}/status")
async def set_status(oid: UUID, data: Transition, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        o = await domain.lock(conn, vendor, oid)
        await authorize(conn, vendor, member, o)
        o = await domain.transition(conn, o, data.status, data.expectedRevision)
        if o["status"] == "awaiting_payment" and rt.settings.paystack_secret_key.get_secret_value():
            await enqueue(conn, vendor, "checkout", "checkout:" + str(oid), order_id=oid)
        return ok(await order_dto(conn, o))


class Challenge(BaseModel):
    expectedRevision: int = Field(ge=1)


@router.post("/orders/{oid}/payment-confirmation")
async def payment_challenge(
    oid: UUID, data: Challenge, rt: RuntimeDep, user: UserDep, vendor: VendorDep
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        o = await domain.lock(conn, vendor, oid)
        if o["revision"] != data.expectedRevision or o["status"] != "awaiting_payment":
            raise HTTPException(409, "Review current awaiting-payment order")
        token = rt.crypto.cursor(
            {
                "purpose": "bank-confirm",
                "vendor": str(vendor),
                "order": str(oid),
                "user": str(user.id),
                "revision": o["revision"],
                "total": o["total_kobo"],
            }
        )
    return ok({"confirmationToken": token, "totalKobo": o["total_kobo"]})


class Confirm(Challenge):
    source: str
    confirmationToken: str
    confirmed: bool


@router.post("/orders/{oid}/payment")
async def bank_payment(oid: UUID, data: Confirm, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if data.source != "vendor" or not data.confirmed:
        raise HTTPException(422, "Explicit bank confirmation required; screenshots are not proof")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, member):
        o = await domain.lock(conn, vendor, oid)
        try:
            rt.crypto.read_cursor(
                data.confirmationToken,
                {
                    "purpose": "bank-confirm",
                    "vendor": str(vendor),
                    "order": str(oid),
                    "user": str(user.id),
                    "revision": data.expectedRevision,
                    "total": o["total_kobo"],
                },
            )
        except ValueError:
            raise HTTPException(409, "Confirmation expired or order changed") from None
        if o["payment_status"] != "paid" and o["revision"] != data.expectedRevision:
            raise HTTPException(409, "Order changed; confirm again")
        o = await domain.paid(conn, o, "vendor", "bank:" + str(oid), member["id"])
        await conn.execute(
            "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) SELECT $1,$2,'payment.bank_confirmed','order',$3 WHERE NOT EXISTS(SELECT 1 FROM audit_log WHERE vendor_id=$1 AND entity_id=$3 AND action='payment.bank_confirmed')",
            vendor,
            user.id,
            oid,
        )
        return ok(await order_dto(conn, o))


class CancelChoice(BaseModel):
    refund: bool = False
    restock: bool = False
    confirmed: bool = False


@router.post("/orders/{oid}/cancellation-actions")
async def cancellation(
    oid: UUID, data: CancelChoice, rt: RuntimeDep, user: UserDep, vendor: VendorDep
):
    if not data.confirmed or not (data.refund or data.restock):
        raise HTTPException(422, "Confirm explicit refund/restock choices")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        o = await domain.lock(conn, vendor, oid)
        if o["status"] != "cancelled" or o["payment_status"] != "paid":
            raise HTTPException(409, "Paid cancelled order required")
        if data.restock:
            await domain.restock_cancelled(conn, o, user.id)
        if data.refund and not o["refund_requested_at"]:
            await conn.execute(
                "UPDATE orders SET refund_requested_at=now(),refund_status='requested' WHERE id=$1",
                oid,
            )
            await conn.execute(
                "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'order.explicit_refund_requested','order',$3)",
                vendor,
                user.id,
                oid,
            )
            if o["payment_source"] == "paystack":
                await enqueue(conn, vendor, "refund", "refund:" + str(oid), order_id=oid)
        return ok(
            await order_dto(conn, await conn.fetchrow("SELECT * FROM orders WHERE id=$1", oid))
        )


@router.post("/orders/{oid}/checkout")
async def checkout(oid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if not rt.settings.paystack_secret_key.get_secret_value():
        raise HTTPException(503, "Paystack is not configured")
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        o = await domain.lock(conn, vendor, oid)
        if (
            o["status"] != "awaiting_payment"
            or not o["reservation_expires_at"]
            or o["reservation_expires_at"] <= datetime.now(UTC)
        ):
            raise HTTPException(409, "A current awaiting-payment reservation is required")
        jid = await enqueue(conn, vendor, "checkout", "checkout:" + str(oid), order_id=oid)
        existing = await conn.fetchrow("SELECT status,last_error_code FROM jobs WHERE id=$1", jid)
        if (
            existing["status"] == "dead"
            and existing["last_error_code"] == "PAYSTACK_NOT_CONFIGURED"
        ):
            await conn.execute(
                "UPDATE jobs SET status='queued',attempts=0,run_at=now(),last_error_code=NULL WHERE id=$1",
                jid,
            )
        elif existing["status"] == "dead":
            raise HTTPException(
                409, "Checkout needs provider reconciliation before another attempt"
            )
    await rt.queue.wake(vendor)
    return ok({"queued": True})


@router.post("/webhooks/paystack", status_code=202)
async def webhook(request: Request, rt: RuntimeDep):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 131072:
            raise HTTPException(413, "Webhook too large")
    if not paystack.signature(
        bytes(raw),
        request.headers.get("x-paystack-signature", ""),
        rt.settings.paystack_secret_key.get_secret_value(),
    ):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        envelope = json.loads(raw)
        if envelope.get("event") != "charge.success":
            return ok({"accepted": True})
        data = envelope["data"]
        reference = data["reference"]
        event_id = "charge.success:" + str(data["id"])
        if not isinstance(reference, str) or len(reference) > 128:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, "Invalid webhook") from None
    async with rt.db.transaction() as (conn, _):
        route = await conn.fetchrow("SELECT * FROM b4_payment_route($1)", reference)
    billing_route = None
    if not route:
        async with rt.db.transaction() as (conn, _):
            billing_route = await conn.fetchrow("SELECT * FROM b8_billing_route($1)", reference)
        if not billing_route:
            plan = data.get("plan_object") or data.get("plan")
            if isinstance(plan, dict):
                plan = plan.get("plan_code")
            customer = (data.get("customer") or {}).get("customer_code")
            renewal = None
            if isinstance(plan, str) and isinstance(customer, str):
                async with rt.db.transaction() as (conn, _):
                    renewal = await conn.fetchrow(
                        "SELECT * FROM b8_renewal_route($1,$2)", customer, plan
                    )
            if not renewal:
                return ok({"accepted": True})
            async with rt.db.transaction(renewal["vendor_id"]) as (conn, _):
                checkout_id = await conn.fetchval(
                    "INSERT INTO billing_checkouts(vendor_id,offer_id,reference,amount_kobo,conversations,kind,interval_months,plan_code,email) SELECT vendor_id,offer_id,$2,amount_kobo,conversations,kind,interval_months,plan_code,email FROM billing_checkouts WHERE id=$1 ON CONFLICT(reference) DO UPDATE SET reference=excluded.reference RETURNING id",
                    renewal["checkout_id"],
                    reference,
                )
            billing_route = {"vendor_id": renewal["vendor_id"], "checkout_id": checkout_id}
        route = billing_route
    vendor = route["vendor_id"]
    async with rt.db.transaction(vendor) as (conn, _):
        event = await conn.fetchval(
            "INSERT INTO webhook_events(vendor_id,provider,provider_event_id,payload_ciphertext,key_version,payload_hash,signature_verified,expires_at) VALUES($1,'paystack',$2,$3,$4,$5,true,now()+interval '7 days') ON CONFLICT DO NOTHING RETURNING id",
            vendor,
            event_id,
            rt.crypto.seal(bytes(raw), f"{vendor}:paystack:webhook"),
            rt.crypto.version,
            hashlib.sha256(raw).hexdigest(),
        )
        if event:
            await enqueue(
                conn,
                vendor,
                "billing_payment" if billing_route else "payment",
                event_id,
                order_id=None if billing_route else route["order_id"],
                billing_checkout_id=route["checkout_id"] if billing_route else None,
                webhook_event_id=event,
            )
    await rt.queue.wake(vendor)
    return ok({"accepted": True})


@router.get("/receipts")
async def list_receipts(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        rows = await conn.fetch(
            "SELECT * FROM receipts WHERE vendor_id=$1 ORDER BY receipt_number DESC LIMIT $2 OFFSET $3",
            vendor,
            limit,
            offset,
        )
        result = []
        for row in rows:
            try:
                dto = receipts.dto(row)
            except HTTPException:
                continue  # Preserve but do not invent incomplete legacy receipt snapshots.
            if rt.settings.public_web_url:
                dto["shareUrl"] = await receipts.share(conn, rt, row)
            result.append(dto)
    return ok({**page(result, limit), "offset": offset})


@router.get("/receipts/{rid}")
async def get_receipt(rid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        row = await conn.fetchrow("SELECT * FROM receipts WHERE id=$1", rid)
        if not row:
            raise HTTPException(404, "Receipt not found")
        dto = receipts.dto(row)
        if rt.settings.public_web_url:
            dto["shareUrl"] = await receipts.share(conn, rt, row)
    return ok(dto)


class Issue(BaseModel):
    orderId: UUID


@router.post("/receipts")
async def issue(data: Issue, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        o = await domain.lock(conn, vendor, data.orderId)
        rid = await domain.issue_receipt(conn, o)
    return await get_receipt(rid, rt, user, vendor)


@router.post("/receipts/{rid}/share")
async def share_receipt(rid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        row = await conn.fetchrow("SELECT * FROM receipts WHERE id=$1", rid)
        if not row:
            raise HTTPException(404, "Receipt not found")
        url = await receipts.share(conn, rt, row, renew=True)
    return ok({"url": url})


@router.post("/receipts/{rid}/revoke")
async def revoke(rid: UUID, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        if not await conn.fetchval("SELECT id FROM receipts WHERE id=$1", rid):
            raise HTTPException(404, "Receipt not found")
        await conn.execute(
            "UPDATE receipt_shares SET revoked_at=now() WHERE receipt_id=$1 AND revoked_at IS NULL",
            rid,
        )
        await conn.execute(
            "INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'receipt.links_revoked','receipt',$3)",
            vendor,
            user.id,
            rid,
        )
    return ok({"revoked": True})


class PublicToken(BaseModel):
    token: str = Field(min_length=32, max_length=2048)


@router.post("/public/receipts")
async def public_receipt(data: PublicToken, rt: RuntimeDep):
    return ok(await receipts.resolve(rt, data.token))
