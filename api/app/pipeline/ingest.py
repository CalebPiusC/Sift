from datetime import UTC, datetime
from email.utils import parseaddr
from uuid import uuid4

from app.channels.base import Incoming


def email_identity(address: str) -> str:
    _, address = parseaddr(address)
    if not address or "@" not in address or any(c in address for c in "\r\n"):
        raise ValueError("Invalid email identity")
    # No dot/plus stripping: those equivalences must never merge unrelated provider identities.
    return address.casefold()


async def ingest(conn, crypto, vendor, account, item: Incoming, deep_link: str):
    address = email_identity(item.sender_email)
    digest = crypto.digest("email", address)
    # Per-account lock prevents races creating two customer/thread records for the same sender.
    await conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", f"{account}:{digest}"
    )
    existing = await conn.fetchval(
        "SELECT id FROM messages WHERE vendor_id=$1 AND provider_account_id=$2 AND provider_message_id=$3",
        vendor,
        account,
        item.provider_id,
    )
    if existing:
        return existing
    if item.outgoing:
        own = await conn.fetchval(
            "SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.vendor_id=$1 AND c.channel_account_id=$2 AND m.rfc_message_id=$3 AND m.sender IN ('vendor','ai') LIMIT 1 FOR UPDATE OF m",
            vendor,
            account,
            item.rfc_id,
        )
        if own:
            await conn.execute(
                "UPDATE messages SET status='sent',provider_account_id=$2,provider_message_id=$3,delivery_error_code=NULL WHERE id=$1",
                own,
                account,
                item.provider_id,
            )
            await conn.execute(
                "UPDATE message_deliveries SET status='sent',provider_message_id=$2,sent_at=coalesce(sent_at,now()) WHERE message_id=$1",
                own,
                item.provider_id,
            )
            return own
        if not await conn.fetchval(
            "SELECT id FROM conversations WHERE vendor_id=$1 AND channel_account_id=$2 AND provider_thread_id=$3",
            vendor,
            account,
            item.thread_id,
        ):
            return None  # Do not turn unrelated Sent mail into a new customer enquiry.
    identity = await conn.fetchrow(
        "SELECT * FROM customer_identities WHERE vendor_id=$1 AND channel_account_id=$2 AND external_identity_hash=$3",
        vendor,
        account,
        digest,
    )
    if identity:
        customer = identity["customer_id"]
    else:
        # An arbitrary From header is not verified identity, even if another channel is.
        # Keep separate until an authorized manual merge or a verified identity proof.
        customer = await conn.fetchval(
            "INSERT INTO customers(vendor_id,display_name,email) VALUES($1,$2,$3) RETURNING id",
            vendor,
            item.sender_name or address,
            address,
        )
        await conn.execute(
            "INSERT INTO customer_identities(vendor_id,customer_id,channel_account_id,external_identity_hash,external_identity_ciphertext,key_version) VALUES($1,$2,$3,$4,$5,$6)",
            vendor,
            customer,
            account,
            digest,
            crypto.seal(address.encode(), f"{vendor}:{account}:identity"),
            crypto.version,
        )
    thread = await conn.fetchrow(
        "SELECT id FROM conversations WHERE vendor_id=$1 AND channel_account_id=$2 AND provider_thread_id=$3",
        vendor,
        account,
        item.thread_id,
    )
    if not thread:
        thread_id = await conn.fetchval(
            "INSERT INTO conversations(vendor_id,customer_id,channel_account_id,provider_thread_id,thread_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
            vendor,
            customer,
            account,
            item.thread_id,
            deep_link,
        )
    else:
        thread_id = thread["id"]
    timestamp = datetime.fromtimestamp(item.occurred_ms / 1000, UTC)
    mid = uuid4()
    await conn.execute(
        """INSERT INTO messages(id,vendor_id,conversation_id,external_message_id,provider_message_id,rfc_message_id,email_subject,sender,content,status,language,created_at,provider_account_id)
     VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'en',$10,$11) ON CONFLICT(vendor_id,conversation_id,external_message_id) DO NOTHING""",
        mid,
        vendor,
        thread_id,
        item.provider_id,
        item.rfc_id,
        item.subject,
        "vendor" if item.outgoing else "customer",
        item.text,
        "sent" if item.outgoing else "received",
        timestamp,
        account,
    )
    # Out-of-order history cannot move the inbox backwards.
    await conn.execute(
        """UPDATE conversations SET last_message_id=$2,updated_at=greatest(updated_at,$3) WHERE id=$1 AND
     (last_message_id IS NULL OR (SELECT created_at FROM messages WHERE id=last_message_id)<=$3)""",
        thread_id,
        mid,
        timestamp,
    )
    return mid
