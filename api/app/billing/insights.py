import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, ok

router = APIRouter(prefix="/v1")
TZ = ZoneInfo("Africa/Lagos")


@router.get("/insights")
async def insights(
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
):
    end = to or datetime.now(TZ).date()
    start = from_ or end - timedelta(days=29)
    if end < start or (end - start).days > 366:
        raise HTTPException(422, "Select an ordered range of at most 367 days")
    lo = datetime.combine(start, time.min, TZ).astimezone(UTC)
    hi = datetime.combine(end + timedelta(days=1), time.min, TZ).astimezone(UTC)
    async with rt.db.transaction(vendor, user.id, ("owner", "manager")) as (conn, _):
        # All metric facts come from immutable events, not current lead/order states.
        rows = await conn.fetch(
            "SELECT * FROM domain_events WHERE vendor_id=$1 AND occurred_at<$2 ORDER BY occurred_at,id",
            vendor,
            hi,
        )
    window = [r for r in rows if r["occurred_at"] >= lo]
    paid = [r for r in window if r["event_type"] == "order_paid"]
    received = [r for r in window if r["event_type"] == "message_received"]
    sent = [r for r in window if r["event_type"] == "reply_sent"]

    def unique(items, key):
        return len({r[key] for r in items if r[key]})

    days = {}
    products = {}
    hours = [0] * 12
    for r in paid:
        d = r["occurred_at"].astimezone(TZ).date().isoformat()
        days[d] = days.get(d, 0) + (r["amount_kobo"] or 0)
        lines = r["line_items"]
        lines = json.loads(lines) if isinstance(lines, str) else lines
        for item in lines or []:
            key = (item["productId"], item["name"])
            products[key] = products.get(key, 0) + item["quantity"]
    for r in received:
        hours[r["occurred_at"].astimezone(TZ).hour // 2] += 1
    pending = {}
    responses = []
    for r in rows:
        cid = r["conversation_id"]
        if r["event_type"] == "message_received":
            pending.setdefault(cid, r["occurred_at"])
        elif r["event_type"] == "reply_sent" and cid in pending:
            began = pending.pop(cid)
            if r["occurred_at"] >= lo:
                responses.append(max(0, (r["occurred_at"] - began).total_seconds()))
    # Funnel is a cohort: conversation first event in range, stages ever reached
    # before range end. It does not erase earlier stages when a lead advances.
    first = {}
    for r in rows:
        if r["conversation_id"]:
            first.setdefault(r["conversation_id"], r["occurred_at"])
    cohort = {cid for cid, t in first.items() if t >= lo}
    stages = [
        {
            "label": s.replace("_", " "),
            "value": len(
                {
                    r["conversation_id"]
                    for r in rows
                    if r["conversation_id"] in cohort
                    and r["event_type"] == "lead_stage_changed"
                    and r["to_stage"] == s
                }
            ),
        }
        for s in ("new", "interested", "ready_to_pay", "paid", "cold")
    ]
    open_approvals = {r["message_id"] for r in window if r["event_type"] == "approval_created"} - {
        r["message_id"] for r in rows if r["event_type"] == "approval_decided"
    }
    return ok(
        {
            "revenueKobo": sum(r["amount_kobo"] or 0 for r in paid),
            "orderCount": unique(
                [r for r in window if r["event_type"] == "order_created"], "order_id"
            ),
            "conversationCount": len(cohort),
            "pendingApprovals": len(open_approvals),
            "dailySales": [{"date": d, "revenueKobo": v} for d, v in sorted(days.items())],
            "byChannel": [
                {
                    "channel": ch,
                    "conversations": unique(
                        [r for r in received if r["channel"] == ch], "conversation_id"
                    ),
                }
                for ch in ("whatsapp", "instagram", "facebook", "tiktok", "email")
            ],
            "responseSeconds": round(sum(responses) / len(responses)) if responses else None,
            "responseSamples": len(responses),
            "stages": stages,
            "topProducts": [
                {"label": k[1], "value": v}
                for k, v in sorted(products.items(), key=lambda x: -x[1])[:5]
            ],
            "hours": [{"label": f"{i * 2:02}:00", "value": v} for i, v in enumerate(hours)],
            "handling": [
                {
                    "label": label,
                    "value": unique([r for r in sent if r["sender"] == sender], "conversation_id"),
                }
                for label, sender in (("AI", "ai"), ("Vendor", "vendor"))
            ],
            "definitions": {
                "handling": "Distinct conversations per responder; shared conversations appear in both groups",
                "funnel": "First-event cohort; stages ever reached by range end",
                "timezone": "Africa/Lagos",
                "revenue": "Gross verified order-paid events; refunds not netted",
                "legacy": "Events before migration 010 may lack sender/channel/line snapshots",
            },
        }
    )
