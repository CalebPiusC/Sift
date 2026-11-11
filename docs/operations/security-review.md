# B9 security review — code/tests, not independent penetration certification

## Verified locally

- Full forced-RLS tenant permission matrix and composite cross-tenant FK suite;
  restricted service login rejects superuser/bypass/INHERIT roles. Operations
  functions revoke public/anon/authenticated execution; global endpoint requires
  explicit operator UUID, not vendor ownership. Unknown vendor scope fails closed.
- Existing signed webhook, Paystack authenticated verification, replay/dedupe,
  window/template, private media and encrypted token regression tests retained.
- Global + vendor AI pause checked before outbox processing and immediately before
  template/normal provider sends; deferred sends do not exhaust retry budget.
- Four explicit prompt-injection attacks fail automatic-reply decision tests;
  existing factual reply evaluator/approval checks remain. This is not a universal
  prompt-injection guarantee or model red-team certification.
- Rejected validation inputs are no longer echoed. Safe production log formatter
  excludes arbitrary messages, tracebacks and provider/request payloads.
- Real Redis limiter atomically counts across clients; only HMAC peer identifiers
  persist for 120 seconds; 429/503 never falsely acknowledge webhook delivery.

## Findings and required deployment controls

- **Blocker:** B6 channel integrations/approvals and real-channel demo incomplete.
- **Blocker:** B7 physical media retention purge/account erasure incomplete.
- **High:** No configured live paging/error-tracking/backup destination. Wire monitor
  and allowlisted event logs to a human and test actual delivery.
- **High:** App peer-IP fixed windows are basic protection, not distributed bot
  detection; edge WAF, trusted-proxy config and body/concurrency budgets required.
  Do not turn on a tiny shared-proxy budget that starves signed inbound events.
- **High:** Global operator is a deployment allowlist checked in API. All service
  DB credentials are trusted backend authority; restrict to service network/secret
  manager. Database global setter is not separately operator-authenticated; never
  expose the service DB login or SECURITY DEFINER function via public RPC clients.
- **High:** Backup test is a local stopped-cluster physical restore only; hosted
  auth/storage/key recovery and PITR acceptance remain manual.
- **Medium:** Safety dashboard is aggregate triage, not unrestricted customer/error
  browsing. Category feedback avoids free-text PII but lacks rich reproduction info.
- **Medium:** Error tracking is redacted event emission + dead-job codes, not a
  configured external SaaS; raw stack traces are intentionally unavailable.
- **Medium:** No hard per-vendor media/token abuse budget beyond conversation
  metering. Gemini failed-call costs need invoice reconciliation.
- **Medium:** Kill switch cannot recall an already in-flight provider request.
  Emergency token revocation/egress block is a separate operator step.
- **Medium:** Test/burst run is synthetic DB ingestion, not a signed-webhook HTTP
  saturation test, production benchmark or multi-worker/provider load test.
- **Medium:** Invite landing page exists, but live email delivery, auth tab/session
  behaviour and both real mobile browsers must pass the manual checklist.

Storage review: blobs remain private and encrypted in current DB-backed media
implementation; do not introduce public buckets. If migrating to object storage,
add owner/tenant read policies, short-lived signed URLs and cross-tenant tests.
Never cache private API/media/receipt paths in CDN or service worker.

Secrets: no secrets were requested in chat. Use server-only secret manager env;
`api/.env.example` contains placeholders. Rotate using versioned keyring, retaining
old decryption keys through retention; identity pepper rotation needs an explicit
identity migration. Run repository secret scan before every deployment.
