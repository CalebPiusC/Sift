import base64
import hashlib
import json
import secrets
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException

from app.channels.gmail import GmailAdapter

from .ingest import email_identity
from .jobs import enqueue

_jwks = {"expires": 0, "keys": []}


async def verify_push(token: str, settings, client):
    if not settings.gmail_push_audience or not settings.gmail_push_service_account:
        raise HTTPException(503, "Gmail push verification is not configured")
    try:
        if _jwks["expires"] < time.time():
            response = await client.get("https://www.googleapis.com/oauth2/v3/certs")
            response.raise_for_status()
            _jwks.update(keys=response.json()["keys"], expires=time.time() + 600)
        header = jwt.get_unverified_header(token)
        key = next(k for k in _jwks["keys"] if k["kid"] == header.get("kid"))
        claims = jwt.decode(
            token,
            jwt.PyJWK.from_dict(key).key,
            algorithms=["RS256"],
            audience=settings.gmail_push_audience,
            issuer=["https://accounts.google.com", "accounts.google.com"],
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
        if (
            claims.get("email") != settings.gmail_push_service_account
            or claims.get("email_verified") is not True
        ):
            raise ValueError()
    except (jwt.PyJWTError, httpx.HTTPError, ValueError, KeyError, StopIteration, TypeError):
        _jwks["expires"] = 0  # next request refetches on unknown rotated key
        raise HTTPException(401, "Invalid push identity") from None


async def begin(runtime, vendor, member):
    s, crypto = runtime.settings, runtime.crypto
    if not all(
        [
            s.google_client_id,
            s.google_client_secret.get_secret_value(),
            s.google_redirect_uri,
            s.gmail_pubsub_topic,
            s.gmail_push_audience,
            s.gmail_push_service_account,
        ]
    ):
        raise HTTPException(503, "Gmail configuration is incomplete")
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    )
    async with runtime.db.transaction(vendor) as (conn, _):
        account = await conn.fetchval(
            "SELECT id FROM channel_accounts WHERE vendor_id=$1 AND provider='gmail' ORDER BY created_at LIMIT 1 FOR UPDATE",
            vendor,
        )
        if not account:
            account = await conn.fetchval(
                "INSERT INTO channel_accounts(vendor_id,channel,provider,external_account_id,display_name) VALUES($1,'email','gmail',$2,'Gmail') RETURNING id",
                vendor,
                secrets.token_urlsafe(24),
            )
        await conn.execute(
            "UPDATE channel_attempts SET status='cancelled' WHERE channel_account_id=$1 AND status='pending'",
            account,
        )
        expires = datetime.now(UTC) + timedelta(minutes=10)
        context = crypto.seal(
            json.dumps({"verifier": verifier}).encode(), f"{vendor}:{account}:oauth"
        )
        attempt = await conn.fetchval(
            "INSERT INTO channel_attempts(vendor_id,channel_account_id,state_hash,expires_at,oauth_context_ciphertext,oauth_key_version,initiating_member_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            vendor,
            account,
            crypto.digest("oauth", state),
            expires,
            context,
            crypto.version,
            member,
        )
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
        {
            "client_id": s.google_client_id,
            "redirect_uri": s.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return {
        "id": str(attempt),
        "channel": "email",
        "expiresAt": expires.isoformat(),
        "status": "pending",
        "authorizationUrl": url,
    }


async def complete(runtime, state: str, code: str):
    crypto, s = runtime.crypto, runtime.settings
    async with runtime.db.transaction() as (conn, _):
        route = await conn.fetchrow(
            "SELECT * FROM b2_oauth_route($1)", crypto.digest("oauth", state)
        )
    if not route:
        raise HTTPException(400, "OAuth state expired or already used")
    vendor = route["vendor_id"]
    # Serialize code consumption; token exchange is bounded, never logged or retried blindly.
    async with runtime.db.transaction(vendor) as (conn, _):
        attempt = await conn.fetchrow(
            "SELECT * FROM channel_attempts WHERE id=$1 FOR UPDATE", route["attempt_id"]
        )
        if attempt["status"] != "pending" or attempt["expires_at"] <= datetime.now(UTC):
            raise HTTPException(400, "OAuth state expired or already used")
        actor = await conn.fetchrow(
            "SELECT * FROM vendor_members WHERE id=$1 AND status='active' AND role IN ('owner','manager')",
            attempt["initiating_member_id"],
        )
        if not actor:
            raise HTTPException(403, "Connection permission changed")
        account = attempt["channel_account_id"]
        context = json.loads(
            crypto.open(
                bytes(attempt["oauth_context_ciphertext"]),
                attempt["oauth_key_version"],
                f"{vendor}:{account}:oauth",
            )
        )
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": s.google_client_id,
                    "client_secret": s.google_client_secret.get_secret_value(),
                    "redirect_uri": s.google_redirect_uri,
                    "code_verifier": context["verifier"],
                },
            )
            if not response.is_success:
                raise HTTPException(400, "Gmail authorization failed; reconnect")
            tokens = response.json()
            scopes = set(tokens.get("scope", "").split())
            if not {
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            } <= scopes or not tokens.get("refresh_token"):
                raise HTTPException(400, "Gmail read/send offline consent required")
            profile = await GmailAdapter(tokens["access_token"], client).profile()
        address = email_identity(profile["emailAddress"])
        await conn.execute(
            "UPDATE channel_accounts SET status='connected',display_name=$2,external_account_id=$2,mailbox_hash=$3,provider='gmail',gmail_history_id=NULL WHERE id=$1",
            account,
            address,
            crypto.digest("mailbox", address),
        )
        await conn.execute(
            "INSERT INTO channel_tokens(vendor_id,channel_account_id,ciphertext,key_version,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(vendor_id,channel_account_id) DO UPDATE SET ciphertext=excluded.ciphertext,key_version=excluded.key_version,expires_at=excluded.expires_at,revoked_at=NULL",
            vendor,
            account,
            crypto.seal(json.dumps(tokens).encode(), f"{vendor}:{account}:tokens"),
            crypto.version,
            datetime.now(UTC) + timedelta(seconds=int(tokens.get("expires_in", 3600))),
        )
        await conn.execute(
            "UPDATE channel_attempts SET status='completed',oauth_context_ciphertext=NULL WHERE id=$1",
            attempt["id"],
        )
        for kind in ("gmail_watch", "gmail_sync"):
            await enqueue(
                conn, vendor, kind, f"connect:{attempt['id']}:{kind}", channel_account_id=account
            )
    await runtime.queue.wake(vendor)
