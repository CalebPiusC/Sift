"""S1 first slice: persisted settings read and member-owned preference writes.

Business/catalogue mutations remain explicitly outside this initial slice. No
sample defaults or provider actions are substituted for missing service data.
"""

import hashlib
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from app.pipeline.api import RuntimeDep, UserDep, VendorDep, ok

router = APIRouter(prefix="/v1")


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Notifications(StrictInput):
    readyToPay: StrictBool
    needsYou: StrictBool


class Preferences(StrictInput):
    lowData: StrictBool
    darkMode: StrictBool
    language: Literal["en", "pcm"]
    notifications: Notifications


class PreferenceUpdate(StrictInput):
    preferences: Preferences
    expectedPreferencesRevision: str = Field(pattern=r"^[0-9a-f]{64}$")


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def preferences(conn, vendor, member, *, lock=False):
    row = await conn.fetchrow(
        "SELECT *,xmin::text AS version FROM member_preferences WHERE vendor_id=$1 AND member_id=$2"
        + (" FOR UPDATE" if lock else ""),
        vendor,
        member,
    )
    # These are schema defaults for a member without a preferences row, not sample data.
    value = {
        "lowData": row["low_data"] if row else False,
        "darkMode": row["dark_mode"] if row else False,
        "language": row["language"] if row else "en",
        "notifications": {
            "readyToPay": row["ready_to_pay"] if row else True,
            "needsYou": row["needs_you"] if row else True,
        },
    }
    # Bind the opaque token to this member and PostgreSQL row version, not just values:
    # changing A -> B -> A must still invalidate an old editor.
    revision = fingerprint([str(vendor), str(member), row["version"] if row else None])
    return value, revision


async def document(conn, vendor, member):
    row = await conn.fetchrow(
        """SELECT s.*,v.business_name,v.business_type,v.tone,v.auto_negotiation
        FROM business_settings s JOIN vendors v ON v.id=s.vendor_id
        WHERE s.vendor_id=$1 FOR SHARE OF s,v""",
        vendor,
    )
    if not row:
        raise HTTPException(409, "Business settings must be initialized")
    hours = await conn.fetch(
        "SELECT day,closed,opens,closes FROM business_hours WHERE vendor_id=$1 ORDER BY day",
        vendor,
    )
    fees = await conn.fetch(
        "SELECT city,fee_kobo FROM delivery_fees WHERE vendor_id=$1 ORDER BY city", vendor
    )
    own, revision = await preferences(conn, vendor, member)
    return {
        "id": str(row["id"]),
        "vendorId": str(vendor),
        "businessName": row["business_name"],
        "businessType": row["business_type"],
        "tone": row["tone"],
        "autoNegotiation": row["auto_negotiation"],
        "autoIntents": list(row["auto_intents"]),
        "replyLanguages": list(row["reply_languages"]),
        "businessHours": {
            "enabled": row["hours_enabled"],
            "timezone": row["timezone"],
            "awayMessage": row["away_message"],
            "days": [
                {
                    "day": h["day"],
                    "closed": h["closed"],
                    "opens": h["opens"].strftime("%H:%M"),
                    "closes": h["closes"].strftime("%H:%M"),
                }
                for h in hours
            ],
        },
        "deliveryFees": [{"city": f["city"], "feeKobo": f["fee_kobo"]} for f in fees],
        "preferences": own,
        "preferencesRevision": revision,
    }


@router.get("/settings")
async def get_settings(rt: RuntimeDep, user: UserDep, vendor: VendorDep):
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        return ok(await document(conn, vendor, member["id"]))


@router.patch("/settings")
async def update_preferences(
    data: PreferenceUpdate,
    rt: RuntimeDep,
    user: UserDep,
    vendor: VendorDep,
    key: Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=200)],
):
    request_hash = fingerprint(data.model_dump())
    async with rt.db.transaction(vendor, user.id) as (conn, member):
        # Serializes both the first insert and updates for this member, not other members.
        active = await conn.fetchrow(
            "SELECT id FROM vendor_members WHERE vendor_id=$1 AND id=$2 AND status='active' FOR UPDATE",
            vendor,
            member["id"],
        )
        if not active:
            raise HTTPException(403, "Business permission required")
        idem = await conn.fetchrow(
            """INSERT INTO idempotency_keys
            (vendor_id,actor_scope,operation,key_hash,request_hash,expires_at)
            VALUES($1,$2,'settings.preferences',$3,$4,now()+interval '7 days')
            ON CONFLICT(vendor_id,actor_scope,operation,key_hash)
            DO UPDATE SET key_hash=excluded.key_hash RETURNING *""",
            vendor,
            str(member["id"]),
            rt.crypto.digest("idempotency", key),
            request_hash,
        )
        if idem["request_hash"] != request_hash:
            raise HTTPException(409, "Idempotency key used for different preferences")
        if idem["status"] == "completed":
            return ok(
                json.loads(
                    rt.crypto.open(
                        bytes(idem["response_ciphertext"]),
                        idem["key_version"],
                        f"{vendor}:settings.preferences:{member['id']}",
                    )
                )
            )
        _, revision = await preferences(conn, vendor, member["id"], lock=True)
        if revision != data.expectedPreferencesRevision:
            raise HTTPException(409, "Preferences changed. Reload saved preferences before saving.")
        p = data.preferences
        await conn.execute(
            """INSERT INTO member_preferences
            (vendor_id,member_id,low_data,dark_mode,language,ready_to_pay,needs_you)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(vendor_id,member_id) DO UPDATE SET
            low_data=excluded.low_data,dark_mode=excluded.dark_mode,language=excluded.language,
            ready_to_pay=excluded.ready_to_pay,needs_you=excluded.needs_you""",
            vendor,
            member["id"],
            p.lowData,
            p.darkMode,
            p.language,
            p.notifications.readyToPay,
            p.notifications.needsYou,
        )
        result = await document(conn, vendor, member["id"])
        await conn.execute(
            """INSERT INTO audit_log(vendor_id,actor_id,action,entity_type,entity_id)
            VALUES($1,$2,'settings.preferences.updated','vendor_member',$3)""",
            vendor,
            user.id,
            member["id"],
        )
        await conn.execute(
            """UPDATE idempotency_keys SET status='completed',response_ciphertext=$2,
            key_version=$3,http_status=200 WHERE id=$1""",
            idem["id"],
            rt.crypto.seal(
                json.dumps(result).encode(), f"{vendor}:settings.preferences:{member['id']}"
            ),
            rt.crypto.version,
        )
        return ok(result)
