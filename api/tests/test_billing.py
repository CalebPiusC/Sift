from copy import deepcopy

import pytest

from app.billing.service import matches

C = {
    "reference": "ref",
    "amount_kobo": 50000,
    "email": "owner@example.test",
    "kind": "monthly",
    "plan_code": "PLN_real",
}
D = {
    "reference": "ref",
    "amount": 50000,
    "email": "irrelevant",
    "status": "success",
    "currency": "NGN",
    "plan": {"plan_code": "PLN_real"},
    "customer": {"email": "OWNER@example.test"},
}


def test_verified_payment_match():
    assert matches(D, C)


@pytest.mark.parametrize(
    "field,value",
    [
        ("amount", True),
        ("amount", 49999),
        ("amount", "50000"),
        ("currency", "USD"),
        ("status", "pending"),
        ("reference", "wrong"),
        ("plan", "PLN_other"),
        ("customer", {"email": "intruder@example.test"}),
    ],
)
def test_mismatches_fail_closed(field, value):
    d = deepcopy(D)
    d[field] = value
    assert not matches(d, C)


def test_bundle_has_no_recurring_plan():
    assert matches({**D, "plan": None}, {**C, "kind": "bundle", "plan_code": None})
