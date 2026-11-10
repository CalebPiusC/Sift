# Selvora

A mobile-first workspace for Nigerian online vendors. **Current work: F4 orders and immutable receipts, alongside the F3 inbox and F2 catalogue.** Backend work is paused while the frontend is completed.

Replaces the previous LeadBot prototype. Includes Next.js/TypeScript/Tailwind with a shadcn-style Radix button, FastAPI, Supabase auth, PostgreSQL tenant isolation, four-screen onboarding, responsive navigation, dark mode, and an installable PWA.

## Requirements

- Node.js **22.12+** and npm (lockfile included)
- Python **3.11+**
- Docker Compose v2 for local PostgreSQL/Redis (optional for automated tests)
- A Supabase project for actual signup, email confirmation and Google OAuth

## F1: run the sample-backed frontend (no credentials)

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The default `DATA_MODE=mock` opens the fictional **Adire by Tola** workspace with a persistent **Sample data** banner. No signup or external service is needed. All sample mutations are in memory; refresh resets them. Only the theme preference persists locally.

Copy `web/.env.example` to `web/.env.local` to set the single server-read switch explicitly:

```dotenv
DATA_MODE=mock
```

- **Mock:** 25 catalogue entries across eight categories, 40 customers/conversations across all five channels, English/Pidgin messages and seven customer voice-note transcripts, 21 orders spanning seven states, 15 numbered receipt snapshots, five pending approvals, channels, delivery fees for Lagos/Abuja/Ibadan, settings, insights, team and billing.
- **Realtime demo:** Inbox → **Simulate incoming message**. A customer message appears, followed by a canned sample AI greeting after about 1.2 seconds. No provider call, real message, payment or email occurs. Human mode is rechecked before the delayed reply.
- **Read views:** catalogue search/category filters; conversation/channel search; orders/status filters; Orders → View receipts; Settings → Business/Channels/Customers/Team/Billing.
- **Async UX:** typed result/error envelopes, loading states, retry, mutation busy/errors, realtime invalidation and cleanup on unmount. Customer voice-note transcripts are fake; no vendor recording control exists.
- **API:** set `DATA_MODE=api` and restart. The banner/developer controls disappear; Supabase sign-in is used. The future same-origin API adapter does **not** fall back to samples. Its data endpoints and realtime transport are intentionally not implemented in the backend yet.

The full contract, including every input/output, HTTP target and error semantics, is in [`docs/api-contract.md`](docs/api-contract.md). Import contracts/types from `web/lib/data/index.ts`. Update generated declarations with `npm run docs:contract`; `npm run test:contract` prevents documentation drift.

This explicit sample-data adapter is separate from the old **Explore the workspace** onboarding preview. That old shortcut is still development-only, disabled in production and whenever Supabase is configured. In mock mode no real authentication/database access happens at all.

## F2 catalogue: photos, taps and typed text

Use `DATA_MODE=mock`, open **Catalogue**, then **Add products**.

1. Pick up to ten JPG/PNG/WebP photos (up to 3 MB each).
2. Tap **One item per photo** for bulk, or **One item, several photos**.
3. Tap a category chip and **Get suggestions**. Mock extraction is explicitly fake/category-based; it does not analyse photos.
4. Review/edit one card per item. Shoes asks for sizes; Food asks for portion/prep minutes; Services asks for duration. No vendor voice controls or typed category fields.
5. Enter price/lowest price in naira (e.g. `15k`, `N1.5k`, `₦15,000`), review plain-language summaries, and **Confirm all**. Invalid batches save nothing; retries do not duplicate items.

The catalogue has search/category/stock filters, four stock badges, product detail/edit with photos, variant stock, a low-stock threshold, and archive/restore with confirmation. Typed quick edits propose first: try **black sneakers finished**, **set black sneakers stock to 8**, or **raise adire price to 30k** (the last requires picking one of two matches). Confirming is mandatory; price floors and revision conflicts are enforced. Archived products disappear from active searches without touching order/receipt history.

Automated interaction tests cover ten-photo creation and a typed stock update in a 390px component container. The F2 browser check was initially blocked by missing `libnspr4.so`. F3 resolves that test-harness blocker and exercises the inbox in real Chromium; the F2 ten-item flow retains its component-level acceptance coverage.

Mock changes/photos live only in browser-session memory. API mode has the exact typed target operations but **no new backend endpoints, real image extraction, Storage upload or persistence**. The backend remains paused.

## F3 inbox: simulate a complete vendor workflow

Run `npm run dev` with `DATA_MODE=mock` and open **Inbox** (the default destination).

- **Inbox** lists 40 Nigerian customer chats across five channels, with last message/time, unread counts, lead stages, AI/human mode and Needs you badges. Combine channel, stage, Needs me and text filters; Reset filters clears them. The mock simulator emits updates to all views.
- Open **Chidinma Okafor**: original-language Pidgin voice transcript (sample audio unavailable), indigo AI bubbles, white vendor replies, catalogue product and order snapshot cards, and dated messages. Phone conversations occupy the available screen, with a separate message scroll and visible composer. Tap **Back to inbox** to return.
- Approvals appear both inside their chat and under **Needs you**. Review customer message, product/price/stock/floor facts, reason and proposed reply. **Send**, **Edit → Send edited reply**, or **Reject** are explicit decisions, protected against repeat decisions and changed product revisions.
- Each pending card shows a five-minute holding-reply countdown (seed cards start one minute into it). At its due time the mock sends one generic holding reply; it never grants a discount or claims payment. It remains pending for your decision. Holding replies defer in human mode and are cancelled if the card is decided first. Background browser throttling may delay timers; this is not a durable scheduler.
- **Take Over** pauses AI only in that chat for 30 minutes (explicitly shown). **Hand Back** resumes it sooner; expiry also resumes it. Scheduled mock AI replies recheck takeover at send time. The original-channel button accepts trusted channel links. Sample records have no real customer thread URLs, so it opens the channel inbox/email app with an explicit notice, not a fictional exact customer thread.
- Tap an **AI suggested quick reply** to put safe, non-factual text in the composer; it does **not** send. Send reply is always explicit. Drafts survive realtime updates and switching chats while this inbox is mounted.
- **Customer details** is a focus-managed mobile drawer with past orders, editable private notes/tags and a possible spam/scam flag. Save is explicit. The flag is private metadata, not blocking/reporting; take over separately to pause AI.
- **Notifications** defaults to Ready to pay and Needs you only. This is an in-app view of current actionable items, not push notifications/history. Read/preferences persist across inbox tabs while mounted, not across refreshes. Ready to pay is **not** Paid; only the existing explicit vendor/verified payment workflow can confirm payment.

Use **Sample chat scenario** plus the flask button (labelled **Simulate incoming message**) for greeting, product, ready-to-pay, approval, Pidgin voice or order scenarios. Wait around 1.2 seconds for the mock response. Try takeover → greeting (AI stays silent) → hand back → greeting (AI responds). Ready-to-pay requests raise approval because the sample has no verified bank instructions. No real channel messages, AI provider calls, audio recording, payment processing or persistence were added.

```sh
npm run test:all
npm run build
# With the mock app running on port 3000:
npm run test:mobile
# Or target another running local/preview URL:
SELVORA_TEST_URL=http://localhost:3001 npm run test:mobile
```

`test:mobile` runs real headless Chromium at **390 × 844 with touch enabled**. It checks chat simulation, rich bubbles, Send/Edit/Reject, AI silence in takeover, vendor reply, hand-back/resumed AI, customer drawer, notification defaults, no horizontal overflow and no browser exceptions. Additional layout/composer checks cover 320px/360px phones and 1280px dark-mode desktop. Browser libraries are test-only, provided through npm (Linux x64 CI); no system Chromium install is required. Optional `SELVORA_SCREENSHOT_DIR=/tmp/selvora-shots` saves a review screenshot outside Git. The earlier F2 sandbox-browser-library blocker has been resolved for this test harness; the F2 ten-item path still has its separate component acceptance test.

The current thread shows the latest 100 messages; full older-history pagination is not connected. All mock changes reset on refresh. API mode retains honest missing-endpoint/realtime errors—no sample fallback. See `docs/api-contract.md` for the updated backend targets.

## F4 orders, payments and receipts

With `DATA_MODE=mock`, open **Orders** and select **order-1** (Chidinma Okafor). It starts as a draft for four Indigo Adire Sets with delivery, totalling **₦102,500**. Its customer screenshot is explicitly **unverified**.

1. Tap **Mark awaiting payment**. Every status action shows the short message the customer will receive before you tap it; successful mock updates also appear in the linked inbox and order timeline.
2. The **sample Paystack link** can be copied/shared. It is a non-payable placeholder, prominently marked **do not pay**, not a real checkout.
3. Tap **Payment received**, check the bank-verification acknowledgement, then **Confirm payment received**. Cancelling the confirmation leaves the order unpaid. A screenshot can never confirm payment; the exact warning is “Screenshots can be faked. Check your bank before confirming.” Other unpaid orders offer **Simulate payment screenshot** to test this boundary.
4. The order becomes **Paid**. Tracked variant stock is deducted **once** (Medium/Indigo 5 → 1; total 8 → 4). Low-stock/restock prompts appear. Restock the selected variant by entering units → **Review restock** → **Confirm restock**; no quantity is guessed. Changed stock revisions require a new review.
5. Tap **Issue receipt**. The receipt number is sequential for this vendor (seed receipts #0001–#0012, then #0013). Business name, customer, items/variants, totals, payment source and issuance date are frozen. There is no receipt edit/delete action. Repeated issuance returns the same receipt.
6. **Download PDF** produces an actual PDF file with an embedded naira-capable font, not a print-dialog placeholder. The generator wraps long lines and supports multiple pages. Copy/share the **sample receipt share link** to view its read-only snapshot in a fresh browser session at `/receipts/shared#sample=...`.
7. Tap **Mark preparing → Mark out for delivery → Mark delivered**. The paid state and receipt stay intact, and the linked inbox receives the previewed delivery updates.

The list supports all seven states (Draft, Awaiting payment, Paid, Preparing, Out for delivery, Delivered, Cancelled) and search by order/customer/item. **View receipts** has receipt-number/customer search and read-only detail. Cancellation needs confirmation and **does not automatically refund, restock or change issued receipts**. Refund processing remains outside this phase.

**Stock shortages:** receiving real money is not rejected merely because stock ran short. The mock records payment, deducts available tracked quantities without going negative, and prominently records any fulfilment shortfall. Missing variants are not guessed; untracked items are not decremented. Restocking adds inventory only—it does not claim a historical shortfall was fulfilled. Seed historical paid orders are already-paid sample snapshots, not a reconstructed inventory ledger.

**Sharing boundaries:** sample links carry an unsigned fictional receipt snapshot in the URL fragment so the demo works without a backend. They are clearly labelled **sample / not proof of payment**, not secure production receipts. They contain the displayed receipt/customer name, so share deliberately; they exclude delivery addresses, phones and email. API mode requires a backend-provided secure `shareUrl` and real Paystack URL. No real checkout creation, webhook verification, external message delivery, database persistence or signed receipt-hosting service was added.

```sh
npm run test:all
npm run build
# With the mock app already running:
npm run test:orders:mobile
# Optional alternate local/preview URL:
SELVORA_TEST_URL=http://localhost:3001 npm run test:orders:mobile
```

The real Chromium test at **390 × 844** completes draft → paid → delivered, proves screenshot safety, exercises copy/share, confirms a variant restock, downloads/parses the PDF, checks an immutable receipt link in a fresh context, and checks delivery updates in the inbox. `SELVORA_SCREENSHOT_DIR=/tmp/selvora-orders` optionally saves a receipt screenshot/PDF outside Git. PDF unit coverage includes multi-page output and invalid totals; a rendered PDF was also visually reviewed (not just text extraction). Mock data resets on refresh.

## Phase 1 auth foundation: real signup → onboarding → workspace (API mode)

### 1. Configure Supabase

First set `DATA_MODE=api` in `web/.env.local`; default mock mode intentionally does not show real auth.

1. Create a Supabase project.
2. Apply both SQL files in `supabase/migrations/`, in filename order, in the Supabase SQL editor, as the database owner (`postgres`). Each migration runs in one transaction. **Do not run `tests/bootstrap.sql` or `tests/seed.sql` in a hosted project.** Supabase already owns the `auth` schema.
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
npm test              # frontend data/UI and existing auth/preview tests (Supabase network boundary is mocked)
npm run test:db       # 25 PGlite security/invariant tests
npm run test:db:native # 24-session concurrency + shared isolation/hosted-runner tests
npm run test:security  # browser environment/source guard tests
npm run test:pwa      # 2 manifest/service-worker tests
```

The RLS suite runs the **actual SQL migrations** and Nigerian fixtures on **PGlite (PostgreSQL compiled to WASM)**, switches to the unprivileged `authenticated` role, sets the auth identity, and proves vendor A cannot access vendor B's rows across all 13 tables. It also tests cross-tenant inserts, tenant reassignment, role escalation, forced RLS, anonymous access, `TRUNCATE`, onboarding atomicity, receipt immutability/sequencing, and payment-source protection. It requires **no Docker, hosted credentials, or mocked RLS**. Production PostgreSQL/Supabase deployment still needs an environment smoke test.

GitHub Actions runs these suites, formatting/lint checks for Python, and the production build.

## PWA and design

- Mobile bottom navigation and desktop sidebar: Inbox, Orders, Catalogue, Insights, Settings.
- Indigo `#4338CA`, gold `#F59E0B`, navy `#0F172A`, background `#F8FAFC`, success `#16A34A`, warning `#D97706`, danger `#DC2626`.
- Self-hosted Plus Jakarta Sans headings / Inter body via Fontsource: no runtime Google Fonts dependency.
- Persistent dark mode, large touch targets, responsive layouts, honest empty states, and foundation bubble style tokens for later messaging.
- Manifest, 192/512px icons, service worker and offline fallback. **No authenticated pages or customer data are cached.**
- On an HTTPS origin (or localhost), Chromium's **Install app** button appears once the browser emits `beforeinstallprompt`. It is browser-controlled, not guaranteed inside an embedded preview. Open the preview in its own tab to install. On iPhone/iPad use Safari → Share → Add to Home Screen. Offline access intentionally shows a safe reconnect screen, not stale private conversations.

## Phase 1 baseline scope (F1 sample frontend additions above)

**Implemented and tested:** monorepo, infrastructure configuration, migration and RLS, auth integrations, four-step persistent onboarding, mobile/desktop shell, dark mode, empty states, PWA installation event and safe offline fallback, API identity boundary and CI.

**Requires external setup:** real Supabase project/environment variables, deployed migration, Google provider credentials, callback allowlist and working email delivery. No live provider credentials were available during implementation, so email delivery and Google consent have not been exercised against a real project. The credential-free preview is deliberately separate from real auth.

**Not part of Phase 1:** live channels, webhooks/signatures/raw-event storage, queue worker, AI/LLM providers, transcription, numeric verification, approval/send/edit/reject processing, human takeover, chat-style catalogue writes, real orders/insights, Paystack, subscriptions, Storage policies and realtime delivery. Redis is provisioned but not consumed yet. No real AI replies or payment automation can run in this foundation. F1 only simulates canned greetings. Channel connections remain “connect later”; catalogue entry is not replaced with a spreadsheet/form.

Docker is not installed in the implementation sandbox, so Compose startup was not executed there. RLS ran successfully through PGlite and native PostgreSQL, independent of Docker. Native PostgreSQL binaries are installed by npm for tests only; run native tests as an unprivileged OS user (not root). No database files enter Git.


## Pre-Phase-2 verification details

### Exact auth/role simulation

`tests/bootstrap.sql` is a **local-only** shim, never deployed to Supabase:

- Creates a minimal `auth.users(id, email)` table and `auth.uid()`. The function reads `nullif(current_setting('request.jwt.claim.sub', true), '')`, falling back to `request.jwt.claims::jsonb ->> 'sub'`, then casts to UUID. It does not validate JWTs.
- Creates `authenticated` and `anon` as non-login, non-BYPASSRLS roles. Tests run `SET ROLE authenticated` and set the `request.jwt.claim.sub` session setting to the synthetic user's UUID. Missing-sub tests use the authenticated role with no identity; separate `SET ROLE anon` tests verify anonymous SQL access denial.
- Creates `service_role NOLOGIN BYPASSRLS`, with local Supabase-like default ALL table grants and schema usage. Service-role tests prove it can read both vendors (RLS bypass is intentional) but cannot UPDATE, DELETE or TRUNCATE receipts after the hardening migration.
- `RESET ROLE` returns to the bootstrap database superuser for fixture setup and trigger checks. The migration functions are owned by this privileged user, as in the intended Supabase `postgres` deployment.

**Correction to the original coverage:** the initial Phase 1 suite tested authenticated/anon access but did not simulate `service_role`. This hardening adds that role and its tests. Neither local suite tests Supabase JWT cryptography/PostgREST role switching; the API auth tests mock that network boundary.

### Repeat isolation on your real Supabase project

Apply **both** migrations first. Use a direct or **session-pooler** PostgreSQL connection as `postgres` (not the transaction pooler). Keep the connection string in your local environment/secret store, never in chat or Git:

```sh
# Set SUPABASE_TEST_DATABASE_URL privately in your shell first.
npm run test:db:supabase
```

This runner (`scripts/test-supabase-rls.mjs`):

1. Uses the project's **actual** `auth.uid()` and existing `authenticated`/`anon` roles; it never creates/replaces the auth shim or applies migrations.
2. Begins one transaction; inserts random-UUID synthetic users, two tenants and records in all 13 tables. Fixed fixture emails/channel IDs are replaced with random test-only values.
3. Sets both JWT claim settings and the SQL role, then repeats own-row visibility and cross-tenant SELECT/UPDATE/DELETE tests **in both directions**, plus forged inserts, tenant reassignment, membership escalation and anon denial.
4. Uses statement savepoints for expected permission errors; always rolls back all fixture changes, including auth users, on success or failure. It does not delete or modify existing vendor records. Prefer a staging project first; auth-table triggers in a customised project may have external side effects that SQL rollback cannot undo.

It has been exercised against the native test cluster, including a check that user counts are unchanged afterwards. **No hosted Supabase project was available, so the hosted run is still yours to execute.** A pass is database-policy coverage, not an end-to-end OAuth/JWT test.

### Preview and secret build gates

`web/lib/preview.ts` is the single entry/finish guard:

```ts
return process.env.NODE_ENV !== 'production' && !authConfigured();
```

Next replaces `NODE_ENV` at build time; no public override exists. Tests cover production without Supabase, development with Supabase, and allowed unconfigured development/test. The preview never grants database access.

Every Next build loads `scripts/check-browser-env.mjs` through `web/next.config.ts`. It allows only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It rejects other public environment names or references, server-secret references in web source, service-role JWTs/secret Supabase keys masquerading as the anon key, copied known server-secret values, and `next.config.env` injection. It also scans local web env files. All server credentials belong in `/api` only; none currently exists in application source. Tests deliberately try public service-role, Paystack and Gemini key names and require failure. This is a preventive build/source rule, not permission to hard-code or obfuscate a secret.

### Receipt concurrency, atomicity and immutability

- `tests/native-postgres.test.mjs` starts a temporary **native PostgreSQL** cluster, not PGlite. It opens 24 separate transactions/connections, holds the vendor lock until all 24 are observed waiting in `pg_stat_activity`, then releases it and checks unique, contiguous numbers and retry idempotency. Numbers increase in issuance/lock-serialisation order, not Promise input/completion order.
- `onboard_vendor` is one PostgreSQL function invocation: vendor insert, owner insert and audit insert are one transaction. A test injects a failing BEFORE INSERT membership trigger and proves there is no extra vendor, membership or audit row afterwards.
- Vendor **owner**, manager and agent are membership roles under SQL `authenticated`; none can UPDATE/DELETE issued receipts. The hardening migration also revokes these permissions and TRUNCATE from the privileged service role. The immutable trigger additionally rejects UPDATE/DELETE by the database owner. A database administrator can still disable triggers/drop tables/change grants; administrative DDL is not an app capability and cannot be made impossible by RLS.

## Manual setup checklist

1. Install Node 22.12+, Python 3.11+, and run `npm ci`; create the Python virtualenv and install `./api[test]` if running FastAPI.
2. Create/select your Supabase project (staging first is recommended).
3. Run `202611100001_foundation.sql`, then `202611100002_receipt_privileges.sql`, as `postgres`. If Phase 1 was already deployed, apply only the second migration. Do not deploy the local auth shim or fixed fixtures.
4. Copy `web/.env.example` to `web/.env.local`; set the project URL and public anon/publishable key. Never use privileged server credentials here. Set corresponding public build-time variables in the production hosting environment.
5. Configure Supabase Site URL and allow the exact `/auth/callback` URLs for localhost, the Arena HTTPS preview (if used), and production.
6. Enable email/password auth; configure SMTP/email delivery and decide whether confirmation is required (keep it enabled for production).
7. Create/configure a Google OAuth client; add Supabase's displayed OAuth callback in Google, then enable the Google provider and enter credentials **inside Supabase**.
8. Copy `api/.env.example` to `api/.env`; fill Supabase settings and the exact `WEB_ORIGINS` list. Keep all future Gemini/Paystack/service keys server-only.
9. If using local infrastructure, copy root `.env.example` to `.env`, choose a strong local Postgres password and run `docker compose up -d`. Existing volumes require applying migration 002 manually; init mounts run only on a fresh volume.
10. Restart/rebuild the web app after env changes. Sign up, confirm email or Google consent, complete onboarding, refresh, and verify the saved workspace. In API mode, production without auth configuration intentionally offers no preview bypass.
11. Privately set `SUPABASE_TEST_DATABASE_URL` to your direct/session database connection; run `npm run test:db:supabase`, then `npm run test:all` and `npm run build`. The live-project isolation result has not been pre-claimed.
12. Deploy on HTTPS for installation. Open outside an embedded preview to test browser installation; use Safari Share → Add to Home Screen on iOS. Review hosted database/platform log redaction as described above.

**Backend Phase 2 has not started. F1 is frontend-only.**

### F5 — channels and settings (mock frontend)

Open **Settings** in `DATA_MODE=mock npm run dev`, or use the production preview.
All settings persist in the current in-memory workspace; reload resets sample data.
Every section remains labelled Sample data. Backend development remains paused.

- **Channels:** five own-account cards; explicit simulated authorisation/reconnection. TikTok availability is being confirmed and it cannot become connected. WhatsApp helper is a separate side channel for quick vendor updates, never the account replying to customers. Four-digit codes expire after ten minutes; new codes invalidate previous ones. No live helper number is configured, so do not send codes anywhere—use the disclosed simulator.
- **Replies:** seven safe per-intent auto lanes, auto-negotiation off by default, tone/languages, WAT business hours and away message. No approve-everything mode. Routine mock greetings demonstrate professional/Pidgin language and closed-hours away replies; approval and Take Over safeguards remain intact. These are templates, not a connected AI translator.
- **Negotiation:** actual catalogue/variant floors and counter previews; midpoint rounded to nearest ₦100, clamped to floor/list, never a send or price edit. Worked example: ₦10,000 offer / ₦20,000 list / ₦15,000 floor → ₦15,000 counter.
- **Team:** invitations, active-member assignment, manager/agent role changes, protected owner and session audit. Explicit simulated acceptance sends no email. This is a mock owner session, not server-side RBAC.
- **Billing:** trial/usage meter, monthly/yearly (ten months’ price), volume tiers and PAYG bundles. All prices are sample placeholders. Paystack buttons only retain a selection; no checkout, charge, plan change or added credit occurs.
- **Preferences:** saved dark/low-data/notification/language preferences apply across screens. Low-data skips catalogue grid thumbnails (opening details can deliberately load images). Notifications filter in-app alerts, not browser push. English/Pidgin changes supported navigation labels; full-app translation is not connected.

Validation: `npm run test:all`, `npm run build`, and, against a running mock server,
`SELVORA_TEST_URL=http://localhost:3001 npm run test:settings:mobile`.
Existing `test:mobile` and `test:orders:mobile` remain regression checks.

### F6 — Insights and extras (mock frontend)

Open **Insights** → Overview / Follow-ups / Spam & scam / Restock / Customers.
Customers is also available through Settings. All views use the same sample session;
notes, configuration and moderation/alert decisions persist until reload.

- Seven mobile bar-chart views have text summaries, accessible chart descriptions and
  a From/To picker using inclusive Africa/Lagos dates. Leads/stages use last conversation
  activity; response time uses completed incoming-burst → first sent-reply pairs dated
  by reply time. Unanswered bursts are excluded. Conversion is a current-stage snapshot,
  not a historical transition funnel. AI/vendor is sent-message share, not fully handled
  chats. Top products count confirmed paid units; revenue includes delivery, uses payment
  date (creation-date fallback for older samples), and excludes cancelled orders.
- Cold-lead follow-ups: enable, 24–720 whole hours, three styles, scheduled/sent/cancelled
  history. Pending timings use last activity (overdue becomes due now); sent history stays
  unchanged. Explicit simulation can bypass due time but requires enabled/open/cold and
  no active Take Over. There is **no scheduler or external send**; simulation changes queue
  history only. Real consent, opt-out, deduplication and channel-window enforcement are backend work.
- Spam/scam flags show original text and reason; Not spam and confirmed Block retain local
  decisions. There is no connected classifier or external account blocking.
- Restock requests and live low-stock product/variant counts; untracked stock/services are
  excluded. Explicit alert simulation checks non-archived available stock and changes status
  only—no customer is actually notified.
- Customer search includes name/city/tags/notes, details, conversation and order history,
  editable bounded notes/tags. No fabricated purchase history or payment claims.
- Pidgin customer text/voice transcripts show original and English summary side by side.
  Seeded summaries are labelled **Sample summary · not live translation**; unavailable
  summaries ask the vendor to review the original. Original audio/transcripts remain separate.

Phone acceptance: `SELVORA_TEST_URL=http://localhost:3001 npm run test:insights:mobile`.
This covers 390×844 touch, 320px layout, light/dark, date states, all extras and saved memory.
