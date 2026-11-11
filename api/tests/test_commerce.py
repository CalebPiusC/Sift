import hashlib
import hmac

import pytest

from app.commerce.domain import STATES
from app.commerce.paystack import matches, signature
from app.replies.core import verify


def test_signature_covers_exact_raw_bytes():
    raw = b'{"event":"charge.success"}'
    secret = "sk_test_only_a_fixture"
    sig = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    assert signature(raw, sig, secret)
    assert not signature(raw + b" ", sig, secret)
    assert not signature(raw, sig, "")
    assert not signature(raw, "invalid", secret)


@pytest.mark.parametrize(
    "change",
    [
        {"amount": 1},
        {"amount": True},
        {"currency": "USD"},
        {"reference": "other"},
        {"status": "pending"},
    ],
)
def test_payment_requires_all_reconciled_facts(change):
    order = {"checkout_reference": "sv_ref", "total_kobo": 1500000}
    data = {"reference": "sv_ref", "amount": 1500000, "currency": "NGN", "status": "success"}
    assert matches(data, order)
    assert not matches({**data, **change}, order)


def test_no_general_status_endpoint_can_mark_paid():
    assert len(STATES) == 7
    assert all("paid" not in targets for targets in STATES.values())
    assert not STATES["cancelled"] and not STATES["delivered"]


def test_payment_questions_not_payment_assertions():
    sheet = {"products": [], "total_kobo": 1500000, "payment_verified": False}
    assert verify("Your order is awaiting payment. Total: ₦15,000.", sheet).safe
    assert not verify("Payment received for your order.", sheet).safe
    assert verify("Payment received for your order.", {**sheet, "payment_verified": True}).safe


def test_only_stored_provider_links_are_allowed():
    url = "https://checkout.paystack.com/ref123"
    sheet = {"products": [], "allowed_links": [url]}
    assert verify("Pay securely: " + url, sheet).safe
    assert not verify("Pay securely: https://evil.example/ref123", sheet).safe


def test_delivery_status_is_not_a_fee_or_a_timeline_promise():
    assert verify("Your order is out for delivery.", {"order_status": "out_for_delivery"}).safe
    assert not verify("Your order is out for delivery.", {"order_status": "preparing"}).safe
    assert not verify("Delivery tomorrow.", {"order_status": "out_for_delivery"}).safe


@pytest.mark.asyncio
async def test_paystack_verification_boundary_uses_server_auth_and_encoded_reference():
    import httpx

    from app.commerce.paystack import Paystack
    from app.config import Settings

    seen = []

    def handler(request):
        seen.append(request)
        assert request.headers["Authorization"] == "Bearer sk_test_fixture_only"
        assert request.url.host == "api.paystack.co"
        return httpx.Response(
            200,
            json={
                "status": True,
                "data": {
                    "status": "success",
                    "amount": 1500000,
                    "currency": "NGN",
                    "reference": "sv_fixture",
                },
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await Paystack(
            Settings(paystack_secret_key="sk_test_fixture_only"), client
        ).verify("sv_fixture")
    assert result["amount"] == 1500000
    assert seen[0].method == "GET" and seen[0].url.path == "/transaction/verify/sv_fixture"
