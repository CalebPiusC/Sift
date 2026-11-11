from datetime import datetime
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


class Identity(BaseModel):
    id: UUID
    email: str | None = None
    email_confirmed_at: datetime | None = None


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Identity:
    if credentials is None:
        raise HTTPException(401, "Sign in required")
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Authentication is not configured")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        if response.status_code in (401, 403):
            raise HTTPException(401, "Invalid or expired session")
        response.raise_for_status()
        return Identity.model_validate(response.json())
    except (httpx.HTTPError, ValidationError, ValueError):
        # Do not log tokens, response bodies, emails, message content or phone numbers.
        raise HTTPException(503, "Authentication service is unavailable") from None
