"""One AI-handled conversation per UTC calendar month; vendor replies never blocked."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal


async def account(conn, vendor):
    await conn.execute(
        "INSERT INTO billing_accounts(vendor_id,trial_ends_at) SELECT id,created_at+interval '14 days' FROM vendors WHERE id=$1 ON CONFLICT(vendor_id) DO NOTHING",
        vendor,
    )
    await conn.execute(
        "UPDATE billing_accounts SET trial_ends_at=created_at+interval '14 days' WHERE vendor_id=$1 AND status='trial' AND trial_ends_at IS NULL",
        vendor,
    )
    return await conn.fetchrow(
        "SELECT * FROM billing_accounts WHERE vendor_id=$1 FOR UPDATE", vendor
    )


async def current(conn, vendor):
    a = await account(conn, vendor)
    now = datetime.now(UTC)
    if a["status"] == "active" and a["entitlement_ends_at"] and a["entitlement_ends_at"] <= now:
        await conn.execute(
            "UPDATE billing_accounts SET status='past_due' WHERE vendor_id=$1", vendor
        )
        a = await conn.fetchrow("SELECT * FROM billing_accounts WHERE vendor_id=$1", vendor)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = (start + timedelta(days=32)).replace(day=1)
    active = (a["status"] == "trial" and a["trial_ends_at"] and a["trial_ends_at"] > now) or (
        a["status"] == "active" and a["entitlement_ends_at"] and a["entitlement_ends_at"] > now
    )
    limit = a["entitlement_limit"] if active else 0
    await conn.execute(
        "INSERT INTO usage_meters(vendor_id,period_start,period_end,conversation_limit) VALUES($1,$2,$3,$4) ON CONFLICT(vendor_id,period_start) DO UPDATE SET conversation_limit=excluded.conversation_limit",
        vendor,
        start,
        end,
        limit,
    )
    m = await conn.fetchrow(
        "SELECT * FROM usage_meters WHERE vendor_id=$1 AND period_start=$2 FOR UPDATE",
        vendor,
        start,
    )
    return a, m


async def warning(conn, vendor, m, level, cid=None):
    await conn.execute(
        "INSERT INTO notifications(vendor_id,member_id,conversation_id,kind,dedupe_key) SELECT $1,id,$2,'system',$3 FROM vendor_members WHERE vendor_id=$1 AND role IN ('owner','manager') AND status='active' ON CONFLICT DO NOTHING",
        vendor,
        cid,
        f"quota:{m['id']}:{level}",
    )


async def admit(conn, vendor, cid):
    a, m = await current(conn, vendor)
    key = f"ai-conversation:{m['id']}:{cid}"
    if await conn.fetchval(
        "SELECT id FROM usage_entries WHERE vendor_id=$1 AND dedupe_key=$2", vendor, key
    ):
        # Existing conversations remain covered for the meter period, even at 100%.
        return True
    if m["conversations"] >= m["conversation_limit"]:
        if a["bundle_balance"] <= 0:
            await warning(conn, vendor, m, 100, cid)
            return False
        await conn.execute(
            "UPDATE billing_accounts SET bundle_balance=bundle_balance-1 WHERE vendor_id=$1", vendor
        )
    await conn.execute(
        "INSERT INTO usage_entries(vendor_id,meter_id,conversation_id,quantity,dedupe_key) VALUES($1,$2,$3,1,$4)",
        vendor,
        m["id"],
        cid,
        key,
    )
    n = m["conversations"] + 1
    await conn.execute("UPDATE usage_meters SET conversations=$2 WHERE id=$1", m["id"], n)
    if m["conversation_limit"] and n * 100 >= m["conversation_limit"] * 80:
        await warning(conn, vendor, m, 80, cid)
    if n >= m["conversation_limit"]:
        await warning(conn, vendor, m, 100, cid)
    return True


async def cost(conn, vendor, key, model, operation, usage, settings):
    # Missing provider usage/rates remains UNKNOWN, never fabricated as zero.
    inp = usage.get("promptTokenCount")
    out = usage.get("candidatesTokenCount")
    valid = type(inp) is int and inp >= 0 and type(out) is int and out >= 0
    price = None
    if (
        valid
        and settings.ai_input_usd_per_million is not None
        and settings.ai_output_usd_per_million is not None
    ):
        price = (
            Decimal(inp) * settings.ai_input_usd_per_million
            + Decimal(out) * settings.ai_output_usd_per_million
        ) / Decimal(1000000)
    await conn.execute(
        "INSERT INTO ai_cost_entries(vendor_id,dedupe_key,model,operation,input_tokens,output_tokens,cost_usd,pricing_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(vendor_id,dedupe_key) DO NOTHING",
        vendor,
        key,
        model,
        operation,
        inp if valid else None,
        out if valid else None,
        price,
        settings.ai_pricing_version,
    )
