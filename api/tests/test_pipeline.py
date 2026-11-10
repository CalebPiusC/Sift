import base64
import json
from email import policy
from email.parser import BytesParser

import httpx
import pytest
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException

from app.channels.base import Outgoing, Registry
from app.channels.gmail import ChannelError, GmailAdapter
from app.config import Settings
from app.pipeline import oauth
from app.pipeline.crypto import Crypto, b64
from app.pipeline.ingest import email_identity
from app.pipeline.jobs import backoff


def crypto():
    return Crypto(
        Settings(pipeline_keys=json.dumps({"v1": b64(b"k" * 32)}), identity_pepper=b64(b"p" * 32))
    )


def test_ciphertext_is_random_and_context_bound():
    c = crypto()
    first = c.seal(b"refresh-token", "vendor:account:tokens")
    assert first != c.seal(b"refresh-token", "vendor:account:tokens")
    assert b"refresh-token" not in first
    assert c.open(first, "v1", "vendor:account:tokens") == b"refresh-token"
    with pytest.raises(InvalidTag):
        c.open(first, "v1", "other:account:tokens")


def test_cursor_tamper_and_tenant_scope():
    c = crypto()
    token = c.cursor({"vendor": "one", "at": "now", "id": "test"})
    assert c.read_cursor(token, {"vendor": "one"})["id"] == "test"
    with pytest.raises(ValueError):
        c.read_cursor(token, {"vendor": "two"})
    with pytest.raises(ValueError):
        c.read_cursor(token + "x", {"vendor": "one"})


def test_registry_and_backoff():
    r = Registry()
    r.register("gmail", object)
    with pytest.raises(ValueError):
        r.register("gmail", object)
    with pytest.raises(ValueError):
        r.create("unknown")
    assert 8 <= backoff(3).total_seconds() < 9
    assert backoff(100).total_seconds() < 3602


def test_email_normalization_does_not_strip_identity_distinctions():
    assert email_identity("Ada <ADA+sales@Example.test>") == "ada+sales@example.test"
    with pytest.raises(ValueError):
        email_identity("not-an-email")


@pytest.mark.asyncio
async def test_gmail_thread_headers_and_no_caller_from():
    def handler(request):
        payload = json.loads(request.content)
        assert payload["threadId"] == "thread-one"
        raw = base64.urlsafe_b64decode(payload["raw"])
        mail = BytesParser(policy=policy.default).parsebytes(raw)
        assert mail["From"] is None
        assert mail["In-Reply-To"] == "<parent@example.test>"
        assert mail["References"] == "<parent@example.test>"
        assert mail["Message-ID"] == "<stable@selvora.invalid>"
        assert mail["Subject"] == "Re: Enquiry"
        return httpx.Response(200, json={"id": "sent-one"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        adapter = GmailAdapter("secret", client)
        assert (
            await adapter.send(
                Outgoing(
                    "ada@example.test",
                    "Thank you",
                    "Enquiry",
                    "thread-one",
                    "<stable@selvora.invalid>",
                    "<parent@example.test>",
                )
            )
            == "sent-one"
        )


@pytest.mark.parametrize(
    "status,ambiguous,retryable",
    [(429, False, True), (500, True, True), (401, False, False), (400, False, False)],
)
@pytest.mark.asyncio
async def test_send_failure_classification(status, ambiguous, retryable):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, json={}))
    ) as client:
        with pytest.raises(ChannelError) as caught:
            await GmailAdapter("secret", client).request("POST", "/messages/send")
        assert caught.value.ambiguous is ambiguous
        assert caught.value.retryable is retryable


@pytest.mark.asyncio
async def test_history_baseline_precedes_initial_scan():
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if request.url.path.endswith("/profile"):
            return httpx.Response(200, json={"historyId": "100"})
        return httpx.Response(200, json={"messages": [{"id": "two"}, {"id": "one"}, {"id": "one"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        ids, mark = await GmailAdapter("secret", client).fetch_history(None)
    assert ids == ["one", "two"] and mark == "100"
    assert calls[0].endswith("/profile")


@pytest.mark.asyncio
async def test_pubsub_unsigned_identity_rejected():
    s = Settings(
        gmail_push_audience="https://test/push", gmail_push_service_account="push@example.test"
    )
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"keys": []}))
    ) as client:
        with pytest.raises(HTTPException) as caught:
            await oauth.verify_push("unsigned", s, client)
    assert caught.value.status_code == 401
