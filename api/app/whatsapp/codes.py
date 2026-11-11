"""Atomic Redis link capabilities. All times supplied by an injectable clock.

Only hashes of codes/senders are used as keys. One Lua transaction serializes
replacement, global 4-digit collision checks, consumption and sender lockout.
"""

import json
import secrets
import time
from uuid import uuid4

SCRIPT = r"""
local now=tonumber(ARGV[2]); local action=ARGV[1]
if action=='issue' then
 local occupied=redis.call('GET',KEYS[2])
 if occupied and tonumber(cjson.decode(occupied).expires)>now then return 'collision' end
 local current=redis.call('GET',KEYS[1])
 if current then
  local old=cjson.decode(current)
  if old.hash==cjson.decode(ARGV[3]).hash then return 'collision' end
  redis.call('DEL',ARGV[6]..old.hash)
 end
 redis.call('SET',KEYS[1],ARGV[3],'EX',600)
 redis.call('SET',KEYS[2],ARGV[3],'EX',600)
 return 'ok'
end
if ARGV[7]=='yes' then local receipt=redis.call('GET',KEYS[4]);if receipt then return receipt end end
local attempts=redis.call('GET',KEYS[3]);local state=attempts and cjson.decode(attempts) or {tries=0,until_time=0}
if state.until_time>now then return 'locked' end
if state.until_time>0 or (state.first and now-state.first>=900) then state={tries=0,until_time=0} end
local raw=redis.call('GET',KEYS[2]);local code=raw and cjson.decode(raw)
if not code or code.expires<=now then
 state.tries=state.tries+1;state.first=state.first or now
 if state.tries>=5 then state.until_time=now+900 end
 redis.call('SET',KEYS[3],cjson.encode(state),'EX',900)
 local result=state.tries>=5 and 'locked' or 'invalid'
 if ARGV[7]=='yes' then redis.call('SET',KEYS[4],result,'EX',86400) end
 return result
end
local active=redis.call('GET',ARGV[6]..code.owner)
if not active or cjson.decode(active).id~=code.id then return 'invalid' end
redis.call('DEL',KEYS[2]);redis.call('DEL',ARGV[6]..code.owner);redis.call('DEL',KEYS[3])
if ARGV[7]=='yes' then redis.call('SET',KEYS[4],raw,'EX',86400) end
return raw
"""


class Codes:
    def __init__(self, redis, crypto, clock=time.time):
        self.redis, self.crypto, self.clock = redis, crypto, clock
        # Shared hash tag keeps Lua keys in one Redis Cluster slot.
        self.prefix = "selvora:{wa-codes}:"

    async def issue(self, vendor, member):
        owner = self.crypto.digest("wa-code-owner", str(vendor) + ":" + str(member))
        now = self.clock()
        for _ in range(100):
            code = f"{secrets.randbelow(10000):04d}"
            digest = self.crypto.digest("wa-code", code)
            data = {
                "id": str(uuid4()),
                "vendor": str(vendor),
                "member": str(member),
                "owner": owner,
                "hash": digest,
                "expires": now + 600,
            }
            result = await self.redis.eval(
                SCRIPT,
                3,
                self.prefix + "owner:" + owner,
                self.prefix + "code:" + digest,
                self.prefix + "unused",
                "issue",
                now,
                json.dumps(data),
                "",
                "",
                self.prefix + "code:",
            )
            if result in ("ok", b"ok"):
                return {**data, "code": code}
        raise ValueError("Link-code capacity exhausted")

    async def consume(self, sender, code, message_id=None):
        digest = self.crypto.digest("wa-code", code)
        sender_hash = self.crypto.digest("wa-sender", sender)
        result = await self.redis.eval(
            SCRIPT,
            4,
            self.prefix + "unused",
            self.prefix + "code:" + digest,
            self.prefix + "sender:" + sender_hash,
            self.prefix
            + "receipt:"
            + self.crypto.digest("wa-code-receipt", sender + ":" + (message_id or "unused")),
            "consume",
            self.clock(),
            "",
            "",
            "",
            self.prefix + "owner:",
            "yes" if message_id else "no",
        )
        value = result.decode() if isinstance(result, bytes) else result
        return json.loads(value) if value.startswith("{") else value
