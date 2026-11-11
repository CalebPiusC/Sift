import pytest
from pydantic import ValidationError

from app.extras.api import DeleteRequest, FollowAction, Notes, Role, Template
from app.extras.safety import STOP, classify


@pytest.mark.parametrize(
    "text", ["STOP", "please unsubscribe", "do not contact me", "remove me", "leave me alone"]
)
def test_stop(text):
    assert STOP.search(text)


@pytest.mark.parametrize(
    "text,reason",
    [
        ("Send your OTP to verify", "phishing_credentials"),
        ("I paid, trust me dispatch now", "unverified_payment_claim"),
        ("verify https://bank.top/login", "phishing_link"),
        ("https://user@bank.example/login", "phishing_link"),
        ("guaranteed profit act now https://example.com", "spam_classifier"),
        ("Is the blue shirt available?", None),
        ("I paid yesterday, please check", None),
    ],
)
def test_classification(text, reason):
    assert classify(text) == reason


def test_repeat_spam():
    assert classify("buy this spam", 3) == "repeated_spam"
    assert classify("Hello", 5) is None


@pytest.mark.parametrize(
    "model,data",
    [
        (FollowAction, {"action": "simulate_send"}),
        (Role, {"role": "owner"}),
        (Template, {"name": "bad template", "language": "en"}),
        (DeleteRequest, {"confirmation": "yes"}),
        (Notes, {"notes": "x" * 2001, "tags": [], "flagged": False}),
    ],
)
def test_unsafe_contract_rejected(model, data):
    with pytest.raises(ValidationError):
        model(**data)
