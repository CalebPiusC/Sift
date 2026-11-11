# Go-live checklist — release is currently NO-GO

**Decision:** NO-GO for general commercial launch. Local checks are evidence of
implementation, not live provider approval. The required full demo from real
signup → real inbound channel → verified payment → receipt has **not** run.
No channel credentials or live payments were used in this phase.

Assign an owner and timestamp to every checkbox; store sensitive screenshots and
provider IDs in encrypted `private-evidence/` or approved external storage, never
Git. Release approver: ______ Date: ______ Evidence location: ______

## 1. Scope and unresolved release blockers

- [ ] Choose launch channels explicitly. B6 Meta Instagram/Facebook integration
  and TikTok approval remain unfinished. Do not advertise them as working.
- [ ] Approve WhatsApp account/number/Embedded Signup permissions and outbound
  templates; keep merchant numbers separate from the Selvora helper number.
- [ ] Complete or explicitly exclude unfinished B7 work: physical account deletion,
  media physical-retention purge, live invitation/translation acceptance and broader
  restock/role/race tests. Do not call a deletion request completed erasure.
- [ ] Implement/review cancellation and overlapping billing-plan management or
  operate a documented manual process; do not permit double subscriptions unnoticed.
- [ ] Resolve security review findings in `security-review.md`; obtain independent
  production penetration/tenant-isolation review. This coding review is not a certification.

## 2. Deploy and secret handling (manual)

- [ ] Create separate production/staging Supabase, Redis and provider projects.
- [ ] Apply migrations 001–011 in order with an authorized migration account;
  inspect diffs and take a pre-deployment backup. Existing Compose volumes do not
  rerun init migrations automatically.
- [ ] API DB login: NOINHERIT, NOSUPERUSER, NOBYPASSRLS; only required service role.
  Keep migration/superuser credentials out of API/worker environments.
- [ ] Store credentials in deployment secret manager, not frontend env/Git/logs.
  Set encryption keyring + stable identity pepper; escrow keys separately from DB
  backup; test decrypting a restored credential. Keep old key versions on rotation.
- [ ] Set exact HTTPS CORS origins, public URL and Supabase redirect URLs; verify
  verified-email signup, password recovery, logout and invitation acceptance.
- [ ] Configure real Paystack, Meta, Google, Gemini and Resend credentials only for
  selected launch scope; least permissions; rotate anything ever exposed.
- [ ] Run `python scripts/operations/preflight.py` in deployed environment. It is an
  offline configuration gate, not a credential validity or live-demo check.
- [ ] Enable `RATE_LIMIT_ENABLED=true`; size Redis and tune both minute budgets
  with staging traffic. Configure trusted ingress addresses, never trust arbitrary
  X-Forwarded-For or Uvicorn `--forwarded-allow-ips='*'`.
- [ ] Add edge per-IP/WAF limits and request body limits, especially public auth,
  receipt, media and webhook paths. App limits are fixed-window/peer-IP controls,
  not a complete bot shield. Shared proxies/NAT must not unfairly lock out vendors.
- [ ] Configure TLS, private DB/Redis networking, at-rest encryption and egress.
- [ ] Launch API with `--no-access-log --log-config api/logging.json` (PYTHONPATH=api).
  Disable request/response capture in proxy, APM, Sentry and provider SDKs. Never
  log query strings, tokens, email, phone, chat content or raw exceptions.

## 3. Operations and observability

- [ ] Configure liveness `/health` and dependency readiness `/v1/health/ready`.
  Readiness is not worker/provider health; restrict/rate-limit it at the edge.
- [ ] Configure `OPERATOR_USER_IDS` for audited, MFA-protected operator accounts.
  Vendor owners are not global operators. Remove access promptly on offboarding.
- [ ] Schedule `scripts/operations/monitor.py` each minute using a securely renewed
  operator bearer session. Page a real human on nonzero exit, dead jobs, oldest
  due job > QUEUE_ALERT_SECONDS, or missing/stale worker heartbeat. Test delivery
  to the chosen pager. No alert destination was configured by this change.
- [ ] Route allowlisted `request_failure`, `queue_backlog`, `rate_limited` and
  `rate_store_unavailable` events to error tracking; configure rate alerts and
  retention. Do not enable stack/request capture to get richer diagnostics.
- [ ] Test vendor and global kill switches during an actual queued-send demo.
  Pause gates AI sends, including template sends, but cannot recall a provider
  request already in flight. Manual sends remain subject to contact/window rules.
- [ ] Review dead/uncertain deliveries without blind retry. Inspect provider sent
  state first. On resume queued sends revalidate; paused inbound is not auto-replayed.

## 4. Backup, retention, incident readiness

- [ ] Approve RPO/RTO, retention/legal requirements and deletion policy in `runbook.md`.
- [ ] Enable managed encrypted daily backups + PITR; inspect successful backup ages.
- [ ] Schedule a real hosted restore drill into an isolated, egress-disabled project.
  Restore auth/storage separately where needed; DB dumps do not back up blob bytes
  or secret-manager keys. Verify receipt counts/hashes, encrypted token decryption,
  RLS isolation and replay safety before reconnecting workers.
- [ ] Record restore duration, recovered timestamp, operator and evidence. The
  repository cold-restore fixture is not a test of managed PITR or pg_dump tooling.
- [ ] Implement/verify physical expiry purge and lawful account-erasure workflow;
  do not launch with indefinite unmanaged media retention.
- [ ] Rehearse `runbook.md` incident checklist with a second operator.

## 5. Required REAL-channel acceptance demo (manual, blocking)

Use your own consenting test customer and merchant; never arbitrary contacts.

- [ ] Sign up via production-like Supabase, verify email and create business.
- [ ] Invite a friend with Resend; receive email; accept with correct verified
  account. Wrong email/expired/reused invitation cannot elevate roles.
- [ ] Connect an authorized real channel and confirm signed provider webhook reaches
  this vendor only. Revoke/reconnect tokens and prove recovery.
- [ ] Send real text + voice where supported; confirm private media, customer memory
  and inbox persistence. Re-send duplicate event; prove no duplicate reply/order.
- [ ] Demonstrate approved FAQ reply and human approval/takeover; send injection,
  fake-payment claim and STOP; prove no unsafe automated send follows.
- [ ] Create order by chat, confirm variant price/stock facts and reserve last item.
- [ ] Complete a real or Paystack **test-mode provider** payment; verify signature,
  authenticated verify result, exact amount/currency and once-only paid transition.
  A locally mocked verify response does not satisfy this checkbox.
- [ ] Receive immutable receipt; open signed share, revoke it, verify revoked access
  fails. Confirm receipt matches order lines, totals and customer-facing delivery.
- [ ] Purchase test subscription: unchanged limits before verified webhook; upgraded
  after it; replay webhook; prove no second grant. Exercise renewal/failure/bundle.
- [ ] Cross 80%/100% usage, show warning history, saved inbound messages and manual
  vendor reply at limit. Ensure no silent message loss or fabricated success.
- [ ] Run Android/iPhone checklist, then record release sign-off with evidence.

## Local evidence from this phase

`npm run test:readiness` (with venv Python on PATH) covers full migration chain,
real PostgreSQL/Redis, vendor/global kill, operator denial, limiter, feedback,
backup restore and burst dedupe. External sends/Paystack verification are mocked.
Initial burst: 200 events/100 unique, ~0.68 s elapsed, ~0.635 s p95 on local fixture.
Not a production throughput/SLA claim; webhook HTTP, provider latency, sustained
traffic, multiple worker replicas and production database limits need staging load.
