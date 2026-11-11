# Selvora

Mobile-first sales-assistant workspace for Nigerian vendors: inbox, fact-based
catalogue, approvals, human takeover, orders, receipts and business operations.

**Status:** the sample frontend runs without accounts. B2–B9 add locally tested
backend capabilities, but provider acceptance and several implementation gaps
remain. **Production is NO-GO** until the [go-live checklist](docs/operations/go-live-checklist.md)
is signed off. Local mocks are not proof of real delivery or payment.

## Getting started in 30 minutes

### 0–5 minutes: tools and checkout

Install Git, **Node 22.12+** (Node 22 LTS recommended), npm and **Python 3.11+**.
Python is used by the build's reply-safety evaluation; the sample dev server itself
needs only Node/npm. Full native backend tests are best run on Linux/WSL2.

```sh
git clone https://github.com/CalebPiusC/selvora.git
cd selvora
node --version
npm --version
python3 --version
```

If working in an existing Arena checkout, skip cloning and stay on its assigned branch.

### 5–15 minutes: install and run sample mode — no accounts

```sh
npm ci
cp web/.env.example web/.env.local
npm run dev
```

On PowerShell, `Copy-Item web/.env.example web/.env.local` is equivalent. Open
**http://localhost:3000**. Leave `DATA_MODE=mock`, both Supabase values blank and
`API_ORIGIN` blank. You do **not** need Supabase, Docker, Google, Meta, Paystack,
Gemini or an API server. If you already have shell environment variables for this
project, unset them or ensure they match sample mode; shell values can override files.

You should see fictional **Adire by Tola**, labelled **Sample data**. Try inbox,
approvals, catalogue, orders and settings. Changes/photos/settings are in session
memory and reset on refresh. No real messages or payments are sent. Settings →
Try sample onboarding replays onboarding without replacing sample history.

### 15–25 minutes: quick checks

In another terminal at the repository root:

```sh
npm run test:contributor-setup
npm test
npm run typecheck
```

These are quick checks, not the full release suite. For an optional production
sample build, stop the dev server or choose a different port:

```sh
npm run build
npm run start -w web -- --port 3001
```

The build requires Python 3.11+ as `python3` on PATH. The copied web template
explicitly selects mock mode, including for production previews.

### 25–30 minutes: prepare your first task

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[working with two people](docs/working-with-two-people.md). Agree one phase owner,
create one task branch (`phase-name/short-description`, except fixed Arena
branches), and open one PR for that phase. See the PR template and CODEOWNERS.
No secrets or real `.env` files belong in commits.

## Optional API and database setup

Do this only for backend work; it is not needed for the sample frontend.

```sh
python3 -m venv .venv
. .venv/bin/activate
# PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -e './api[test]'
cp api/.env.example api/.env
```

The API reads `.env` relative to its working directory. Run from `api/`:

```sh
cd api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log --log-config logging.json
```

`/health` is process liveness only. Pipeline routes remain disabled with
`PIPELINE_ENABLED=false`; this is not an error in the no-account setup.

For optional local PostgreSQL/Redis, copy root `.env.example` to `.env`, replace
its local-only password placeholder with a strong unique password, then run
`docker compose up -d`. Compose's administrator is **not** the API login: provision
a separate NOINHERIT/NOSUPERUSER/NOBYPASSRLS login granted `selvora_service` using
[the pipeline guide](docs/backend/gmail-pipeline.md). Never use production data.
Init migrations run only for new volumes; apply new migrations explicitly to
existing volumes. Do not use `docker compose down -v` on data you need.

Local auth shims are not a real email/Google authentication service. For API-mode
browser testing, configure a separate staging Supabase project, apply migrations
in order, set API auth and pipeline settings securely, then set `DATA_MODE=api`,
the public Supabase URL/anon key and server-only `API_ORIGIN` in `web/.env.local`.
Restart Next. `/api/v1/*` proxies to FastAPI; remote browser code must not call a
sandbox's localhost directly. API mode never silently falls back to sample data.
Never apply `tests/bootstrap.sql` or test fixtures to hosted production.

## Environment files and secret handling

| Template | Scope |
|---|---|
| `.env.example` | Local Compose password; commented test/operator tooling inputs |
| `web/.env.example` | Sample/API switch, public Supabase settings, server-side proxy origin |
| `api/.env.example` | All API Settings fields; providers, encryption, quotas and operations |

Blank credential values deliberately do not authenticate. Optional AI token-rate
examples are commented out; leave them unset until actual rates are approved.
Real `.env`, `.env.local`, environment-specific files, key exports and backups
are ignored. Verify before committing with `git diff --cached` and
`git check-ignore web/.env.local api/.env .env`. Only templates belong in Git.
Never expose server/provider/service-role keys through `NEXT_PUBLIC_*`.

## What is real versus sample

| Area | Locally implemented | Still pending / limitation |
|---|---|---|
| Frontend | Complete sample workspace, responsive phone/tablet/desktop UI | Sample changes reset; not every screen is fully API-wired |
| Auth/database | Supabase integration, tenant RLS, role matrix, restricted service transactions | Hosted acceptance and deployment configuration |
| Gmail pipeline | OAuth, signed push ingress, history, encrypted tokens, durable outbox/reconciliation | Authorized live Gmail/Pub/Sub acceptance |
| Replies | Fact lookup, deterministic wording, approvals, takeover, final-send rechecks | Not unrestricted generative AI; broader language/live-channel acceptance |
| Orders/receipts | Chat drafts, reservations, verified-payment boundary, immutable PDF/shared receipts | Real Paystack/channel demo; no multi-vendor settlement/partial payments |
| WhatsApp/helper | Same sandbox/live adapter, signed ingress, private media, confirmed helper edits | Meta approvals/live delivery; physical media purge |
| Instagram/Facebook/TikTok | B6 TikTok feasibility report | Meta messaging implementation and TikTok scope decision/approval |
| Extras | Persisted notes, consent follow-ups, moderation, restock, invitations, export | Frontend gaps; physical erasure and broader live/role/race acceptance |
| Insights/billing | Event-based metrics, verified-webhook entitlements, usage limits, cost estimates | Live renewals; cancellation/overlap handling; full cost reconciliation |
| Operations | Rate controls, kill switches, category feedback, monitoring/restore tooling | Actual paging/PITR setup, legal retention and real-device sign-off |

The roadmap contains historical planning entries; use the phase guides and
[go-live checklist](docs/operations/go-live-checklist.md) for current limitations.

## Validation

With the Python virtual environment activated, from the repository root:

```sh
npm run test:contributor-setup
npm run test:all
npm run build
(cd api && python -m pytest -q && ruff check . && ruff format --check .)
npm run test:readiness
```

Native SQL/Redis tests use disposable local fixtures, not hosted accounts. The
cold physical restore test is Linux-specific. For UI/layout checks run a sample
production server, then use `SELVORA_TEST_URL=http://localhost:3001 npm run test:ui`
and `npm run test:layout`; see the responsive guide. Physical Android Chrome and
iPhone Safari remain a separate manual checklist.

After contract/schema changes, regenerate with `npm run docs:contract` and
`npm run docs:backend`. Hosted rollback-only RLS checks use
`SUPABASE_TEST_DATABASE_URL` securely in the environment with
`npm run test:db:supabase`; they do not deploy migrations or prove live providers.

## Guides

- [Contributing](CONTRIBUTING.md) · [Two-person workflow](docs/working-with-two-people.md)
- [Frontend demo](docs/frontend-demo.md) · [Responsive layout](docs/responsive-layout.md)
- [Backend roadmap](docs/backend-roadmap.md) · [API contract](docs/api-contract.md)
- [Gmail pipeline](docs/backend/gmail-pipeline.md) · [Reply safety](docs/backend/reply-engine.md)
- [Orders/payments/receipts](docs/backend/orders-payments.md) · [WhatsApp/helper](docs/backend/whatsapp.md)
- [TikTok research](docs/backend/tiktok-research.md) · [Extras](docs/backend/b7-extras.md)
- [Insights/billing](docs/backend/b8-insights-billing.md)
- [Go-live checklist](docs/operations/go-live-checklist.md) · [Incident/retention runbook](docs/operations/runbook.md)
- [Security review](docs/operations/security-review.md) · [Real-device checklist](docs/operations/mobile-checklist.md)
