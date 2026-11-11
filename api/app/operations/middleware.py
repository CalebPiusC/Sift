import hashlib
import hmac
import time

from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError

from .telemetry import event

# Atomic fixed-window limiter shared by API replicas. No IP, JWT, URL or body is stored.
LUA = "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n"


def identity(secret, peer):
    return hmac.new(secret.encode(), peer.encode(), hashlib.sha256).hexdigest()


async def guard(request, call_next, settings):
    if not settings.rate_limit_enabled or request.url.path in ("/health", "/v1/health/ready"):
        return await call_next(request)
    # Do not trust browser-supplied forwarded headers. Configure trusted ingress
    # proxy addresses in Uvicorn, not forwarded-allow-ips='*'.
    peer = request.client.host if request.client else "unknown"
    webhook = "/webhooks/" in request.url.path
    budget = settings.webhook_requests_per_minute if webhook else settings.api_requests_per_minute
    key = (
        "limit:"
        + identity(settings.identity_pepper.get_secret_value(), peer)
        + ":"
        + ("webhook" if webhook else "api")
        + ":"
        + str(int(time.time() // 60))
    )
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        count = await redis.eval(LUA, 1, key, 120)
    except (RedisError, OSError):
        event("rate_store_unavailable")
        # Never acknowledge inbound events we did not persist. 503 invites retry.
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "error": {
                    "code": "UNAVAILABLE",
                    "message": "Please retry shortly.",
                    "retryable": True,
                },
            },
            headers={"Retry-After": "5"},
        )
    finally:
        await redis.aclose()
    if count > budget:
        event("rate_limited")
        return JSONResponse(
            status_code=429,
            content={
                "ok": False,
                "error": {
                    "code": "UNAVAILABLE",
                    "message": "Request limit reached; retry shortly.",
                    "retryable": True,
                },
            },
            headers={"Retry-After": "60"},
        )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
