import secrets
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.channels.gmail import ChannelError
from app.commerce.paystack import Paystack
from app.pipeline.api import RuntimeDep, UserDep, VendorDep, ok

from .meter import current

router = APIRouter(prefix="/v1")


@router.get("/billing")
async def billing(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner",)) as (conn, _):
        a, m = await current(conn, vendor)
        offers = await conn.fetch("SELECT * FROM billing_offers WHERE active ORDER BY price_kobo")
        selected = await conn.fetchval(
            "SELECT offer_id FROM billing_selections WHERE vendor_id=$1", vendor
        )
        costs = await conn.fetchrow(
            "SELECT coalesce(sum(cost_usd),0) total,count(*) FILTER(WHERE cost_usd IS NULL) unknown FROM ai_cost_entries WHERE created_at>=$1 AND created_at<$2",
            m["period_start"],
            m["period_end"],
        )
    return ok(
        {
            "id": str(a["id"]),
            "vendorId": str(vendor),
            "plan": a["plan"],
            "status": a["status"],
            "trialEndsAt": a["trial_ends_at"],
            "nextBillingAt": a["next_billing_at"],
            "monthlyPriceKobo": a["monthly_price_kobo"],
            "bundleBalance": a["bundle_balance"],
            "selectedOfferId": str(selected) if selected else None,
            "usage": {"conversations": m["conversations"], "limit": m["conversation_limit"]},
            "aiCosts": {
                "currency": "USD",
                "estimatedTotal": str(costs["total"]),
                "unknownCalls": costs["unknown"],
            },
            "offers": [
                {
                    "id": str(o["id"]),
                    "name": o["name"],
                    "kind": o["kind"],
                    "priceKobo": o["price_kobo"],
                    "conversations": o["conversations"],
                    "description": o["description"],
                }
                for o in offers
            ],
        }
    )


class Selection(BaseModel):
    offerId: UUID


@router.patch("/billing/selection")
async def select(data: Selection, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner",)) as (conn, _):
        if not await conn.fetchval(
            "SELECT id FROM billing_offers WHERE id=$1 AND active", data.offerId
        ):
            raise HTTPException(404, "Offer unavailable")
        await conn.execute(
            "INSERT INTO billing_selections(vendor_id,offer_id) VALUES($1,$2) ON CONFLICT(vendor_id) DO UPDATE SET offer_id=excluded.offer_id",
            vendor,
            data.offerId,
        )
    return await billing(rt, user, vendor)


@router.post("/billing/checkout")
async def checkout(data: Selection, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    if not user.email:
        raise HTTPException(409, "Billing email required")
    iid = uuid4()
    reference = "svbill_" + secrets.token_hex(24)
    async with rt.db.transaction(vendor, user.id, ("owner",)) as (conn, _):
        await current(conn, vendor)
        o = await conn.fetchrow("SELECT * FROM billing_offers WHERE id=$1 AND active", data.offerId)
        if not o or o["price_kobo"] <= 0:
            raise HTTPException(409, "Paid offer required")
        if o["kind"] != "bundle" and not o["paystack_plan_code"]:
            raise HTTPException(503, "Paystack recurring plan is not configured for this offer")
        # A pending/uncertain initialization must be reconciled, not issued again.
        existing = await conn.fetchrow(
            "SELECT * FROM billing_checkouts WHERE offer_id=$1 AND status IN ('pending','initializing','ready','uncertain') ORDER BY created_at DESC LIMIT 1",
            o["id"],
        )
        if existing:
            if existing["authorization_url"]:
                return ok(
                    {
                        "checkoutId": str(existing["id"]),
                        "authorizationUrl": existing["authorization_url"],
                        "entitlementsChanged": False,
                    }
                )
            raise HTTPException(409, "Existing checkout needs reconciliation")
        await conn.execute(
            "INSERT INTO billing_checkouts(id,vendor_id,offer_id,reference,amount_kobo,conversations,kind,interval_months,plan_code,email,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'initializing')",
            iid,
            vendor,
            o["id"],
            reference,
            o["price_kobo"],
            o["conversations"],
            o["kind"],
            12 if o["kind"] == "yearly" else 1,
            o["paystack_plan_code"],
            user.email,
        )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            provider = Paystack(rt.settings, client)
            if o["kind"] != "bundle":
                plan = await provider.request("GET", "/plan/" + o["paystack_plan_code"])
                expected = "annually" if o["kind"] == "yearly" else "monthly"
                if (
                    plan.get("amount") != o["price_kobo"]
                    or plan.get("currency") != "NGN"
                    or plan.get("interval") != expected
                ):
                    raise ChannelError("BILLING_PLAN_MISMATCH", False)
            body = {
                "email": user.email,
                "amount": o["price_kobo"],
                "currency": "NGN",
                "reference": reference,
            }
            if o["kind"] != "bundle":
                body["plan"] = o["paystack_plan_code"]
            result = await provider.request("POST", "/transaction/initialize", json=body)
            url = result["authorization_url"]
            if not isinstance(url, str) or not url.startswith("https://checkout.paystack.com/"):
                raise ChannelError("BILLING_BAD_CHECKOUT_URL", False)
    except (ChannelError, KeyError, TypeError):
        async with rt.db.transaction(vendor) as (conn, _):
            await conn.execute(
                "UPDATE billing_checkouts SET status='uncertain' WHERE id=$1 AND status<>'paid'",
                iid,
            )
        raise HTTPException(
            502, "Checkout initialization failed; entitlements unchanged, reconcile before retry"
        ) from None
    async with rt.db.transaction(vendor) as (conn, _):
        await conn.execute(
            "UPDATE billing_checkouts SET authorization_url=$2,status=CASE WHEN status='paid' THEN status ELSE 'ready' END WHERE id=$1",
            iid,
            url,
        )
    return ok({"checkoutId": str(iid), "authorizationUrl": url, "entitlementsChanged": False})
