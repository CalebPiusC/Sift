import json
from datetime import UTC, datetime, timedelta

import httpx

from app.channels import registry
from app.channels.gmail import ChannelError


async def adapter_for(db, crypto, settings, vendor, account, client: httpx.AsyncClient):
    # Row lock serializes refresh-token rotation across workers; no plaintext persisted/logged.
    async with db.transaction(vendor) as (conn, _):
        row = await conn.fetchrow(
            "SELECT * FROM channel_tokens WHERE vendor_id=$1 AND channel_account_id=$2 FOR UPDATE",
            vendor,
            account,
        )
        if not row or row["revoked_at"]:
            raise ChannelError("GMAIL_REVOKED", False)
        context = f"{vendor}:{account}:tokens"
        tokens = json.loads(crypto.open(bytes(row["ciphertext"]), row["key_version"], context))
        if not row["expires_at"] or row["expires_at"] < datetime.now(UTC) + timedelta(seconds=60):
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": tokens.get("refresh_token", ""),
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret.get_secret_value(),
                },
            )
            if response.status_code == 400 and response.json().get("error") == "invalid_grant":
                await conn.execute(
                    "UPDATE channel_tokens SET revoked_at=now() WHERE id=$1", row["id"]
                )
                await conn.execute(
                    "UPDATE channel_accounts SET status='expired' WHERE id=$1", account
                )
                # Commit revocation before raising (raising inside transaction would roll it back).
                revoked = True
            elif not response.is_success:
                raise ChannelError(
                    "GMAIL_REFRESH_FAILED",
                    response.status_code >= 500 or response.status_code == 429,
                )
            else:
                revoked = False
                tokens.update(response.json())
                sealed = crypto.seal(json.dumps(tokens).encode(), context)
                await conn.execute(
                    "UPDATE channel_tokens SET ciphertext=$2,key_version=$3,expires_at=$4 WHERE id=$1",
                    row["id"],
                    sealed,
                    crypto.version,
                    datetime.now(UTC) + timedelta(seconds=int(tokens.get("expires_in", 3600))),
                )
        else:
            revoked = False
    if revoked:
        raise ChannelError("GMAIL_REVOKED", False)
    return registry.create("gmail", tokens["access_token"], client)
