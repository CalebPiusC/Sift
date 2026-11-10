from functools import lru_cache

from pydantic import SecretStr
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
