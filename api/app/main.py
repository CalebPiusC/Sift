from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from .auth import Identity, bearer, current_user
from .config import Settings, get_settings


@asynccontextmanager
async def lifespan(application):
    yield
    runtime = getattr(application.state, "pipeline", None)
    if runtime:
        await runtime.queue.close()
        await runtime.db.close()


app = FastAPI(title="Selvora API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().web_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Vendor-Id", "Idempotency-Key"],
)


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class Vendor(BaseModel):
    id: UUID
    vendor_id: UUID
    business_name: str = Field(min_length=2, max_length=80)
    business_type: Literal["products", "services", "made-to-order", "mixed"]
    tone: Literal["friendly", "professional", "Pidgin-friendly"]


@app.get("/health", response_model=Health)
def health() -> Health:
    """Liveness only; does not claim database or Redis readiness."""
    return Health()


@app.get("/v1/me", response_model=Identity)
async def me(user: Annotated[Identity, Depends(current_user)]) -> Identity:
    return user


@app.get("/v1/vendors", response_model=list[Vendor])
async def vendors(
    user: Annotated[Identity, Depends(current_user)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[Vendor]:
    """Forward the user JWT, never a service-role key: Postgres RLS is the boundary."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/vendors",
                params={"select": "id,vendor_id,business_name,business_type,tone"},
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        response.raise_for_status()
        return [Vendor.model_validate(row) for row in response.json()]
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(503, "Workspace service is unavailable") from None


# Business pipeline is opt-in; the F0 identity/health routes remain compatible.
from fastapi.responses import JSONResponse

from .pipeline.api import router as pipeline_router

app.include_router(pipeline_router)


@app.middleware("http")
async def safe_pipeline_errors(request, call_next):
    """Do not let asyncpg/provider exceptions reach access/error logs with private values."""
    try:
        response = await call_next(request)
        if response.status_code >= 500:
            from .operations.telemetry import event

            event("request_failure")
        if request.url.path.startswith("/v1/"):
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response
    except Exception as error:  # noqa: BLE001 -- final privacy boundary, never log private exception values
        from .operations.telemetry import event

        event("request_failure")
        code = getattr(error, "sqlstate", "")
        status, label = (
            (409, "CONFLICT")
            if code == "23505"
            else (422, "VALIDATION")
            if code in ("23514", "23503") or isinstance(error, ValueError)
            else (503, "UNAVAILABLE")
        )
        return JSONResponse(
            status_code=status,
            content={
                "ok": False,
                "error": {
                    "code": label,
                    "message": "The operation could not be completed safely. Please retry or review the input.",
                    "retryable": status == 503,
                },
            },
        )


@app.exception_handler(HTTPException)
async def safe_http_error(request, error):
    if request.url.path in ("/v1/me", "/v1/vendors"):
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
    code = (
        "FORBIDDEN"
        if error.status_code in (401, 403)
        else "NOT_FOUND"
        if error.status_code == 404
        else "CONFLICT"
        if error.status_code == 409
        else "NOT_IMPLEMENTED"
        if error.status_code == 501
        else "UNAVAILABLE"
        if error.status_code >= 500
        else "VALIDATION"
    )
    return JSONResponse(
        status_code=error.status_code,
        content={
            "ok": False,
            "error": {
                "code": code,
                "message": str(error.detail),
                "retryable": code == "UNAVAILABLE",
            },
        },
    )


@app.get("/health/ready")
async def readiness(settings: Annotated[Settings, Depends(get_settings)]):
    import asyncpg
    from redis.asyncio import Redis

    checks = {"database": False, "redis": False}
    try:
        connection = await asyncpg.connect(settings.database_url, timeout=3)
        try:
            checks["database"] = await connection.fetchval("SELECT 1") == 1
        finally:
            await connection.close()
    except Exception:  # noqa: BLE001 -- readiness reports failure without leaking connection details
        checks["database"] = False
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        checks["redis"] = bool(await redis.ping())
    except Exception:  # noqa: BLE001 -- readiness reports failure without leaking connection details
        checks["redis"] = False
    finally:
        await redis.aclose()
    return JSONResponse(
        status_code=200 if all(checks.values()) else 503,
        content={"status": "ready" if all(checks.values()) else "not_ready", "checks": checks},
    )


from .replies.api import router as replies_router

app.include_router(replies_router)

from .commerce.api import router as commerce_router

app.include_router(commerce_router)

from .whatsapp.api import router as whatsapp_router

app.include_router(whatsapp_router)

from .extras.api import router as extras_router

app.include_router(extras_router)

from .billing.api import router as billing_router
from .billing.insights import router as insights_router

app.include_router(billing_router)
app.include_router(insights_router)

from .operations.api import router as operations_router

app.include_router(operations_router)


@app.middleware("http")
async def abuse_controls(request, call_next):
    from .operations.middleware import guard

    settings = app.dependency_overrides.get(get_settings, get_settings)()
    return await guard(request, call_next, settings)


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def private_validation_error(request, error):
    # FastAPI defaults include rejected input (which may contain tokens/customer PII).
    return JSONResponse(
        status_code=422,
        content={
            "ok": False,
            "error": {
                "code": "VALIDATION",
                "message": "Invalid request fields.",
                "retryable": False,
            },
        },
    )


from .settings.api import router as settings_router

app.include_router(settings_router)
