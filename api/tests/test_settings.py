import pytest
from pydantic import ValidationError

from app.settings.api import PreferenceUpdate

BASE = {
    "preferences": {
        "lowData": False,
        "darkMode": True,
        "language": "en",
        "notifications": {"readyToPay": True, "needsYou": False},
    },
    "expectedPreferencesRevision": "a" * 64,
}


@pytest.mark.parametrize("field", ["businessName", "memberId", "vendorId", "reply_engine_enabled"])
def test_initial_preferences_slice_refuses_business_and_ownership_fields(field):
    with pytest.raises(ValidationError):
        PreferenceUpdate.model_validate({**BASE, field: "untrusted"})


@pytest.mark.parametrize("value", [1, 0, "true", None])
def test_preference_booleans_are_not_coerced(value):
    with pytest.raises(ValidationError):
        PreferenceUpdate.model_validate(
            {**BASE, "preferences": {**BASE["preferences"], "darkMode": value}}
        )


def test_unknown_nested_fields_and_languages_are_rejected():
    for patch in [{"language": "unknown"}, {"memberId": "untrusted"}]:
        with pytest.raises(ValidationError):
            PreferenceUpdate.model_validate(
                {**BASE, "preferences": {**BASE["preferences"], **patch}}
            )


def test_revision_is_required_and_supported_document_round_trips():
    assert PreferenceUpdate.model_validate(BASE).model_dump() == BASE
    with pytest.raises(ValidationError):
        PreferenceUpdate.model_validate({"preferences": BASE["preferences"]})
