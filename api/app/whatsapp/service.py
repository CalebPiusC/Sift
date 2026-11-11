import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.channels import registry
from app.channels.base import Incoming, Outgoing
from app.channels.gmail import ChannelError
from app.pipeline.ingest import ingest
from app.pipeline.jobs import enqueue

from . import instructions
from .cloud import http_client, phone
from .codes import Codes


def codes(rt):
    return Codes(rt.queue.redis, rt.crypto)


async def helper_account(rt, conn, vendor):
    return await conn.fetchval(
        "INSERT INTO channel_accounts(vendor_id,channel,provider,external_account_id,display_name,status,helper_account) VALUES($1,'whatsapp','whatsapp',$2,'Selvora helper','connected',true) ON CONFLICT(channel,external_account_id) DO UPDATE SET status='connected' RETURNING id",
        vendor,
        "helper:" + str(vendor),
    )


async def accept(rt, value):
    """Signed, bounded ingress. Acknowledge only after encrypted envelope + job commit."""
    phone_id = value.get("metadata", {}).get("phone_number_id", "")
    helper = phone_id == rt.settings.whatsapp_helper_phone_id and bool(phone_id)
    if not helper:
        async with rt.db.transaction() as (conn, _):
            route = await conn.fetchrow("SELECT * FROM b5_whatsapp_route($1)", phone_id)
        if not route:
            return
    for message in value.get("messages", []):
        sender = phone(message.get("from", ""))
        mid = message.get("id", "")
        if not re.fullmatch(r"[A-Za-z0-9_.:=+-]{1,300}", mid) or message.get("type") not in (
            "text",
            "audio",
            "image",
        ):
            continue
        text = message.get("text", {}).get("body", "")
        member = None
        if helper:
            async with rt.db.transaction() as (conn, _):
                linked = await conn.fetchrow(
                    "SELECT * FROM b5_helper_route($1)", rt.crypto.digest("wa-sender", sender)
                )
            # A four-digit capability always means (re)link, not a catalogue instruction.
            binding = (
                await codes(rt).consume(sender, text, mid) if re.fullmatch(r"\d{4}", text) else None
            )
            if isinstance(binding, dict):
                vendor, member = UUID(binding["vendor"]), UUID(binding["member"])
                async with rt.db.transaction(vendor) as (conn, _):
                    valid = await conn.fetchval(
                        "SELECT id FROM vendor_members WHERE id=$1 AND status='active' AND role IN ('owner','manager')",
                        member,
                    )
                    if not valid:
                        continue
                    await conn.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
                        f"wa-code:{vendor}:{member}",
                    )
                    pending = await conn.fetchval(
                        "SELECT id FROM helper_links WHERE id=$1 AND member_id=$2 AND status='pending' AND expires_at>now() FOR UPDATE",
                        UUID(binding["id"]),
                        member,
                    )
                    if not pending:
                        continue
                    await conn.execute(
                        "UPDATE helper_links SET status='invalidated',linked_at=NULL,pending_proposal_id=NULL WHERE vendor_id=$1 AND member_id=$2",
                        vendor,
                        member,
                    )
                    await conn.execute(
                        "UPDATE helper_links SET status='linked',linked_at=now(),sender_hash=$6,helper_number_ciphertext=$7,key_version=$8 WHERE id=$1 AND vendor_id=$2 AND member_id=$3 AND code_hash=$4 AND expires_at=$5",
                        UUID(binding["id"]),
                        vendor,
                        member,
                        binding["hash"],
                        datetime.fromtimestamp(binding["expires"], UTC),
                        rt.crypto.digest("wa-sender", sender),
                        rt.crypto.seal(sender.encode(), f"{vendor}:helper"),
                        rt.crypto.version,
                    )
                    account = await helper_account(rt, conn, vendor)
                message = {**message, "_linked": True}
            elif linked and not (binding in ("invalid", "locked")):
                vendor, member = linked["vendor_id"], linked["member_id"]
                async with rt.db.transaction(vendor) as (conn, _):
                    account = await helper_account(rt, conn, vendor)
            else:
                continue  # Invalid code response never discloses whether a vendor exists.
        else:
            vendor, account = route["vendor_id"], route["account_id"]
        envelope = {
            "message": message,
            "contacts": value.get("contacts", []),
            "helper": helper,
            "sender": sender,
        }
        async with rt.db.transaction(vendor) as (conn, _):
            event = await conn.fetchval(
                "INSERT INTO webhook_events(vendor_id,channel_account_id,provider,provider_event_id,payload_ciphertext,key_version,payload_hash,signature_verified,expires_at,helper_member_id) VALUES($1,$2,'whatsapp',$3,$4,$5,$6,true,now()+interval '30 days',$7) ON CONFLICT DO NOTHING RETURNING id",
                vendor,
                account,
                mid,
                rt.crypto.seal(json.dumps(envelope).encode(), f"{vendor}:{account}:wa-event"),
                rt.crypto.version,
                hashlib.sha256(json.dumps(envelope, sort_keys=True).encode()).hexdigest(),
                member,
            )
            if event:
                await enqueue(
                    conn,
                    vendor,
                    "ingest",
                    "wa:" + mid,
                    channel_account_id=account,
                    webhook_event_id=event,
                )
        await rt.queue.wake(vendor)
    # Delivery receipts are account-scoped and monotonic. No text is sent from receipts.
    if not helper:
        for status in value.get("statuses", []):
            state = status.get("status")
            if state not in ("sent", "delivered", "read", "failed"):
                continue
            async with rt.db.transaction(route["vendor_id"]) as (conn, _):
                await conn.execute(
                    "UPDATE messages SET status=$3 WHERE provider_account_id=$1 AND provider_message_id=$2 AND (($3='failed' AND status IN ('queued','sending','sent')) OR (CASE status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 WHEN 'failed' THEN 1 ELSE 0 END)<(CASE $3 WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END))",
                    route["account_id"],
                    status.get("id", ""),
                    state,
                )
                await conn.execute(
                    "UPDATE message_deliveries SET status=m.status FROM messages m WHERE message_deliveries.message_id=m.id AND m.provider_account_id=$1 AND m.provider_message_id=$2",
                    route["account_id"],
                    status.get("id", ""),
                )


async def adapter(rt, conn, vendor, account, client, last=None):
    row = await conn.fetchrow(
        "SELECT * FROM channel_accounts WHERE id=$1 AND status='connected'", account
    )
    if not row or row["provider"] != "whatsapp":
        raise ChannelError("WHATSAPP_REVOKED", False)
    if row["helper_account"]:
        token = rt.settings.whatsapp_helper_token.get_secret_value()
        phone_id = rt.settings.whatsapp_helper_phone_id
    else:
        tokens = await conn.fetchrow(
            "SELECT * FROM channel_tokens WHERE channel_account_id=$1 AND revoked_at IS NULL",
            account,
        )
        if not tokens:
            raise ChannelError("WHATSAPP_REVOKED", False)
        token = json.loads(
            rt.crypto.open(
                bytes(tokens["ciphertext"]), tokens["key_version"], f"{vendor}:{account}:tokens"
            )
        )["access_token"]
        phone_id = row["external_account_id"]
    return registry.create(
        "whatsapp", rt.settings, token, phone_id, row["whatsapp_waba_id"] or "", client, last
    )


async def process(worker, job):
    vendor, account = job["vendor_id"], job["channel_account_id"]
    async with worker.db.transaction(vendor) as (conn, _):
        event = await conn.fetchrow(
            "SELECT * FROM webhook_events WHERE id=$1", job["webhook_event_id"]
        )
        if not event:
            return
        if event["processed_at"] and (not event["helper_reply"] or event["helper_provider_id"]):
            return
        data = json.loads(
            worker.crypto.open(
                bytes(event["payload_ciphertext"]),
                event["key_version"],
                f"{vendor}:{account}:wa-event",
            )
        )
    message = data["message"]
    try:
        timestamp = datetime.fromtimestamp(int(message["timestamp"]), UTC)
        if timestamp > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError()
    except (KeyError, ValueError, OverflowError, TypeError):
        raise ChannelError("WHATSAPP_BAD_TIMESTAMP", False) from None
    text, language = message.get("text", {}).get("body", "")[:10000], "en"
    async with http_client(worker.settings) as client:
        async with worker.db.transaction(vendor) as (conn, _):
            cloud = await adapter(worker, conn, vendor, account, client, timestamp)
        if event["processed_at"]:
            await send_helper(worker, job, cloud, event["id"], data["sender"])
            return
        if message["type"] in ("audio", "image"):
            if not event["media_ciphertext"]:
                raw, mime = await cloud.media(message[message["type"]]["id"])
                async with worker.db.transaction(vendor) as (conn, _):
                    await conn.execute(
                        "UPDATE webhook_events SET media_ciphertext=$2,media_key_version=$3,media_mime=$4 WHERE id=$1",
                        event["id"],
                        worker.crypto.seal(raw, f"{vendor}:{event['id']}:media"),
                        worker.crypto.version,
                        mime,
                    )
            else:
                raw, mime = (
                    worker.crypto.open(
                        bytes(event["media_ciphertext"]),
                        event["media_key_version"],
                        f"{vendor}:{event['id']}:media",
                    ),
                    event["media_mime"],
                )
            if message["type"] == "audio":
                text, language = (
                    (event["transcript"], event["detected_language"])
                    if event["transcript"]
                    else await cloud.transcribe(raw, mime)
                )
                if not event["transcript"]:
                    from app.billing.meter import cost

                    async with worker.db.transaction(vendor) as (cost_conn, _):
                        await cost(
                            cost_conn,
                            vendor,
                            "audio:" + str(event["id"]) + ":" + str(job["attempts"]),
                            worker.settings.gemini_audio_model,
                            "transcription",
                            getattr(cloud, "last_usage", {}),
                            worker.settings,
                        )
            else:
                text = (
                    message["image"].get("caption", "")[:1000]
                    or "[Image received; content needs human review]"
                )
            async with worker.db.transaction(vendor) as (conn, _):
                await conn.execute(
                    "UPDATE webhook_events SET transcript=$2,detected_language=$3 WHERE id=$1",
                    event["id"],
                    text,
                    language,
                )
        async with worker.db.transaction(vendor) as (conn, _):
            event = await conn.fetchrow(
                "SELECT * FROM webhook_events WHERE id=$1 FOR UPDATE", event["id"]
            )
            if event["processed_at"]:
                return
            if data["helper"]:
                result = await helper_instruction(
                    conn,
                    vendor,
                    event["helper_member_id"],
                    worker.crypto.digest("wa-sender", data["sender"]),
                    text,
                    message.get("_linked", False),
                )
                # Persist before POST; crashes/ambiguous sends are never blindly replayed.
                await conn.execute(
                    "UPDATE webhook_events SET transcript=$2,helper_reply=$3,processed_at=now() WHERE id=$1",
                    event["id"],
                    text,
                    result,
                )
            else:
                item = Incoming(
                    message["id"],
                    data["sender"],
                    data["sender"],
                    (
                        data["contacts"][0].get("profile", {}).get("name", "")
                        if data["contacts"]
                        else ""
                    ),
                    text,
                    "",
                    "",
                    int(timestamp.timestamp() * 1000),
                )
                mid = await ingest(
                    conn,
                    worker.crypto,
                    vendor,
                    account,
                    item,
                    "https://wa.me/" + data["sender"],
                    channel="whatsapp",
                )
                await conn.execute(
                    "UPDATE messages SET kind=$2,voice_transcript=$3,detected_language=$4,language=$5,media_language=$6,lane=CASE WHEN $7 THEN 'paused' ELSE lane END,lane_reason=CASE WHEN $7 THEN 'media_review' ELSE lane_reason END WHERE id=$1",
                    mid,
                    "voice" if message["type"] == "audio" else "text",
                    text if message["type"] == "audio" else None,
                    language if language in ("en", "pcm") else "other",
                    language if language in ("en", "pcm") else "und",
                    language,
                    message["type"] == "image" or language not in ("en", "pcm"),
                )
                await conn.execute(
                    "UPDATE conversations SET last_customer_at=greatest(coalesce(last_customer_at,$2),$2) WHERE id=(SELECT conversation_id FROM messages WHERE id=$1)",
                    mid,
                    timestamp,
                )
                # Images/unknown-language transcripts are facts for a human, not AI visual proof.
                if message["type"] != "image" and language in ("en", "pcm"):
                    await enqueue(
                        conn,
                        vendor,
                        "reply",
                        "reply:" + str(mid),
                        message_id=mid,
                        channel_account_id=account,
                    )
                await conn.execute(
                    "UPDATE webhook_events SET processed_at=now() WHERE id=$1", event["id"]
                )
        if data["helper"]:
            await send_helper(worker, job, cloud, event["id"], data["sender"])
    await worker.queue.wake(vendor)


async def send_helper(worker, job, cloud, event_id, sender):
    vendor = job["vendor_id"]
    async with worker.db.transaction(vendor) as (conn, _):
        owned = await conn.fetchval(
            "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND locked_until>now() FOR UPDATE",
            job["id"],
            job["lease_token"],
        )
        if not owned:
            raise ChannelError("JOB_LEASE_LOST", False)
        event = await conn.fetchrow("SELECT * FROM webhook_events WHERE id=$1 FOR UPDATE", event_id)
        if event["helper_provider_id"]:
            return
        if event["helper_send_started_at"]:
            raise ChannelError("HELPER_DELIVERY_UNCERTAIN", False, ambiguous=True)
        await conn.execute(
            "UPDATE webhook_events SET helper_send_started_at=now() WHERE id=$1", event_id
        )
    provider_id = await cloud.send(Outgoing(sender, event["helper_reply"], "", "", "", ""))
    async with worker.db.transaction(vendor) as (conn, _):
        await conn.execute(
            "UPDATE webhook_events SET helper_provider_id=$2 WHERE id=$1", event_id, provider_id
        )


async def helper_instruction(conn, vendor, member, sender_hash, text, linked):
    link = await conn.fetchrow(
        "SELECT h.* FROM helper_links h JOIN vendor_members m ON m.id=h.member_id AND m.vendor_id=h.vendor_id WHERE h.member_id=$1 AND h.sender_hash=$2 AND h.status='linked' AND m.status='active' AND m.role IN ('owner','manager') FOR UPDATE OF h",
        member,
        sender_hash,
    )
    if not link:
        raise ChannelError("HELPER_NOT_AUTHORIZED", False)
    if linked:
        return "Your Selvora helper is linked. Send a stock/price instruction; every change needs YES confirmation."
    try:
        if text.strip().casefold() == "yes":
            if not link["pending_proposal_id"]:
                return "No pending change. Send an instruction first."
            proposal = await conn.fetchrow(
                "SELECT * FROM typed_proposals WHERE id=$1", link["pending_proposal_id"]
            )
            candidates = json.loads(proposal["candidates"])
            if len(candidates) != 1:
                return "Choose the exact item in the app. Nothing changed."
            # Savepoint prevents a validation error rolling back the inbound transcript.
            async with conn.transaction():
                updated = await instructions.confirm(
                    conn, vendor, member, proposal["id"], UUID(candidates[0]["id"])
                )
            await conn.execute(
                "UPDATE helper_links SET pending_proposal_id=NULL WHERE id=$1", link["id"]
            )
            return f"Updated {updated['name']}."
        await conn.execute(
            "UPDATE helper_links SET pending_proposal_id=NULL WHERE id=$1", link["id"]
        )
        if text.strip().casefold() in ("no", "cancel"):
            return "Cancelled. Nothing changed."
        if text.strip().casefold().rstrip("?") == "how many orders today":
            start = datetime.now(ZoneInfo("Africa/Lagos")).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            count = await conn.fetchval(
                "SELECT count(*) FROM orders WHERE vendor_id=$1 AND created_at >= $2 AND created_at < $3",
                vendor,
                start,
                start + timedelta(days=1),
            )
            return f"{count} orders created today (Africa/Lagos)."
        if len(text) > 4000:
            return "Instruction too long. Nothing changed."
        async with conn.transaction():
            proposal = await instructions.propose(conn, vendor, member, text)
        if len(proposal["candidates"]) != 1:
            return "More than one item matches. Use its exact catalogue name. Nothing changed."
        await conn.execute(
            "UPDATE helper_links SET pending_proposal_id=$2 WHERE id=$1",
            link["id"],
            UUID(proposal["id"]),
        )
        return (
            proposal["candidates"][0]["summary"]
            + " Reply YES to confirm, or NO to cancel. Expires in 10 minutes."
        )
    except HTTPException as error:
        return str(error.detail) + " Nothing changed."
