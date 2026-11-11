from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.extras.api import audit
from app.pipeline.api import RuntimeDep, UserDep, VendorDep, ok

router = APIRouter(prefix="/v1")


class Pause(BaseModel):
    paused: bool


def operator(settings, user):
    if user.id not in settings.operator_user_ids:
        raise HTTPException(403, "Operator permission required")


@router.get("/health/ready")
async def readiness(rt: RuntimeDep):
    try:
        async with rt.db.transaction() as (conn, _):
            await conn.fetchval("SELECT 1")
            await conn.fetchval("SELECT b9_ai_paused($1)", UUID(int=0))
        await rt.queue.redis.ping()
    except Exception:  # noqa: BLE001 -- no connection strings/provider payloads returned
        raise HTTPException(503, "Dependencies unavailable") from None
    return ok({"database": "ok", "redis": "ok", "schema": "ok"})


@router.patch("/operations/ai-pause")
async def global_pause(data: Pause, rt: RuntimeDep, user: UserDep):
    operator(rt.settings, user)
    async with rt.db.transaction() as (conn, _):
        await conn.execute("SELECT b9_global_pause($1,$2)", data.paused, user.id)
    # Only fixed labels and actor UUID; no request body/tokens logged.
    from .telemetry import event

    event("global_ai_paused" if data.paused else "global_ai_resumed")
    return ok({"paused": data.paused})


@router.patch("/operations/vendor/ai-pause")
async def vendor_pause(data: Pause, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner",), allow_closed=True) as (conn, _):
        await conn.execute("UPDATE vendors SET ai_paused=$2 WHERE id=$1", vendor, data.paused)
        await audit(
            conn, vendor, user.id, "ai.paused" if data.paused else "ai.resumed", "vendor", vendor
        )
    return ok({"paused": data.paused})


class Feedback(BaseModel):
    category: Literal["helpful", "wrong_reply", "missing_fact", "bug", "confusing", "other"]


@router.post("/feedback")
async def feedback(data: Feedback, rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, _):
        await audit(conn, vendor, user.id, "friend.feedback." + data.category, "vendor", vendor)
    return ok({"received": True})


@router.get("/operations/vendor")
async def dashboard(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id, ("owner", "manager"), allow_closed=True) as (
        conn,
        _,
    ):
        paused = await conn.fetchval("SELECT b9_ai_paused($1)", vendor)
        jobs = await conn.fetch(
            "SELECT kind,status,count(*) count,extract(epoch from now()-min(run_at))::bigint oldest_seconds FROM jobs WHERE status IN ('queued','failed','dead','running') GROUP BY kind,status"
        )
        blocked = await conn.fetch(
            "SELECT delivery_error_code code,count(*) count FROM messages WHERE status='blocked' AND created_at>now()-interval '7 days' GROUP BY delivery_error_code"
        )
        unusual = await conn.fetch(
            "SELECT reason,status,count(*) count FROM approvals WHERE created_at>now()-interval '7 days' GROUP BY reason,status"
        )
        feedback_rows = await conn.fetch(
            "SELECT action,count(*) count FROM audit_log WHERE action LIKE 'friend.feedback.%' AND created_at>now()-interval '7 days' GROUP BY action"
        )
    alerts = any(
        r["status"] == "dead"
        or (
            r["status"] in ("queued", "failed")
            and (r["oldest_seconds"] or 0) > rt.settings.queue_alert_seconds
        )
        for r in jobs
    )
    return ok(
        {
            "aiPaused": paused,
            "backlogAlert": alerts,
            "jobs": [dict(r) for r in jobs],
            "blockedReplies": [dict(r) for r in blocked],
            "unusualAIReview": [dict(r) for r in unusual],
            "feedback": [dict(r) for r in feedback_rows],
        }
    )


@router.get("/operations/backlog")
async def backlog(rt: RuntimeDep, user: UserDep):
    operator(rt.settings, user)
    async with rt.db.transaction() as (conn, _):
        row = await conn.fetchrow("SELECT * FROM b9_backlog()")
    alert = bool(
        row["dead"]
        or row["oldest_seconds"] > rt.settings.queue_alert_seconds
        or row["worker_age_seconds"] is None
        or row["worker_age_seconds"] > rt.settings.queue_alert_seconds
    )
    if alert:
        from .telemetry import event

        event("queue_backlog")
    return ok({**dict(row), "alert": alert})
