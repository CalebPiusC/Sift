import asyncio
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.config import Settings


class Database:
    def __init__(self, settings: Settings):
        self.url = settings.database_url
        self.pool = None
        self._connect_lock = asyncio.Lock()

    async def connect(self):
        async with self._connect_lock:
            if self.pool is not None:
                return
            pool = await asyncpg.create_pool(self.url, min_size=1, max_size=10, command_timeout=30)
            try:
                async with pool.acquire() as conn:
                    safe = await conn.fetchval("""SELECT NOT (rolsuper OR rolbypassrls OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication)
                        AND pg_has_role(current_user,'selvora_service','MEMBER')
                        FROM pg_roles WHERE rolname=current_user""")
                    if not safe:
                        raise ValueError(
                            "Pipeline requires a restricted NOINHERIT login with membership in selvora_service"
                        )
                    if not await conn.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='followup_id')"
                    ):
                        # Column metadata can be hidden from the login until SET ROLE.
                        async with conn.transaction():
                            await conn.execute("SET LOCAL ROLE selvora_service")
                            await conn.execute("SELECT followup_id FROM public.jobs LIMIT 0")
            except BaseException:
                await pool.close()
                raise
            self.pool = pool

    @asynccontextmanager
    async def transaction(
        self,
        vendor: UUID | str | None = None,
        user: UUID | None = None,
        roles=("owner", "manager", "agent"),
    ):
        await self.connect()
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute("SET LOCAL ROLE selvora_service")
            await conn.execute(
                "SELECT set_config('app.vendor_id',$1,true)", str(vendor) if vendor else ""
            )
            member = None
            if user:
                member = await conn.fetchrow(
                    "SELECT id,role FROM vendor_members WHERE vendor_id=$1 AND user_id=$2 AND status='active'",
                    UUID(str(vendor)),
                    user,
                )
                if not member or member["role"] not in roles:
                    raise HTTPException(403, "Business permission required")
                await conn.execute("SELECT set_config('request.jwt.claim.sub',$1,true)", str(user))
            yield conn, member

    async def close(self):
        if self.pool:
            await self.pool.close()
            self.pool = None
