from decimal import Decimal
from functools import lru_cache
from typing import Literal
from uuid import UUID

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    supabase_url: str = ""
    supabase_anon_key: str = ""
    web_origins: list[str] = ["http://localhost:3000"]
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = ""
    pipeline_keys: SecretStr = SecretStr("")
    pipeline_key_version: str = "v1"
    identity_pepper: SecretStr = SecretStr("")
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: str = ""
    gmail_pubsub_topic: str = ""
    gmail_push_audience: str = ""
    gmail_push_service_account: str = ""
    pipeline_lease_seconds: int = 90
    worker_poll_seconds: float = 2
    pipeline_enabled: bool = False
    rate_limit_enabled: bool = False
    api_requests_per_minute: int = Field(default=120, ge=1)
    webhook_requests_per_minute: int = Field(default=1200, ge=1)
    operator_user_ids: list[UUID] = []
    queue_alert_seconds: int = Field(default=300, ge=1)
    paystack_secret_key: SecretStr = SecretStr("")
    public_web_url: str = ""
    whatsapp_mode: Literal["sandbox", "live"] = "sandbox"
    meta_graph_version: str = "v23.0"
    meta_app_id: str = ""
    meta_app_secret: SecretStr = SecretStr("")
    meta_verify_token: SecretStr = SecretStr("")
    meta_signup_config_id: str = ""
    whatsapp_helper_phone_id: str = ""
    whatsapp_helper_number: str = ""
    whatsapp_helper_token: SecretStr = SecretStr("")
    gemini_api_key: SecretStr = SecretStr("")
    email_api_key: SecretStr = SecretStr("")
    email_from: str = ""
    ai_input_usd_per_million: Decimal | None = Field(default=None, ge=0)
    ai_output_usd_per_million: Decimal | None = Field(default=None, ge=0)
    ai_pricing_version: str = "unconfigured"
    gemini_audio_model: str = "gemini-2.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
