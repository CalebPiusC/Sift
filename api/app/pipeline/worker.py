"""Run: python -m app.pipeline.worker. No customer content/credentials are logged."""

import asyncio
import contextlib
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx

from app.channels.base import Outgoing
from app.channels.gmail import ChannelError
from app.config import get_settings

from .crypto import Crypto
from .db import Database
from .ingest import ingest
from .jobs import Queue, backoff, claim, enqueue
from .tokens import adapter_for


class Deferred(Exception):
    def __init__(self, until):
        self.until = until


class Worker:
    def __init__(self, settings, db=None, queue=None):
        self.settings, self.crypto = settings, Crypto(settings)
        self.db, self.queue = db or Database(settings), queue or Queue(settings.redis_url)
        self.handlers = {
            "gmail_sync": self.gmail_sync,
            "gmail_watch": self.gmail_watch,
            "send": self.send,
            "reservation_expiry": self.reservation_expiry,
            "takeover_timeout": self.takeover_timeout,
            "holding_reply": self.holding_reply,
            "followup": self.followup,
        }

    async def heartbeat(self, job):
        while True:
            await asyncio.sleep(max(0.2, self.settings.pipeline_lease_seconds / 3))
            async with self.db.transaction(job["vendor_id"]) as (conn, _):
                changed = await conn.execute(
                    "UPDATE jobs SET locked_until=now()+make_interval(secs=>$3) WHERE id=$1 AND lease_token=$2 AND status='running'",
                    job["id"],
                    job["lease_token"],
                    self.settings.pipeline_lease_seconds,
                )
                if changed != "UPDATE 1":
                    raise ChannelError("JOB_LEASE_LOST", False)

    async def run_job(self, job):
        pulse = asyncio.create_task(self.heartbeat(job))
        task = None
        try:
            handler = self.handlers.get(job["kind"])
            if not handler:
                raise ChannelError("HANDLER_NOT_IMPLEMENTED", False)
            task = asyncio.create_task(handler(job))
            done, _ = await asyncio.wait({task, pulse}, return_when=asyncio.FIRST_COMPLETED)
            if pulse in done:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
                raise ChannelError("JOB_LEASE_LOST", False, ambiguous=job["kind"] == "send")
            await task
            async with self.db.transaction(job["vendor_id"]) as (conn, _):
                await conn.execute(
                    "UPDATE jobs SET status='succeeded',locked_until=NULL WHERE id=$1 AND lease_token=$2",
                    job["id"],
                    job["lease_token"],
                )
        except Deferred as deferred:
            async with self.db.transaction(job["vendor_id"]) as (conn, _):
                await conn.execute(
                    "UPDATE jobs SET status='queued',attempts=greatest(0,attempts-1),run_at=$3,locked_until=NULL WHERE id=$1 AND lease_token=$2",
                    job["id"],
                    job["lease_token"],
                    deferred.until,
                )
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 -- boundary: persist only a safe error code, never private exception text
            code = error.code if isinstance(error, ChannelError) else "WORKER_ERROR"
            retry = (
                isinstance(error, ChannelError)
                and error.retryable
                and not error.ambiguous
                and job["attempts"] < job["max_attempts"]
            )
            async with self.db.transaction(job["vendor_id"]) as (conn, _):
                if not await conn.fetchval(
                    "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='running' FOR UPDATE",
                    job["id"],
                    job["lease_token"],
                ):
                    return
                await conn.execute(
                    "UPDATE jobs SET status=$3,last_error_code=$4,run_at=$5,locked_until=NULL WHERE id=$1 AND lease_token=$2",
                    job["id"],
                    job["lease_token"],
                    "failed" if retry else "dead",
                    code,
                    datetime.now(UTC) + backoff(job["attempts"]),
                )
                if job["message_id"]:
                    await conn.execute(
                        "UPDATE messages SET status='failed',delivery_error_code=$2 WHERE id=$1 AND status NOT IN ('sent','delivered','read')",
                        job["message_id"],
                        "DELIVERY_UNCERTAIN" if getattr(error, "ambiguous", False) else code,
                    )
                    await conn.execute(
                        "UPDATE message_deliveries SET status='failed',error_code=$2 WHERE message_id=$1 AND status NOT IN ('sent','delivered','read')",
                        job["message_id"],
                        code,
                    )
                if code == "GMAIL_REVOKED" and job["channel_account_id"]:
                    await conn.execute(
                        "UPDATE channel_accounts SET status='expired' WHERE id=$1",
                        job["channel_account_id"],
                    )
        finally:
            pulse.cancel()
            if task and not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            # Heartbeat exceptions are converted to safe JOB_LEASE_LOST above.
            await asyncio.gather(pulse, return_exceptions=True)

    async def tick(self):
        async with self.db.transaction() as (conn, _):
            vendors = [
                r["vendor_id"] for r in await conn.fetch("SELECT * FROM b2_due_vendors(100)")
            ]
        hint = await self.queue.next_vendor()
        if hint:
            with contextlib.suppress(ValueError):
                vendors.insert(0, UUID(hint))
        for vendor in dict.fromkeys(vendors):
            async with self.db.transaction(vendor) as (conn, _):
                exhausted = await conn.fetch(
                    "UPDATE jobs SET status='dead',last_error_code='LEASE_EXHAUSTED' WHERE vendor_id=$1 AND status='running' AND locked_until<now() AND attempts>=max_attempts RETURNING message_id",
                    vendor,
                )
                for expired in exhausted:
                    if expired["message_id"]:
                        await conn.execute(
                            "UPDATE messages SET status='failed',delivery_error_code='DELIVERY_UNCERTAIN' WHERE id=$1 AND status='sending'",
                            expired["message_id"],
                        )
                job = await claim(conn, vendor, self.settings.pipeline_lease_seconds)
            if job:
                await self.run_job(job)

    async def gmail_sync(self, job):
        vendor, account = job["vendor_id"], job["channel_account_id"]
        async with httpx.AsyncClient(timeout=25) as client:
            adapter = await adapter_for(
                self.db, self.crypto, self.settings, vendor, account, client
            )
            async with self.db.transaction(vendor) as (conn, _):
                history = await conn.fetchval(
                    "SELECT gmail_history_id FROM channel_accounts WHERE id=$1", account
                )
            try:
                ids, latest = await adapter.fetch_history(
                    str(history) if history is not None else None
                )
            except ChannelError as error:
                if error.code != "GMAIL_NOT_FOUND":
                    raise
                ids, latest = await adapter.fetch_history(
                    None
                )  # explicit seven-day resync on expired history
            for provider_id in ids:
                try:
                    item = await adapter.receive(provider_id)
                except ChannelError as error:
                    if error.code == "GMAIL_NOT_FOUND":
                        continue
                    raise
                async with self.db.transaction(vendor) as (conn, _):
                    await ingest(
                        conn, self.crypto, vendor, account, item, adapter.deep_link(item.thread_id)
                    )
            async with self.db.transaction(vendor) as (conn, _):
                await conn.execute(
                    "UPDATE channel_accounts SET gmail_history_id=greatest(coalesce(gmail_history_id,0),$2::numeric) WHERE id=$1",
                    account,
                    int(latest),
                )
                if not job["dedupe_key"].startswith("push:"):
                    await enqueue(
                        conn,
                        vendor,
                        "gmail_sync",
                        f"poll:{account}:{job['id']}",
                        channel_account_id=account,
                        run_at=datetime.now(UTC) + timedelta(seconds=60),
                    )
                if job["webhook_event_id"]:
                    await conn.execute(
                        "UPDATE webhook_events SET processed_at=now() WHERE id=$1",
                        job["webhook_event_id"],
                    )

    async def gmail_watch(self, job):
        async with httpx.AsyncClient(timeout=25) as client:
            adapter = await adapter_for(
                self.db,
                self.crypto,
                self.settings,
                job["vendor_id"],
                job["channel_account_id"],
                client,
            )
            watch = await adapter.watch(self.settings.gmail_pubsub_topic)
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            await conn.execute(
                "UPDATE channel_accounts SET watch_expires_at=$2 WHERE id=$1",
                job["channel_account_id"],
                datetime.fromtimestamp(int(watch["expiration"]) / 1000, UTC),
            )
            await enqueue(
                conn,
                job["vendor_id"],
                "gmail_watch",
                f"renew:{job['id']}",
                channel_account_id=job["channel_account_id"],
                run_at=datetime.now(UTC) + timedelta(hours=24),
            )

    async def send(self, job):
        vendor = job["vendor_id"]
        async with self.db.transaction(vendor) as (conn, _):
            row = await conn.fetchrow(
                """SELECT m.*,c.provider_thread_id,c.channel_account_id,c.human_mode,c.human_mode_until,c.status conversation_status,
             (SELECT rfc_message_id FROM messages WHERE conversation_id=c.id AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1) parent,
             (SELECT ci.external_identity_ciphertext FROM customer_identities ci WHERE ci.customer_id=c.customer_id AND ci.channel_account_id=c.channel_account_id LIMIT 1) recipient,
             (SELECT ci.key_version FROM customer_identities ci WHERE ci.customer_id=c.customer_id AND ci.channel_account_id=c.channel_account_id LIMIT 1) recipient_version
             FROM messages m JOIN conversations c ON c.vendor_id=m.vendor_id AND c.id=m.conversation_id WHERE m.id=$1 FOR UPDATE OF m""",
                job["message_id"],
            )
            if not row or row["status"] in ("sent", "delivered", "read"):
                return
            if (
                row["sender"] == "ai"
                and row["human_mode"]
                and (not row["human_mode_until"] or row["human_mode_until"] > datetime.now(UTC))
            ):
                raise Deferred(row["human_mode_until"] or datetime.now(UTC) + timedelta(hours=1))
            if row["sender"] == "ai" and row["conversation_status"] != "open":
                await conn.execute("UPDATE messages SET status='blocked' WHERE id=$1", row["id"])
                return
            if row["sender"] == "ai":
                await self.check_hours(conn, vendor)
            if not row["recipient"]:
                raise ChannelError("RECIPIENT_UNAVAILABLE", False)
            prior_sending = (
                row["status"] == "sending" or row["delivery_error_code"] == "DELIVERY_UNCERTAIN"
            )
            if (
                job["approval_id"]
                and await conn.fetchval(
                    "SELECT status FROM approvals WHERE id=$1", job["approval_id"]
                )
                != "pending"
            ):
                await conn.execute("UPDATE messages SET status='blocked' WHERE id=$1", row["id"])
                return
            if job["followup_id"]:
                f = await conn.fetchrow(
                    "SELECT f.*,s.enabled,c.stage FROM followups f JOIN followup_settings s ON s.vendor_id=f.vendor_id JOIN conversations c ON c.vendor_id=f.vendor_id AND c.id=f.conversation_id WHERE f.id=$1",
                    job["followup_id"],
                )
                if (
                    not f
                    or f["status"] != "scheduled"
                    or not f["consent_at"]
                    or f["opt_out_at"]
                    or not f["enabled"]
                    or f["stage"] != "cold"
                ):
                    await conn.execute(
                        "UPDATE messages SET status='blocked' WHERE id=$1", row["id"]
                    )
                    return
            await conn.execute(
                "UPDATE messages SET status='sending',delivery_error_code=NULL WHERE id=$1",
                row["id"],
            )
            await conn.execute(
                "UPDATE message_deliveries SET status='sending',attempt=attempt+1 WHERE message_id=$1",
                row["id"],
            )
        async with httpx.AsyncClient(timeout=25) as client:
            adapter = await adapter_for(
                self.db, self.crypto, self.settings, vendor, row["channel_account_id"], client
            )
            found = await adapter.find_sent(row["rfc_message_id"])
            if not found and prior_sending:
                # Gmail send has no idempotency key. Never blindly resend after a crash/timeout.
                raise ChannelError("DELIVERY_UNCERTAIN", False, ambiguous=True)
            recipient = self.crypto.open(
                bytes(row["recipient"]),
                row["recipient_version"],
                f"{vendor}:{row['channel_account_id']}:identity",
            ).decode()
            provider_id = found or await adapter.send(
                Outgoing(
                    recipient,
                    row["content"],
                    row["email_subject"] or "Your enquiry",
                    row["provider_thread_id"],
                    row["rfc_message_id"],
                    row["parent"] or "",
                )
            )
        async with self.db.transaction(vendor) as (conn, _):
            owned = await conn.fetchval(
                "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND locked_until>now() FOR UPDATE",
                job["id"],
                job["lease_token"],
            )
            if not owned:
                raise ChannelError("JOB_LEASE_LOST", False, ambiguous=True)
            await conn.execute(
                "UPDATE messages SET status='sent',provider_message_id=$2,provider_account_id=$3,delivery_error_code=NULL WHERE id=$1",
                row["id"],
                provider_id,
                row["channel_account_id"],
            )
            await conn.execute(
                "UPDATE message_deliveries SET status='sent',provider_message_id=$2,sent_at=now() WHERE message_id=$1",
                row["id"],
                provider_id,
            )
            if job["approval_id"]:
                await conn.execute(
                    "UPDATE approvals SET holding_reply_sent_at=now() WHERE id=$1 AND status='pending'",
                    job["approval_id"],
                )
            if job["followup_id"]:
                await conn.execute(
                    "UPDATE followups SET status='sent',sent_at=now() WHERE id=$1 AND status='scheduled'",
                    job["followup_id"],
                )

    async def reservation_expiry(self, job):
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            await conn.execute(
                "UPDATE stock_reservations SET status='expired' WHERE order_id=$1 AND status='active' AND expires_at<=now()",
                job["order_id"],
            )

    async def takeover_timeout(self, job):
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            await conn.execute(
                "UPDATE conversations SET human_mode=false,human_mode_until=NULL WHERE id=$1 AND human_mode_until<=now()",
                job["conversation_id"],
            )

    async def check_hours(self, conn, vendor):
        settings = await conn.fetchrow("SELECT * FROM business_settings WHERE vendor_id=$1", vendor)
        if not settings or not settings["hours_enabled"]:
            return
        now = datetime.now(ZoneInfo(settings["timezone"]))
        hours = await conn.fetchrow(
            "SELECT * FROM business_hours WHERE vendor_id=$1 AND day=$2",
            vendor,
            (now.weekday() + 1) % 7,
        )
        if not hours or hours["closed"] or not hours["opens"] <= now.time() < hours["closes"]:
            raise Deferred(datetime.now(UTC) + timedelta(minutes=15))

    async def automated_intent(self, job, text):
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            c = await conn.fetchrow(
                "SELECT * FROM conversations WHERE id=$1 FOR UPDATE", job["conversation_id"]
            )
            if not c or c["status"] != "open":
                return
            if c["human_mode"] and (
                not c["human_mode_until"] or c["human_mode_until"] > datetime.now(UTC)
            ):
                raise Deferred(c["human_mode_until"] or datetime.now(UTC) + timedelta(hours=1))
            await self.check_hours(conn, job["vendor_id"])
            # Stable parent job ID is the dedupe identity for automated outgoing intent.
            existing = await conn.fetchval(
                "SELECT message_id FROM jobs WHERE vendor_id=$1 AND kind='send' AND dedupe_key=$2",
                job["vendor_id"],
                str(job["id"]),
            )
            if existing:
                return
            parent = await conn.fetchrow(
                "SELECT * FROM messages WHERE conversation_id=$1 AND sender='customer' ORDER BY created_at DESC,id DESC LIMIT 1",
                c["id"],
            )
            mid = await conn.fetchval(
                "INSERT INTO messages(vendor_id,conversation_id,sender,content,status,rfc_message_id,email_subject) VALUES($1,$2,'ai',$3,'queued',$4,$5) RETURNING id",
                job["vendor_id"],
                c["id"],
                text,
                f"<{job['id']}@selvora.invalid>",
                parent["email_subject"] if parent else "Your enquiry",
            )
            await conn.execute(
                "INSERT INTO message_deliveries(vendor_id,message_id,channel_account_id,dedupe_key) VALUES($1,$2,$3,$4)",
                job["vendor_id"],
                mid,
                c["channel_account_id"],
                str(mid),
            )
            await enqueue(
                conn,
                job["vendor_id"],
                "send",
                str(job["id"]),
                message_id=mid,
                conversation_id=c["id"],
                channel_account_id=c["channel_account_id"],
                approval_id=job["approval_id"],
                followup_id=job["followup_id"],
            )

    async def holding_reply(self, job):
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            a = await conn.fetchrow("SELECT * FROM approvals WHERE id=$1", job["approval_id"])
            if not a or a["status"] != "pending" or a["holding_reply_sent_at"]:
                return
            if a["holding_reply_due_at"] > datetime.now(UTC):
                raise Deferred(a["holding_reply_due_at"])
        await self.automated_intent(
            job,
            "Thank you for your patience. Your enquiry is with the team; we will get back to you shortly.",
        )

    async def followup(self, job):
        async with self.db.transaction(job["vendor_id"]) as (conn, _):
            f = await conn.fetchrow(
                "SELECT f.*,s.enabled,c.stage FROM followups f JOIN followup_settings s ON s.vendor_id=f.vendor_id JOIN conversations c ON c.id=f.conversation_id AND c.vendor_id=f.vendor_id WHERE f.id=$1",
                job["followup_id"],
            )
            if (
                not f
                or f["status"] != "scheduled"
                or not f["consent_at"]
                or f["opt_out_at"]
                or f["stage"] != "cold"
            ):
                return
            if not f["enabled"]:
                raise Deferred(datetime.now(UTC) + timedelta(hours=1))
            if f["scheduled_at"] > datetime.now(UTC):
                raise Deferred(f["scheduled_at"])
        await self.automated_intent(job, f["content"])

    async def run(self):
        try:
            while True:
                await self.tick()
                await asyncio.sleep(self.settings.worker_poll_seconds)
        finally:
            await self.queue.close()
            await self.db.close()


if __name__ == "__main__":
    asyncio.run(Worker(get_settings()).run())
