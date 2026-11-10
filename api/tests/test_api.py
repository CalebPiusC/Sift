import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def config():
    get_settings.cache_clear()
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co", supabase_anon_key="public-key"
    )
    yield
    app.dependency_overrides.clear()


def test_health():
    assert TestClient(app).get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/v1/me", "/v1/vendors"])
def test_missing_token(path):
    assert TestClient(app).get(path).status_code == 401


@respx.mock
def test_rejects_forged_session():
    respx.get("https://example.supabase.co/auth/v1/user").mock(return_value=httpx.Response(401))
    response = TestClient(app).get("/v1/me", headers={"Authorization": "Bearer forged"})
    assert response.status_code == 401


@respx.mock
def test_valid_session():
    respx.get("https://example.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": USER, "email": "tola@example.com"})
    )
    response = TestClient(app).get("/v1/me", headers={"Authorization": "Bearer valid"})
    assert response.json()["id"] == USER


@respx.mock
def test_forwards_user_token_not_service_key():
    respx.get("https://example.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": USER})
    )
    route = respx.get("https://example.supabase.co/rest/v1/vendors").mock(
        return_value=httpx.Response(200, json=[])
    )
    response = TestClient(app).get("/v1/vendors", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert route.calls[0].request.headers["Authorization"] == "Bearer valid"


@respx.mock
def test_auth_outage_is_safe():
    respx.get("https://example.supabase.co/auth/v1/user").mock(
        side_effect=httpx.ConnectError("private upstream information")
    )
    response = TestClient(app).get("/v1/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 503
    assert "private" not in response.text
