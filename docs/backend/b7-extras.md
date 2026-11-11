# B7 — backend slice (not acceptance-complete)

This phase adds migration 009 and real tenant-scoped endpoints. It is **not** a
claim that all eight B7 features meet acceptance. Existing Extras, Team and
Notifications frontend screens still need API-mode integration and end-to-end
acceptance. Do not demo a simulation as a real provider delivery.

## Implemented boundaries

- Customer notes/tags persisted, with assignment-aware agent access and audit.
- Explicit customer-consent follow-up scheduling, cold/open lead and enabled
  settings checks; purchase/reply database cancellation; STOP suppresses contacts
  durably. The final outbox boundary checks suppression and source validity again.
- Transparent local spam classifier plus credential-phishing, suspicious-link,
  repeated-spam and unverified-payment-release rules. Flags suppress automation;
  manager/owner Not spam and Block actions are persisted and audited. This is a
  conservative heuristic classifier, not a trained fraud model or payment proof.
- Product/variant restock subscriptions require inbound consent naming the item;
  stock changes enqueue durable work. Consent, suppression, exact variant stock
  and content are checked again before delivery. WhatsApp outside-window sends
  require an approved fixed template; existing WhatsApp adapter validates it.
- Owner-only team invitations queue Resend delivery with encrypted token storage,
  verified-email acceptance, expiry and inviter-authority checks. Ambiguous email
  delivery fails closed rather than resending indefinitely. Managers can assign
  chats but cannot invite/promote members. Protected owner roles cannot change.
- Display-only Gemini English translation/summary job for detected non-English
  messages; no derived text enters payment/product evidence.
- Persisted approval/ready-to-pay/system notifications and member-owned read state.
  Push is not implemented (optional).
- Owner business JSON export, explicit table allowlist and size limit; deletion
  **request** freezes user operations and message automation. Physical deletion,
  identity/account erasure and legally reviewed retention execution are unfinished.

## Configuration and deployment

Apply all migrations in order. Configure `EMAIL_API_KEY`, `EMAIL_FROM` and an
HTTPS `PUBLIC_WEB_URL` for Resend invitations; configure `GEMINI_API_KEY` for
translation. Do not commit credentials. Providers have not been exercised live
from this environment. `/invitations/accept` frontend landing page is not shipped
in this slice; the API is `POST /v1/team/invitations/accept` with `{token}` and a
verified-email bearer session. Do not enable invitation UI until this page exists.

## Reproducible backend demo

Run `node --test tests/b2-native.test.mjs`: the harness starts isolated PostgreSQL
and Redis, applies every migration, then invokes `tests/helpers/b7_checks.py`.
It demonstrates real persisted customer memory, consent scheduling, inbound STOP,
cancellation, classifier/Not spam, notification reads and export without contacting
external providers. `pytest api/tests/test_extras.py` checks classifier/STOP and
unsafe-input contracts.

## Outstanding acceptance work

- Feature-specific negative role/tenant and worker race tests, restock end-to-end,
  invitation verified-email/replay/live delivery tests, translation provider tests,
  deletion/retention execution and per-feature demos.
- API contract manifest/OpenAPI reconciliation and real frontend wiring, including
  invitation acceptance, history/read state and export/deletion controls.
- Global suppression concurrency across linked threads/identities needs stress
  validation. A provider send already in flight cannot be recalled by STOP.
- Export currently rejects >10,000 rows/table rather than silently truncating;
  large exports need streaming/pagination. No repeatable-read snapshot guarantee.
- Translation detection inherits current English/Pidgin heuristic limitations.

B6 Meta integration is still unfinished. No new automatic TikTok inbound detection
or approved platform access is implied by B7.
