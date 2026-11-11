# Operational runbook and retention proposal

## Kill switch

Owner bearer + X-Vendor-Id: `PATCH /v1/operations/vendor/ai-pause {"paused":true}`.
Global operator bearer (allowlisted Supabase UUID):
`PATCH /v1/operations/ai-pause {"paused":true}`. Use false only after review.
Global state is durable in the DB; do not rely on restarting processes to pause.
Immediately revoke compromised provider tokens as well. In-flight requests cannot
be recalled. Resuming can release queued sends after normal safety revalidation.
Owner/manager `/v1/operations/vendor` shows aggregate job failures, blocked reply
codes, approval reasons and category feedback without message content. Global
operator `/v1/operations/backlog` returns counts/age and worker-heartbeat alerts.
Investigate original chats only through authorized inbox access, never logs.

## Incident checklist

1. Declare severity, assign commander + scribe and record UTC start time.
2. Pause affected vendor, or global AI for cross-tenant/payment/safety incidents.
   For suspected credential compromise, revoke tokens and block network egress.
3. Freeze deploys; preserve encrypted evidence, audit trail and provider IDs under
   restricted access. Do not paste PII or secrets into chat/tickets/logs.
4. Check oldest jobs, worker heartbeat, dead letters, provider status, Redis/DB,
   verified payment ledger and lease state. Never mark a screenshot as payment.
5. For uncertain sends/refunds/payments reconcile provider state before retry.
6. Assess impacted vendors/contacts/data and legal notification deadlines with
   responsible counsel. Communicate verified facts and next update time.
7. Fix in staging; run tenant/negative-role tests, webhook dedupe, prompt attacks,
   kill-switch and paid-order/receipt regression. Require independent approval.
8. Resume one consenting canary vendor; monitor backlog, errors, unusual approvals,
   duplicates, usage and provider billing before gradual expansion.
9. Document timeline/root cause, data recovery point, actions and named owners.
   Rotate exposed secrets; schedule follow-up and backup/restore rehearsal.

## Backup/restore

Proposed targets (not contractual): RPO <=15 minutes with managed PITR; RTO <=4
hours. Deployment owner must verify platform plan supports this and approve.
Use provider-supported managed backups/PITR as primary. `backup.sh` creates a
custom pg_dump using protected libpq service config; `restore.sh` refuses cleaning
an existing target. Run only with correct PostgreSQL tooling and an isolated DB.
Snapshots/dumps contain PII/ciphertext: encrypt storage, restrict access, never Git.
Keep encryption keys/identity pepper in separate escrow with recovery permissions.
Back up private media blob storage and auth/platform state separately.

Restore rehearsal: block all egress and workers; restore roles/extensions/schema,
DB/auth/blob bytes as appropriate; inspect row counts, receipt totals/snapshots,
foreign keys/RLS, credential decryption and opt-out records. Keep global AI paused.
Reconcile outbox/payment/provider state before any replay. Record duration and
recovery timestamp, then securely destroy the drill environment.
`tests/restore-native.test.mjs` tests stopped-cluster physical copy/restore, not
hosted PITR, cross-version restore or the shell scripts. Rehearse deployed tools.

## Retention policy proposal — requires legal/operator approval

| Data | Proposed retention | Current enforcement / launch action |
|---|---|---|
| Private audio/images | 30 days unless lawful hold | Access expiry exists; physical purge not shipped — blocking |
| Webhook encrypted payloads | 7 days | Expiry timestamp exists; verify physical purge job before launch |
| Chat/customer memory | Active contract + approved deletion grace | Business deletion currently request/freeze, not physical erasure |
| Receipt/payment/audit evidence | Statutory accounting/dispute period set by counsel | Append-only; no automated deletion until legal period approved |
| PII-free operational events | 30 days | Configure collector lifecycle; no destination configured here |
| Feedback categories | 90 days, or aggregated anonymized reporting | Stored as audit actions; reconcile with audit retention policy |
| Daily backups | 30 days + PITR approved window | Configure externally; erasure ages out with documented backup lifecycle |

No universal statutory duration is assumed. Separate consent/opt-out suppression
retention from content erasure: preserve minimum hashed suppression evidence so
account cleanup does not cause unsolicited re-contact. Do not clear STOP records.
Retention execution, legal holds and account deletion require implementation and
review; this policy text is not proof of deletion.
