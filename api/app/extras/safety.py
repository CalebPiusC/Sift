"""Inbound classification and the common final-send suppression boundary."""

import ipaddress
import re
from urllib.parse import urlparse

from app.pipeline.jobs import enqueue
from app.replies.core import detect

STOP = re.compile(
    r"\b(?:stop|unsubscribe|opt[ -]?out|do not (?:message|contact|text)|don't (?:message|contact|text)|remove me|leave me alone|no more messages)\b",
    re.IGNORECASE,
)


def classify(text, repeats=0):
    """Conservative feature classifier plus non-negotiable fraud/phishing rules.

    This is a transparent local classifier, not an unvalidated LLM verdict.
    Classification only suppresses automation; it never asserts payment evidence.
    """
    lower = text.casefold()
    if re.search(r"\b(?:otp|one.time.password|seed phrase|private key)\b", lower) and re.search(
        r"\b(?:send|share|enter|verify|give)\b", lower
    ):
        return "phishing_credentials"
    if (
        re.search(r"\b(?:paid|payment|transfer|screenshot)\b", lower)
        and re.search(r"\b(?:release|dispatch|ship)\b", lower)
        and re.search(r"\b(?:screenshot|no need to check|trust me|proof)\b", lower)
    ):
        return "unverified_payment_claim"
    for raw in re.findall(r"https?://[^\s<>]+", text, re.IGNORECASE):
        parsed = urlparse(raw)
        host = parsed.hostname or ""
        try:
            ipaddress.ip_address(host)
            numeric = True
        except ValueError:
            numeric = False
        if (
            parsed.username
            or numeric
            or (
                host.endswith((".zip", ".top", ".click"))
                and re.search(r"login|verify|bank|claim|password", raw, re.IGNORECASE)
            )
        ):
            return "phishing_link"
    # A small lexical score is an independent spam classifier, not an allow-all switch.
    score = sum(
        weight
        for pattern, weight in (
            (r"guaranteed.{0,20}(?:profit|return)", 3),
            (r"free money|double your money", 3),
            (r"click.{0,20}(?:claim|prize|winner)", 2),
            (r"urgent|act now", 1),
            (r"https?://", 1),
        )
        if re.search(pattern, lower)
    )
    if score >= 4:
        return "spam_classifier"
    if repeats >= 3 and len(text.strip()) >= 8:
        return "repeated_spam"
    return None


async def allowed(conn, vendor, cid):
    return not await conn.fetchval(
        """SELECT EXISTS(
      SELECT 1 FROM conversations c JOIN customers cu ON cu.id=c.customer_id AND cu.vendor_id=c.vendor_id JOIN vendors v ON v.id=c.vendor_id WHERE c.id=$1 AND (
       v.deletion_requested_at IS NOT NULL OR cu.opted_out_at IS NOT NULL OR EXISTS(
        SELECT 1 FROM customer_identities i WHERE i.customer_id=cu.id AND (i.opted_out_at IS NOT NULL OR EXISTS(SELECT 1 FROM customer_identities s WHERE s.vendor_id=i.vendor_id AND s.external_identity_hash=i.external_identity_hash AND s.opted_out_at IS NOT NULL) OR EXISTS(SELECT 1 FROM blocked_identities b WHERE b.identity_id=i.id AND b.active)))
       OR EXISTS(SELECT 1 FROM moderation_flags f JOIN messages m ON m.id=f.message_id WHERE m.conversation_id=c.id AND f.status IN ('flagged','blocked'))))""",
        cid,
    )


async def opt_out(conn, vendor, customer):
    await conn.execute(
        "UPDATE customers SET opted_out_at=coalesce(opted_out_at,now()) WHERE id=$1", customer
    )
    await conn.execute(
        "UPDATE customer_identities SET opted_out_at=coalesce(opted_out_at,now()) WHERE customer_id=$1",
        customer,
    )
    await conn.execute(
        "UPDATE followups SET status='cancelled',opt_out_at=coalesce(opt_out_at,now()) WHERE customer_id=$1 AND status='scheduled'",
        customer,
    )
    await conn.execute(
        "UPDATE restock_requests SET status='cancelled' WHERE customer_id=$1 AND status='waiting'",
        customer,
    )
    await conn.execute(
        "UPDATE messages SET status='blocked',delivery_error_code='CONTACT_SUPPRESSED' WHERE conversation_id IN (SELECT id FROM conversations WHERE customer_id=$1) AND sender<>'customer' AND status IN ('queued','draft','pending_approval','failed')",
        customer,
    )


async def inbound(conn, vendor, mid):
    msg = await conn.fetchrow(
        "SELECT m.*,c.customer_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1",
        mid,
    )
    text = msg["voice_transcript"] or msg["content"]
    if STOP.search(text):
        await opt_out(conn, vendor, msg["customer_id"])
        await conn.execute(
            "UPDATE messages SET lane='paused',lane_reason='customer_opt_out' WHERE id=$1", mid
        )
        return
    repeats = await conn.fetchval(
        "SELECT count(*) FROM messages WHERE conversation_id=$1 AND sender='customer' AND lower(content)=lower($2) AND created_at>now()-interval '1 hour'",
        msg["conversation_id"],
        text,
    )
    reason = classify(text, repeats)
    if reason:
        flag = await conn.fetchval(
            "INSERT INTO moderation_flags(vendor_id,message_id,reason) VALUES($1,$2,$3) RETURNING id",
            vendor,
            mid,
            reason,
        )
        await conn.execute(
            "UPDATE messages SET lane='paused',lane_reason='moderation_review' WHERE id=$1", mid
        )
        await conn.execute(
            "INSERT INTO notifications(vendor_id,member_id,conversation_id,kind,dedupe_key) SELECT $1,id,$2,'system',$3 FROM vendor_members WHERE vendor_id=$1 AND status='active' AND role IN ('owner','manager') ON CONFLICT DO NOTHING",
            vendor,
            msg["conversation_id"],
            "flag:" + str(flag),
        )
    if detect(text).language != "en":
        await enqueue(
            conn,
            vendor,
            "translation",
            "translation:" + str(mid),
            message_id=mid,
            conversation_id=msg["conversation_id"],
        )
