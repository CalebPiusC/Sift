# Selvora

Mobile-first AI sales-assistant workspace for Nigerian vendors: unified inbox, fact-based
catalogue, approval controls, human takeover, orders, receipts and business operations.

**Current status:** F0–F7 sample frontend is demo-ready. B0 reconciles the database/security
foundation with that frontend; it does not implement business HTTP endpoints. Hosted Supabase
verification is pending project access. A passing local demo is not a production-connected assistant.

## Authoritative guides

- [Phone demo, click by click](docs/frontend-demo.md)
- [Backend endpoint status, auth/cursors/errors and roadmap](docs/backend-roadmap.md)
- [Current frontend declarations](docs/api-contract.md)
- [Contract gaps](docs/backend/contract-gaps.md), [exact schema delta](docs/backend/schema-delta.md)
- [SQL role matrix](docs/backend/role-matrix.md), [events/idempotency](docs/backend/events-and-idempotency.md)
- [Frontend accessibility, performance and low-data notes](docs/frontend-quality.md)

## Setup: sample frontend (no credentials)

Requires Node **22.12+**, npm. Python **3.11+** is needed for API tests.

```sh
npm ci
npm run dev
# Production phone preview:
npm run build
DATA_MODE=mock npm run start -w web -- --port 3001
```

Default `DATA_MODE=mock` opens fictional **Adire by Tola**, clearly labelled Sample data. No login
or external provider calls. Changes/photos/settings live in session memory; refresh resets them.
Settings → Try sample onboarding replays the four prompts without resetting sample history.
Use the HTTPS preview on a phone. The development server binds 0.0.0.0; no browser code calls
localhost to reach a remote backend.

## Feature status: real versus sample

| Area | Implemented | Not yet connected / production limitation |
|---|---|---|
| Authentication/onboarding | Supabase integration, PKCE callback, atomic SQL onboarding; mock replay | Hosted email/Google configuration and end-to-end validation required |
| Catalogue | Photo/tap flow, reviewed cards, variants, stock/floors, confirmed typed edits, archive | Mock extraction; no persistent uploads or business API |
| Inbox | Five-channel sample threads, rich messages/transcripts, filters and unread indicators | No live ingestion/sends/transcription; API realtime and history paging pending |
| AI/approvals | Safe intent controls, fact cards, Send/Edit/Reject, sample holding timers | No AI provider or durable processing; re-verification before sends is future backend work |
| Takeover | Chat-scoped timeout/Hand Back and mock send-time recheck | Durable workers/original provider thread routing pending |
| Orders/payment | Seven-state sample lifecycle, explicit bank acknowledgement, one-time mock stock deduction | No checkout/webhook/reconciliation; screenshots never confirm payment |
| Receipts | Real local PDF, immutable sample snapshots; guarded sequential SQL issuance foundation | Unsigned sample share links are not proof; hosted capability route pending |
| Channels/helper | Simulated connection flows, expiring/replaced helper codes | No live helper number, OAuth or tokens; TikTok availability unconfirmed |
| Team/billing | Sample invitations/assignment/audit, trial/offers/selection | No real email/subscription/entitlement workflow; selection never charges |
| Insights/extras | Seven sample charts, follow-ups, moderation, restock requests, customer memory | No scheduler/provider blocking/alerts; real historical analytics endpoint pending |
| Language | Original Pidgin + labelled English sample summaries; partial app labels | No live translation or full-app localization |
| PWA/low-data | Install assets, safe offline reconnect page, text-first lists, resized/lazy photos | Private conversations intentionally not cached; no offline mutation sync |
| Backend/security | 48 tenant-scoped tables, forced RLS, composite FKs, bounded service role, append-only events/ledgers | Business routes/workers/KMS/hosted rollout pending; see endpoint inventory |

## Setup: API/auth foundation

1. Create a **staging** Supabase project. Configure email auth, SMTP and/or Google provider with
   the exact site origin and `/auth/callback` redirect. Secrets stay in Supabase/server environment.
2. Apply all SQL files in `supabase/migrations/` once, in filename order, using the migration owner.
   Back up existing data first. Never apply `tests/bootstrap.sql` or local seed fixtures to production.
   B0 supports the full blank chain and an F0 upgrade, preserves issued receipts, and explicitly
   maps legacy order states. Invalid historical references fail atomically for explicit repair.
3. Copy `web/.env.example` to `web/.env.local`; set `DATA_MODE=api`, Supabase URL and public anon/
   publishable key. Never expose service-role/worker credentials in browser variables. Restart Next.
4. API mode uses real auth then reports honest missing-endpoint errors. It never falls back to mock.
   The legacy Explore shortcut stays development-only and is disabled when Supabase is configured.

```sh
python -m venv .venv
.venv/bin/pip install -e './api[test]'
cp api/.env.example api/.env
# Configure SUPABASE_URL / SUPABASE_ANON_KEY securely, then:
cd api
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log
```

Only `/health` (process liveness), `/v1/me` and `/v1/vendors` exist. Browser `/api/v1/*` proxying,
new cursor DTOs and business routes are planned, not supplied by this setup. `WEB_ORIGINS` controls
CORS; use exact deployment origins, never a wildcard authenticated production policy.

## Database/service security

Every application table has vendor_id, forced RLS, tenant FKs and explicit role policies/grants.
Human membership is resolved from auth.uid(), not a body/header/JWT role claim. Policies restrict
per-member preferences/read markers/notifications to their owner. Financial/operational facts and
secret/outbox tables use controlled RPCs or a bounded service transaction, not direct browser DML.

`selvora_service` is NOLOGIN/NOBYPASSRLS. Provision a separate server login with NOINHERIT and
NOBYPASSRLS through secure infrastructure, and grant it permission to SET ROLE selvora_service.
For each authorized transaction set that role and SET LOCAL app.vendor_id. Never grant this role
to authenticated, anon or a BYPASSRLS role. Supabase service_role table access is revoked by B0;
a bypass key is not the worker architecture. Migration owners/superusers can alter security and
must never be used as routine application credentials. See the matrix before deploying workers.

Channel tokens/raw webhooks/identity routing and replay bodies store ciphertext with external key
versions; link codes use keyed HMAC. B0 does not implement encryption or provision keys. No
plaintext message/phone/token/SQL parameter logging. Hosted/platform logging needs the same rules.

Optional local infrastructure: copy `.env.example` to `.env`, set a strong local password and
`docker compose up -d`. PostgreSQL/Redis volumes are local-only. Compose auth shims are not an
email/Google auth server. Existing volumes need new migrations explicitly; init scripts run once.
Never run `docker compose down -v` unless intentionally erasing local data.

## Validation

```sh
npm run test:all       # frontend, F0 + B0 DB/security/native tests, docs, typecheck
npm run build
(cd api && ../.venv/bin/python -m pytest -q && ../.venv/bin/ruff check .)
SELVORA_TEST_URL=http://localhost:3001 npm run test:ui
npm audit
```

B0: `npm run test:backend` applies the full chain on a blank database and upgrades populated F0
fixtures, runs **768 table × role × operation cells** on PGlite and native PostgreSQL, plus tenant/
constraint/event checks and generated inventory tests. F0 regression tests still run separately
against their original chain; they are not claimed as tests of B0's tightened role permissions.
`npm run docs:backend` regenerates exact schema/matrix/endpoint reports.

Hosted rollback-only check: set `SUPABASE_TEST_DATABASE_URL` securely to a direct/session connection
and run `npm run test:db:supabase`. Do not paste secrets into tracked files. The runner uses real
project auth/roles and rolls back temporary migrations/fixtures; it does not deploy migrations.
Hosted validation has **not** run yet. This sandbox restricts outbound hosts, so authorized Supabase
connectivity or a user-run command may be needed. Never report local tests as a hosted pass.

## Known limitations and next work

- Mock/legacy frontend APIs still use offset pages/array DTOs. B1 must change adapter + DTOs to
  signed cursor pages together; all message history must remain reachable.
- Actual AI, channel providers, verified payments, private storage URLs, durable jobs and send
  reconciliation are not implemented. No sample billing action purchases anything.
- SQL foundation functions are not a complete HTTP idempotency/payment/inventory service. Future
  transactions must bind verified actor, request key, ledger, stock, event and outbox atomically.
- Event history begins at B0; do not invent past funnel transitions from current stages.
- Local/automated Chromium and axe checks do not certify hosted security, physical device support
  or full accessibility compliance. Real Android/iOS/assistive-technology testing remains advisable.
- Production monitoring, rate limits, provider consent/windows, retention/erasure, backups and
  restore drills are prerequisites before handling real customers.

Next sequence: **B1 API substrate/read slice → B2 persistent catalogue/customers/stock → B3 one
verified messaging provider and safe AI → B4 payments/receipts → B5 durable extras/billing/analytics.**
See the authoritative backend roadmap for each endpoint's status and rules.
