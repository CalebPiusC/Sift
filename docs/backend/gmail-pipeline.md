# B2 — Gmail pipeline (live acceptance pending)

> Current status authority: [status matrix](../status-matrix.md). This phase/design guide is technical context, not independent release sign-off.

## Status

Implemented locally: Gmail adapter/registry; PKCE Google offline consent; encrypted token
refresh and invalid-grant revocation; verified Google OIDC Pub/Sub push; encrypted raw ingress;
PostgreSQL durable outbox/scheduler with Redis wake hints; tenant-scoped APIs; Gmail thread
headers and deep links; queued/sending/sent/failed UI; Supabase realtime invalidation; manual
customer alias merge/unmerge; admin dead-job inspection. Migration 005 extends the same 48 tables.

**Not done:** a real customer email has not been received through a user-connected Gmail account.
Google OAuth, Pub/Sub, production Redis/PostgreSQL and hosted Supabase realtime have not been
configured or exercised here. WhatsApp and approval APIs were added in later phases. General B1 catalogue/settings
APIs remain missing; see the current status matrix, not this phase chronology. No recipient-delivered claim is
made for Gmail: `sent` means the API accepted the message. The schema supports delivered/read
for future providers that offer authenticated evidence.

Cross-channel safety: unverified email From headers never auto-merge customers, even if another
channel has a verified matching address. Existing identity hashes are account-scoped for ingest;
manual same-person merge uses a tenant-scoped, owner/manager-authorized alias, preserving all
historical thread/order/receipt references. Verified phone/channel identity matching still needs
that provider's verified-identity adapter; Gmail alone cannot prove ownership of a phone number.
Merge/unmerge and dead-job inspection are currently API operations, not dedicated admin screens.

## Architecture and failure rules

- `channels/base.py` defines receive/send/history/deep-link and registry; Gmail is registered.
- PostgreSQL `jobs` is authoritative, with SKIP LOCKED claims, lease tokens, heartbeats,
  jittered exponential backoff and dead state. Redis is only a bounded wake queue. Losing Redis
  does not lose intent. Workers rediscover due tenants and recover expired claims.
- Push verifies RS256 Google signatures, issuer, audience, expiry and verified configured
  service-account email. It commits encrypted raw bytes and a deduplicated job before returning202.
  Envelope ID dedupe is separate from account-scoped Gmail message ID dedupe.
- Initial sync imports the last seven days of Inbox (not unlimited mailbox history), captures
  baseline history BEFORE listing, then replays history on the next poll. Expired Gmail history
  triggers the same bounded resync. Late messages cannot move last-message pointers backwards.
- Google send has **no idempotency key**. Outgoing RFC Message-ID is stable. After a crash or
  ambiguous POST failure, retries only search Sent to reconcile. A missing search result is not
  proof the message was unsent; it stays `DELIVERY_UNCERTAIN`, never blindly resent.
- Automated holding/follow-up intent is transactional and deduplicated. Holding reply is a fixed
  acknowledgement without business facts. Follow-ups use stored content, current cold stage,
  explicit consent, no opt-out, enabled settings and Africa/Lagos business hours. AI sends defer
  during chat takeover/outside configured hours and recheck intent before sending. Reservation
  expiry and takeover timeout are persisted jobs, not process timers. External send cannot be
  atomically committed with a last-millisecond concurrent takeover; requests already in flight
  cannot be recalled.
- AES-GCM binds ciphertext to vendor/account/purpose; keyring versions support rotation.
  HMAC identity/state/cursor pepper is independent. Never remove an old key before re-encrypting
  existing ciphertext. Never log tokens, bodies, phone numbers, DSNs or callback query strings.

## Run locally

1. Install JS dependencies (`npm ci`), create a Python virtualenv, then
   `pip install -e './api[test]'`. Python3.11+; Node matching repository requirements.
2. Copy root, api and web `.env.example` to their `.env` files. `docker compose up -d` provides
   PostgreSQL17 and Redis7 AOF. Initialization migrations run only on a **new** volume; existing
   deployments must apply 005 transactionally with their migration owner. Do not reset real data.
3. Provision a dedicated DB login securely (password supplied through your secret manager):
   `CREATE ROLE selvora_pipeline LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;`
   `GRANT selvora_service TO selvora_pipeline;`
   Configure API/worker DATABASE_URL with this role, not the migration owner. Pool startup rejects
   superuser/BYPASSRLS/INHERIT/role-creation/database-creation/replication logins. Runtime always
   SET LOCAL ROLE selvora_service and sets app.vendor_id inside the transaction.
4. Generate two independent secrets using `secrets.token_bytes(32)` and URL-safe base64. Store
   one in PIPELINE_KEYS JSON and the other in IDENTITY_PEPPER. Set PIPELINE_ENABLED=true only
   after keys, DB, Redis and Google settings are present. Keep secrets outside Git/chat/logs.
5. From `api/`: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log`.
   In another process from `api/`: `python -m app.pipeline.worker`. Both read api/.env when
   started there. Liveness `/health`; DB+Redis readiness `/health/ready`.
6. In web/.env set DATA_MODE=api, API_ORIGIN to the backend origin, and public Supabase auth
   values. Start `npm run dev`. Relative `/api/v1/*` calls proxy server-side. Use real vendor
   membership; API mode never substitutes samples. Other unfinished screens show API errors.

## Google / Supabase deployment checklist

- Enable Gmail API in a Google Cloud project. Configure OAuth web client, exact public HTTPS
  redirect URI, authorized test users/consent screen. Gmail readonly+send scopes may require
  verification/security review for external production distribution. Configure client secrets
  only server-side. Connect from Channels → Connect Gmail → Continue with Google, then Check
  connection. Gmail login is a connection flow after Selvora workspace authentication.
- Create Pub/Sub topic; grant `gmail-api-push@system.gserviceaccount.com` publish permission.
  Configure an authenticated push subscription to public `/v1/webhooks/gmail` (or proxied
  `/api/v1/webhooks/gmail`). Configure its OIDC service-account identity and exact audience in
  GMAIL_PUSH_SERVICE_ACCOUNT/GMAIL_PUSH_AUDIENCE. Set GMAIL_PUBSUB_TOPIC full resource name.
  Worker renews watch daily and polls every60seconds as recovery.
- On hosted Supabase ensure `supabase_realtime` publication includes messages, conversations,
  channel_accounts and customers (005 adds these only when the publication exists). Browser
  subscriptions use the user's Supabase JWT and existing forced RLS, filtered by vendor_id;
  no tokens are placed in websocket URLs. Reconnect invalidates/refetches resources. Local
  plain Postgres is NOT a hosted Supabase realtime service. The UI currently does not expose
  detailed websocket connection-health status; refresh remains available.
- Disable/redact query-string access logging at ingress and API. Restrict backend ingress as
  appropriate, enable TLS, configure WEB_ORIGINS for the deployed web origin, rotate secrets
  through a secret manager. Implement retention cleanup/monitoring before production: webhook
  expiry is stored, but no automatic retention deletion worker is shipped in this increment.
- Revoke access in Google account permissions to test invalid-grant handling; reconnect through
  consent to recover. A dedicated in-app Google revoke/disconnect control is not yet shipped.

## Implemented HTTP surface (all /v1)

- GET conversations, conversations/{id}, messages (scoped signed cursor)
- POST messages (Idempotency-Key), messages/{id}/retry, conversations/{id}/read
- PATCH conversations/{id}/human-mode
- GET channels; POST channels/connections, channels/connections/{id}/complete
- GET channels/oauth/gmail/callback; POST webhooks/gmail (provider OIDC, no user auth)
- GET jobs/dead (owner/manager, safe metadata only)
- PATCH customers/{source}/merge with targetCustomerId (null means unmerge)

User endpoints validate the Supabase session and active vendor membership; agent-assigned thread
restrictions apply to inbox reads/replies. Provider callbacks use their separate authentication.
No secret/raw-payload download is exposed by dead-job listing.

## Tests and remaining acceptance

`PATH="$PWD/.venv/bin:$PATH" npm run test:pipeline` runs Python tests plus a native PostgreSQL /
real Redis harness. The harness actually SIGKILLs a child process after claim and executes the
recovered job using a new worker. It tests duplicate/out-of-order ingest, cross-tenant denial,
reply idempotency conflict, pagination, read/takeover APIs, holding reply dedupe, simulated Gmail
acceptance, Sent echo dedupe and ambiguous-send retries that do not resend. Unit tests cover
context encryption, cursor tampering, MIME thread headers, history baseline, provider failure
classification and unsigned push rejection. Google transport remains simulated.

Live acceptance still requires: deploy and authorize Gmail; send a real email; observe realtime
inbox arrival; replay duplicate/out-of-order notifications; reply from vendor Gmail and verify
thread/delivery state; revoke/reconnect; kill/restart production workers with delayed intents
pending. Do not mark B2 complete before those checks. Full timer/provider/OAuth lifecycle fault
coverage and dedicated admin merge/dead-letter UI are still follow-up work.
