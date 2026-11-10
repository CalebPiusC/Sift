# Selvora

A mobile-first workspace for Nigerian online vendors. **Phase 1: foundation.**

Replaces the previous LeadBot prototype. Includes Next.js/TypeScript/Tailwind with a shadcn-style Radix button, FastAPI, Supabase auth, PostgreSQL tenant isolation, four-screen onboarding, responsive navigation, dark mode, and an installable PWA.

## Requirements

- Node.js **22.12+** and npm (lockfile included)
- Python **3.11+**
- Docker Compose v2 for local PostgreSQL/Redis (optional for automated tests)
- A Supabase project for actual signup, email confirmation and Google OAuth

## Quick visual preview (no credentials)

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Choose **Explore the workspace** and complete the four onboarding screens. This is explicitly labelled **Preview**: it does not create an account, persist business data, or send messages. Only the theme preference is stored locally. Refresh resets the preview.

## Real signup → onboarding → workspace

### 1. Configure Supabase

1. Create a Supabase project.
2. Apply `supabase/migrations/202611100001_foundation.sql` in the Supabase SQL editor, as the database owner (`postgres`). This migration runs in one transaction. **Do not run `tests/bootstrap.sql` or `tests/seed.sql` in a hosted project.** Supabase already owns the `auth` schema.
3. Copy `web/.env.example` to `web/.env.local`. Fill in the project URL and public publishable/anon key from Supabase's API settings. **Never put a service-role key in the web app.**
4. In Authentication → URL configuration, set your Site URL and allow `http://localhost:3000/auth/callback`. For an Arena preview or deployed site, also allow that exact HTTPS origin with `/auth/callback`.
5. Enable email/password auth. Email confirmation is supported; configure SMTP for dependable real email delivery. For quick development only, you can disable email confirmation in your own project settings.
6. Enable Google in Authentication → Providers. Configure your Google OAuth client in Supabase, using Supabase's displayed callback URL as the Google-authorised redirect URI. Google credentials belong in Supabase, **not** in this repository.
7. Restart Next.js after changing environment variables.

```sh
npm run dev
```

Create an account, follow the email confirmation link if enabled, or choose **Continue with Google**. New authenticated users see these four screens:

1. Business name (one short chat-style prompt)
2. Products / services / made-to-order / mixed
3. Friendly / professional / Pidgin-friendly
4. Channels, explicitly marked **Connect later**

The final confirmation calls `onboard_vendor`, an authenticated, atomic, retry-safe database function. It creates the vendor, owner membership, and safe audit entry. Returning users load their persisted workspace. Sign out is in Settings and the desktop sidebar.

**Auth architecture:** Next.js uses Supabase's browser client and PKCE callback with cookie storage. Supabase validates sessions and applies RLS to all browser database calls. The FastAPI foundation also validates bearer tokens against Supabase Auth; its vendor endpoint forwards the user's JWT to PostgREST, never a privileged service key. The web foundation talks directly to Supabase, not a hard-coded local API URL.

### 2. Run FastAPI

From the repository root:

```sh
python -m venv .venv
.venv/bin/pip install -e './api[test]'
cp api/.env.example api/.env
# Fill SUPABASE_URL and SUPABASE_ANON_KEY for authenticated API requests.
cd api
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log
```

- `GET /health`: process liveness only; no false claim of database/Redis readiness.
- `GET /v1/me`: verified authenticated identity.
- `GET /v1/vendors`: vendors visible under the current user's RLS policies.
- Interactive docs: `http://localhost:8000/docs`.

`WEB_ORIGINS` is an environment-configured JSON list. Add the exact deployed/preview web origin if using browser-to-API calls later. Browser code must use same-origin paths through a proxy for future backend features, never the browser's `localhost` to reach a deployed service.

### 3. Local PostgreSQL and Redis

```sh
cp .env.example .env
# Replace POSTGRES_PASSWORD in .env with a long local password.
docker compose up -d
```

PostgreSQL listens on local port 5432; Redis on 6379. Both have persistent volumes. On the **first** database start, Compose installs the local auth compatibility shim and the migration automatically. The shim supplies test identities and `auth.uid()` semantics; it is **not an authentication server**. Local Compose alone does not enable email/Google signup. Use hosted Supabase for real authentication.

Optional realistic fixtures (local only):

```sh
docker compose exec -T postgres psql -U selvora -d selvora < tests/seed.sql
```

Fixtures contain Adire by Tola and Amina’s Studio, English/Pidgin enquiries, a ₦25,000 adire set, Lagos delivery at ₦2,500 and Abuja delivery at ₦5,000. They use synthetic `.test` identities and no customer phone numbers. Fixtures are not injected into a real user's inbox or the preview.

**Existing volume:** init scripts run only once. Apply new migrations explicitly using `psql`, or deliberately remove the local volume with `docker compose down -v` if you want to erase local data. Never use the latter against data you need.

## Database security

All **13 application tables** have non-null `vendor_id`, indexed tenant scope, enabled and forced RLS:

`vendors`, `vendor_members`, `customers`, `conversations`, `messages`, `products`, `product_variants`, `orders`, `order_items`, `receipts`, `channel_accounts`, `approvals`, `audit_log`.

- The vendor root has `vendor_id = id`; Supabase-managed `auth.users` is not an application table.
- Policies look up the authenticated `auth.uid()` in `vendor_members`; they do not trust a vendor ID supplied by the browser or a user-editable JWT claim.
- All members can read their vendor's rows. Owners manage membership/business settings. Owners/managers manage catalogue and channel account metadata. Agents can work with operational records, but not invite members or change catalogue prices.
- Composite foreign keys prevent cross-tenant references, including order/variant/product relationships.
- Anonymous table access and client `TRUNCATE` privileges are explicitly revoked, including Supabase defaults. Table ownership/service-role access bypasses RLS by design: never expose those credentials.
- Receipts cannot be inserted directly by authenticated clients. `issue_receipt` requires confirmed payment, locks the vendor for sequential numbering, handles retries, snapshots line items, and rejects mutation after issuance (even privileged row UPDATE/DELETE).
- Clients cannot write payment source/status columns. `confirm_vendor_payment` represents an explicit vendor confirmation and produces an audit event. A future verified Paystack worker will use a separate trusted path. No screenshot confirmation exists.
- Approval rows hold the customer message, facts, proposed reply, and holding-reply deadline; **the approval processor is not implemented yet**.
- Audit logs have no arbitrary payload column. No application code logs customer content, phone numbers or tokens. Local Postgres statement/error-parameter logging is disabled; apply equivalent redaction controls to hosted database and platform logs.
- Channel accounts store metadata, **not provider access tokens**. Secret storage will be added with channel integrations.

## Tests

From the root:

```sh
npm ci
npm run test:all       # web component/auth tests + RLS integration + PWA tests + typecheck
npm run build         # production Next.js build
(cd api && ../.venv/bin/pytest)
.venv/bin/ruff check api
.venv/bin/ruff format --check api
npm audit
```

Individual suites:

```sh
npm test              # 10 web tests (Supabase network boundary is mocked)
npm run test:db       # 23 PostgreSQL security/invariant tests
npm run test:pwa      # 2 manifest/service-worker tests
```

The RLS suite runs the **actual SQL migration** and Nigerian fixtures on **PGlite (PostgreSQL compiled to WASM)**, switches to the unprivileged `authenticated` role, sets the auth identity, and proves vendor A cannot access vendor B's rows across all 13 tables. It also tests cross-tenant inserts, tenant reassignment, role escalation, forced RLS, anonymous access, `TRUNCATE`, onboarding atomicity, receipt immutability/sequencing, and payment-source protection. It requires **no Docker, hosted credentials, or mocked RLS**. Production PostgreSQL/Supabase deployment still needs an environment smoke test.

GitHub Actions runs these suites, formatting/lint checks for Python, and the production build.

## PWA and design

- Mobile bottom navigation and desktop sidebar: Inbox, Orders, Catalogue, Insights, Settings.
- Indigo `#4338CA`, gold `#F59E0B`, navy `#0F172A`, background `#F8FAFC`, success `#16A34A`, warning `#D97706`, danger `#DC2626`.
- Self-hosted Plus Jakarta Sans headings / Inter body via Fontsource: no runtime Google Fonts dependency.
- Persistent dark mode, large touch targets, responsive layouts, honest empty states, and foundation bubble style tokens for later messaging.
- Manifest, 192/512px icons, service worker and offline fallback. **No authenticated pages or customer data are cached.**
- On an HTTPS origin (or localhost), Chromium's **Install app** button appears once the browser emits `beforeinstallprompt`. It is browser-controlled, not guaranteed inside an embedded preview. Open the preview in its own tab to install. On iPhone/iPad use Safari → Share → Add to Home Screen. Offline access intentionally shows a safe reconnect screen, not stale private conversations.

## What works / what remains

**Implemented and tested:** monorepo, infrastructure configuration, migration and RLS, auth integrations, four-step persistent onboarding, mobile/desktop shell, dark mode, empty states, PWA installation event and safe offline fallback, API identity boundary and CI.

**Requires external setup:** real Supabase project/environment variables, deployed migration, Google provider credentials, callback allowlist and working email delivery. No live provider credentials were available during implementation, so email delivery and Google consent have not been exercised against a real project. The credential-free preview is deliberately separate from real auth.

**Not part of Phase 1:** live channels, webhooks/signatures/raw-event storage, queue worker, AI/LLM providers, transcription, numeric verification, approval/send/edit/reject processing, human takeover, chat-style catalogue writes, real orders/insights, Paystack, subscriptions, Storage policies and realtime delivery. Redis is provisioned but not consumed yet. No AI replies or payment automation can run in this foundation. Channel connections remain “connect later”; catalogue entry is not replaced with a spreadsheet/form.

Docker is not installed in the implementation sandbox, so Compose startup was not executed there. RLS ran successfully through PGlite, independent of Docker.
