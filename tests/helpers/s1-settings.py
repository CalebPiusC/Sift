"""S1 first-slice API integration: real restricted PostgreSQL; identity boundary injected."""

import asyncio
import json
import os
from uuid import UUID, uuid4

import httpx
from app.auth import Identity, current_user
from app.config import Settings, get_settings
from app.main import app
from app.pipeline.api import Runtime, runtime
from app.pipeline.crypto import b64
from app.settings.api import fingerprint


async def main():
    fixtures = json.loads(os.environ["B2_FIXTURE"])
    own, other = fixtures["own"], fixtures["other"]
    vendor = UUID(own["vendor"])
    settings = Settings(
        database_url=os.environ["DATABASE_URL"],
        pipeline_enabled=True,
        pipeline_keys=json.dumps({"v1": b64(os.urandom(32))}),
        identity_pepper=b64(os.urandom(32)),
    )
    rt = Runtime(settings)
    user = UUID(own["users"]["owner"])
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[runtime] = lambda: rt
    app.dependency_overrides[current_user] = lambda: Identity(
        id=user, email="fixture@example.test"
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="https://test",
            headers={"X-Vendor-Id": str(vendor)},
        ) as client:

            async def get():
                r = await client.get("/v1/settings")
                assert r.status_code == 200, r.text
                assert r.headers["cache-control"] == "private, no-store"
                return r.json()["data"]

            async def patch(base, prefs, key=None, **extra):
                return await client.patch(
                    "/v1/settings",
                    json={
                        "preferences": prefs,
                        "expectedPreferencesRevision": base["preferencesRevision"],
                        **extra,
                    },
                    headers={"Idempotency-Key": key or str(uuid4())},
                )

            original = await get()
            assert original["businessName"] == "B0 fixture"
            assert original["vendorId"] == str(vendor)
            assert original["businessHours"]["days"][0]["day"] == 1
            assert original["businessHours"]["days"][0]["opens"] == "09:00"
            prefs = {**original["preferences"], "darkMode": True, "language": "pcm"}
            key = str(uuid4())
            results = await asyncio.gather(
                patch(original, prefs, key), patch(original, prefs, key)
            )
            assert [r.status_code for r in results] == [200, 200]
            saved = results[0].json()["data"]
            assert saved == results[1].json()["data"]
            assert saved["preferences"] == prefs
            assert (await get()) == saved
            assert saved["preferencesRevision"] != original["preferencesRevision"]
            assert (await patch(original, prefs)).status_code == 409
            assert (
                await patch(original, original["preferences"], key)
            ).status_code == 409
            async with rt.db.transaction(vendor) as (conn, _):
                assert (
                    await conn.fetchval(
                        "SELECT count(*) FROM audit_log WHERE action='settings.preferences.updated'"
                    )
                    == 1
                )
            # Concurrent conflicting saves cannot both succeed.
            results = await asyncio.gather(
                patch(saved, {**prefs, "lowData": True}),
                patch(saved, {**prefs, "language": "en"}),
            )
            assert sorted(r.status_code for r in results) == [200, 409]
            current = await get()
            # Restore the original value, but its old revision must never become valid again.
            restored = await patch(current, original["preferences"])
            assert restored.status_code == 200, restored.text
            assert (await patch(original, prefs)).status_code == 409
            current = await get()
            for extra in [
                {"businessName": "Not allowed"},
                {"memberId": other["members"]["owner"]},
                {"reply_engine_enabled": True},
                {"vendorId": other["vendor"]},
            ]:
                assert (await patch(current, prefs, **extra)).status_code == 422
            assert (
                await patch(current, {**prefs, "darkMode": "true"})
            ).status_code == 422
            assert (
                await patch(current, {**prefs, "language": "unsupported"})
            ).status_code == 422
            assert (
                await patch(
                    current,
                    {
                        **prefs,
                        "notifications": {**prefs["notifications"], "owner": True},
                    },
                )
            ).status_code == 422
            assert (await get()) == current  # Rejected mixed writes are atomic.
            # Preferences belong to each membership, including agents and managers.
            for role in ["agent", "manager"]:
                user = UUID(own["users"][role])
                theirs = await get()
                assert theirs["preferences"] == original["preferences"]
                assert theirs["preferencesRevision"] != original["preferencesRevision"]
                changed = await patch(
                    theirs, prefs, key
                )  # Same key, different actor scope.
                assert changed.status_code == 200, changed.text
                assert (await get())["preferences"] == prefs
            user = UUID(own["users"]["owner"])
            assert (await get()) == current
            # Tenant substitution cannot read or mutate another business.
            client.headers["X-Vendor-Id"] = other["vendor"]
            assert (await client.get("/v1/settings")).status_code == 403
            assert (await patch(current, prefs)).status_code == 403
            client.headers["X-Vendor-Id"] = str(vendor)
            user = UUID(own["users"]["manager"])
            async with rt.db.transaction(vendor) as (conn, _):
                await conn.execute(
                    "UPDATE vendor_members SET status='suspended' WHERE id=$1",
                    UUID(own["members"]["manager"]),
                )
            assert (await client.get("/v1/settings")).status_code == 403
            assert (
                await patch(original, prefs, key)
            ).status_code == 403  # Even a cached replay.
            user = UUID(own["users"]["owner"])
            uninitialized = fixtures["uninitialized"]
            client.headers["X-Vendor-Id"] = uninitialized["vendor"]
            assert (await client.get("/v1/settings")).status_code == 409
            empty = {
                "preferencesRevision": fingerprint(
                    [
                        uninitialized["vendor"],
                        uninitialized["member"],
                        None,
                    ]
                )
            }
            assert (await patch(empty, prefs)).status_code == 409
            async with rt.db.transaction(UUID(uninitialized["vendor"])) as (conn, _):
                # A failure after the preference UPSERT must roll back that insertion.
                assert (
                    await conn.fetchval("SELECT count(*) FROM member_preferences") == 0
                )
                assert await conn.fetchval("SELECT count(*) FROM idempotency_keys") == 0
        print(
            "PASS S1 settings: persisted DTO, private cache policy, role/member scope, replay, body binding, concurrency, ABA/stale conflicts, strict input and tenant/revocation denial."
        )
    finally:
        app.dependency_overrides.clear()
        await rt.db.close()
        await rt.queue.close()


asyncio.run(main())
