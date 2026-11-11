import json
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from .cloud import Cloud, http_client


def mode(settings):
    if settings.whatsapp_mode not in ("sandbox", "live"):
        raise HTTPException(503, "Invalid WhatsApp mode")
    return settings.whatsapp_mode


async def begin(rt, vendor, member):
    sandbox = mode(rt.settings) == "sandbox"
    if not sandbox and not all(
        [
            rt.settings.meta_app_id,
            rt.settings.meta_app_secret.get_secret_value(),
            rt.settings.meta_signup_config_id,
        ]
    ):
        raise HTTPException(503, "Meta Embedded Signup is not configured")
    async with rt.db.transaction(vendor) as (conn, _):
        await conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", f"wa-signup:{vendor}"
        )
        account = await conn.fetchval(
            "SELECT id FROM channel_accounts WHERE vendor_id=$1 AND provider='whatsapp' AND NOT helper_account LIMIT 1",
            vendor,
        )
        if not account:
            account = await conn.fetchval(
                "INSERT INTO channel_accounts(vendor_id,channel,provider,external_account_id,display_name) VALUES($1,'whatsapp','whatsapp',$2,'WhatsApp Business') RETURNING id",
                vendor,
                "pending-" + secrets.token_urlsafe(24),
            )
        await conn.execute(
            "UPDATE channel_attempts SET status='cancelled' WHERE channel_account_id=$1 AND status='pending'",
            account,
        )
        expiry = datetime.now(UTC) + timedelta(seconds=599)
        attempt = await conn.fetchval(
            "INSERT INTO channel_attempts(vendor_id,channel_account_id,state_hash,expires_at,initiating_member_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
            vendor,
            account,
            rt.crypto.digest("wa-signup", secrets.token_urlsafe(32)),
            expiry,
            member,
        )
    return {
        "id": str(attempt),
        "channel": "whatsapp",
        "expiresAt": expiry.isoformat(),
        "status": "pending",
        "sandbox": sandbox,
        "embeddedSignup": None
        if sandbox
        else {
            "appId": rt.settings.meta_app_id,
            "configId": rt.settings.meta_signup_config_id,
            "version": rt.settings.meta_graph_version,
        },
    }


async def complete(rt, vendor, member, attempt, data):
    sandbox = mode(rt.settings) == "sandbox"
    async with rt.db.transaction(vendor) as (conn, _):
        row = await conn.fetchrow(
            "SELECT * FROM channel_attempts WHERE id=$1 AND initiating_member_id=$2 FOR UPDATE",
            attempt,
            member,
        )
        if not row or row["expires_at"] <= datetime.now(UTC) or row["status"] != "pending":
            raise HTTPException(409, "Signup expired or already used. Start again.")
        if sandbox:
            phone_id, waba, token = "sandbox-" + str(vendor), "sandbox-waba", "sandbox-token"
        else:
            if (
                not data.code
                or not data.phoneNumberId
                or not data.wabaId
                or not data.phoneNumberId.isdigit()
                or not data.wabaId.isdigit()
            ):
                raise HTTPException(422, "Complete Embedded Signup first")
            async with http_client(rt.settings) as client:
                app_token = (
                    rt.settings.meta_app_id + "|" + rt.settings.meta_app_secret.get_secret_value()
                )
                cloud = Cloud(rt.settings, app_token, "", "", client)
                exchange = await cloud.request(
                    "GET",
                    "oauth/access_token",
                    params={
                        "client_id": rt.settings.meta_app_id,
                        "client_secret": rt.settings.meta_app_secret.get_secret_value(),
                        "code": data.code,
                    },
                )
                token = exchange.get("access_token", "")
                debug = (
                    await cloud.request("GET", "debug_token", params={"input_token": token})
                ).get("data", {})
                if (
                    not token
                    or not debug.get("is_valid")
                    or debug.get("app_id") != rt.settings.meta_app_id
                    or not {"whatsapp_business_management", "whatsapp_business_messaging"}.issubset(
                        set(debug.get("scopes", []))
                    )
                ):
                    raise HTTPException(403, "Meta token is not authorized for this app")
                cloud.token = token
                numbers = await cloud.request("GET", data.wabaId + "/phone_numbers")
                if not any(p.get("id") == data.phoneNumberId for p in numbers.get("data", [])):
                    raise HTTPException(
                        403, "Phone number does not belong to the authorized business"
                    )
                # Access check above rejects an arbitrary phone ID supplied by the browser.
                await cloud.request("POST", data.wabaId + "/subscribed_apps")
                # Registration is needed for newly onboarded Cloud API phone numbers.
                registration_pin = f"{secrets.randbelow(1000000):06d}"
                await cloud.request(
                    "POST",
                    data.phoneNumberId + "/register",
                    json={"messaging_product": "whatsapp", "pin": registration_pin},
                )
                phone_id, waba = data.phoneNumberId, data.wabaId
        account = row["channel_account_id"]
        owner = await conn.fetchval("SELECT vendor_id FROM b5_whatsapp_route($1)", phone_id)
        if owner and owner != vendor:
            raise HTTPException(409, "Number already belongs to another workspace")
        await conn.execute(
            "UPDATE channel_accounts SET external_account_id=$2,whatsapp_waba_id=$3,status='connected' WHERE id=$1",
            account,
            phone_id,
            waba,
        )
        await conn.execute(
            "INSERT INTO channel_tokens(vendor_id,channel_account_id,ciphertext,key_version) VALUES($1,$2,$3,$4) ON CONFLICT(vendor_id,channel_account_id) DO UPDATE SET ciphertext=excluded.ciphertext,key_version=excluded.key_version,revoked_at=NULL",
            vendor,
            account,
            rt.crypto.seal(
                json.dumps(
                    {
                        "access_token": token,
                        "registration_pin": registration_pin if not sandbox else None,
                    }
                ).encode(),
                f"{vendor}:{account}:tokens",
            ),
            rt.crypto.version,
        )
        await conn.execute("UPDATE channel_attempts SET status='completed' WHERE id=$1", attempt)
    return {
        "id": str(account),
        "vendorId": str(vendor),
        "channel": "whatsapp",
        "displayName": "WhatsApp Business (sandbox)" if sandbox else "WhatsApp Business",
        "status": "connected",
        "ownAccount": True,
    }
