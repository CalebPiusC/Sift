from typing import Annotated, Literal
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from .auth import Identity, bearer, current_user
from .config import Settings, get_settings

app = FastAPI(title="Selvora API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().web_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["Authorization", "Content-Type"],
)


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class Vendor(BaseModel):
    id: UUID
    vendor_id: UUID
    business_name: str = Field(min_length=2, max_length=80)
    business_type: Literal["products", "services", "made-to-order", "mixed"]
    tone: Literal["friendly", "professional", "Pidgin-friendly"]


@app.get("/health", response_model=Health)
def health() -> Health:
    """Liveness only; does not claim database or Redis readiness."""
    return Health()


@app.get("/v1/me", response_model=Identity)
async def me(user: Annotated[Identity, Depends(current_user)]) -> Identity:
    return user


@app.get("/v1/vendors", response_model=list[Vendor])
async def vendors(
    user: Annotated[Identity, Depends(current_user)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[Vendor]:
    """Forward the user JWT, never a service-role key: Postgres RLS is the boundary."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/vendors",
                params={"select": "id,vendor_id,business_name,business_type,tone"},
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        response.raise_for_status()
        return [Vendor.model_validate(row) for row in response.json()]
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(503, "Workspace service is unavailable") from None
