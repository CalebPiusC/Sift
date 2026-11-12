# S1 — in progress (draft PR, not phase acceptance)

Base: merged main `d980a84956e8da3ed5d443e0b5658fd0e6a159d8`.
Assigned Arena branch: `arena/fd96d642-sift`. No S2 work is included.

## Initial implementation slice

- `GET /v1/settings` composes actual persisted business settings, hours, delivery
  fees and the current member's preferences. No mock fallback; missing business
  initialization returns a conflict. Schema defaults apply only to a member with
  no saved preferences. No business hours or fees are invented to fill gaps.
- `PATCH /v1/settings` currently accepts **preferences only**. All extra fields,
  including business, ownership and engine-activation fields, fail validation.
  General business-setting mutations are not implemented by this slice.
- Owners/managers/agents can save only their own membership preferences. Active
  membership is checked again after locking the member row, before cached replay.
- `expectedPreferencesRevision` is an opaque token bound to tenant, member and
  PostgreSQL row version (`xmin`), not a hash of preference values alone. A→B→A
  does not authorize a stale editor. No table/migration changes in this slice.
- Required `Idempotency-Key` is bound to actor, operation and normalized body in
  the existing durable idempotency table. Snapshot responses are context-encrypted;
  replay does not repeat writes/audit. Rejected mutations roll back the whole
  transaction. Members' first writes serialize independently.
- Preference UI sends the version it actually edited, keeps the retry key after
  an uncertain response, and requires explicit reload/discard on conflict. API
  persistence copy is separate from the truthful sample-session copy.
- No voice capture/control added. Default mock/API selection and sample banner
  behavior remain unchanged; no sample data is relabelled as real API data.

## Validation boundaries

`npm run test:settings:native` uses the actual FastAPI app and a real native
PostgreSQL cluster with a restricted NOINHERIT/non-superuser/non-bypass login.
Only the authenticated identity boundary is injected; database and endpoint logic
are not mocked. It covers DTO composition, private cache policy, concurrent replay,
key/body conflict, concurrent stale writes, ABA, strict types/nested ownership
rejection, mixed-write atomicity, per-role/member isolation, cross-tenant denial and
revocation-before-replay. This test is wired to a dedicated GitHub CI job.

`api/tests/test_settings.py` covers strict schema boundaries.
`web/tests/settings-api-preferences.test.tsx` covers the real API adapter and UI
using a **fake HTTP boundary**; this is not a claim of FastAPI-backed browser
acceptance. Existing frontend tests remain in place.

## Still required before S1 can be called complete

- General business/hours/delivery/reply-language writes, granular role checks,
  shared revision coordination with existing reply-policy writes.
- Catalogue list/search/detail/create/batch/update/archive and variant/reservation/
  stock-ledger safeguards; complete typed editing and durable proposals.
- Persistent private photo upload/read/ownership/delete and cleanup policy;
  reviewed extraction drafts, real Gemini vision adapter with schema/unknown-fact
  constraints and per-vendor usage accounting.
- Actual API-backed browser coverage for all catalogue/settings screens and short
  executable demo. No fallback to samples when an API call fails.
- Updated evidence and **green GitHub checks** for the final S1 scope.

Live Gemini/storage acceptance and release approval remain **no** until independently
proven. Passing tests for this initial slice do not complete S1 or make release GO.

## Initial CI timing follow-up

The first push ran the S1 native and API jobs green, but the existing Inbox
hand-back UI test exceeded its unchanged 5000ms limit on GitHub. The test file
was unchanged from main. Local original file passed all five tests in 7793ms,
with hand-back taking 2958ms; the fixture now uses the existing sample client
`latencyMs: 0` option (same approach as the merged orders UI fixture). The real
async methods, subscriptions and domain mutations remain, and all expectation
expressions are unchanged. No production latency, timeout, retry or skip changes.
The modified file passed 5/5 in 4678ms, with hand-back taking 1745ms locally.
GitHub acceptance still needs to be checked for the final pushed commit.
