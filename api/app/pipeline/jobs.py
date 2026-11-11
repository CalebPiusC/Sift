import random
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from redis.asyncio import Redis
from redis.exceptions import RedisError


async def enqueue(conn, vendor, kind, dedupe, *, run_at=None, **refs):
    names = [
        "channel_account_id",
        "conversation_id",
        "message_id",
        "order_id",
        "webhook_event_id",
        "approval_id",
        "followup_id",
        "reservation_id",
        "invitation_id",
        "restock_request_id",
        "billing_checkout_id",
    ]
    return await conn.fetchval(
        f"INSERT INTO jobs(vendor_id,kind,dedupe_key,run_at,{','.join(names)}) VALUES($1,$2,$3,$4,{','.join(f'${i + 5}' for i in range(len(names)))}) ON CONFLICT(vendor_id,kind,dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id",
        vendor,
        kind,
        dedupe,
        run_at or datetime.now(UTC),
        *(refs.get(n) for n in names),
    )


def backoff(attempt: int) -> timedelta:
    return timedelta(seconds=min(3600, 2 ** min(attempt, 11)) + random.uniform(0, 1))


class Queue:
    """Redis is a wakeup accelerator; Postgres is the durable outbox and scheduler of record."""

    def __init__(self, url: str):
        self.redis = Redis.from_url(url, socket_connect_timeout=1, socket_timeout=2)

    async def wake(self, vendor):
        try:
            await self.redis.lpush("selvora:job-vendors", str(vendor))
            await self.redis.ltrim("selvora:job-vendors", 0, 9999)
        except (RedisError, OSError):
            return  # DB scan recovers missed hints, including Redis restarts.

    async def next_vendor(self):
        try:
            row = await self.redis.brpop("selvora:job-vendors", timeout=1)
            return row[1].decode() if row else None
        except (RedisError, OSError):
            return None

    async def close(self):
        await self.redis.aclose()


async def claim(conn, vendor, lease_seconds):
    token = uuid4()
    return await conn.fetchrow(
        """
      UPDATE jobs SET status='running',attempts=attempts+1,lease_token=$2,
       locked_until=now()+make_interval(secs=>$3)
      WHERE id=(SELECT id FROM jobs WHERE vendor_id=$1 AND
       ((status IN ('queued','failed') AND run_at<=now() AND attempts<max_attempts)
        OR (status='running' AND locked_until<now() AND attempts<max_attempts))
       AND kind IN ('checkout','payment','refund','order_message','reply','gmail_sync','gmail_watch','send','holding_reply','followup','reservation_expiry','takeover_timeout')
       ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *
    """,
        vendor,
        token,
        lease_seconds,
    )
