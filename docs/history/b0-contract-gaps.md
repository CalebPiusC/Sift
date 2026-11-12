# Historical B0 schema reconciliation

Historical comparison against migrations001–002, not current API status. See [status matrix](../status-matrix.md). Later phases supersede “future”/“not implemented” notes below.

# B0 contract → F0 database gap inventory

This compares **every current function**, including inherited catalogue mutations and mock/local
methods, against migrations 001–002. New schema is migrations 003–004. The exhaustive column,
constraint and index inventory is generated in [schema-delta.md](schema-delta.md); this file
explains DTO mapping, aggregates and non-table responsibilities. HTTP implementation status and
all method names are enumerated separately in [backend-roadmap.md](../backend-roadmap.md).

| Contract functions | F0 mismatch/missing storage | B0 reconciliation / derived fields |
|---|---|---|
| catalogue.list/get | category, details, archived, low-stock threshold, revision, photos missing; no list indexes | products fields; product_photos ordered private storage keys; product_variants joined; list/stock/category cursors. `stock` maps stock_count; four stock badges derived, not another column |
| catalogue.extract | no extraction draft/request ownership or expiry | catalogue_drafts, private product_photos references; real extraction/provider/storage deferred; no generated price/stock truth |
| catalogue.createMany | no request dedupe or photo persistence | idempotency_keys, drafts/request_key, atomic products/variants/photos; kobo/stock/floor checks |
| catalogue.update/archive | no revisions/archive, optimistic update or stock ledger | revision triggers, archive column, stock_movements, reservation guards; variant floor checks; expectedRevision enforced by future WHERE |
| catalogue.proposeText/confirmText | no pending proposal, candidate facts, selected product, status/expiry | typed_proposals with member/product FK + revision; idempotency and stock ledger on confirmation |
| conversations.list/get | no status/stage/assignment/thread URL/last activity/revision | new columns, active member FK/guard, thread-consistent last_message_id; unreadCount derived from conversation_reads + incoming timestamps, customerName/channel derived by join |
| conversations.markRead | no per-user last-read state | conversation_reads unique per member/thread; no global unread counter |
| conversations.setHumanMode | F0 human boolean/expiry existed, no durable event/indexed activity | retain boolean for old consumers, expiry authoritative; append events; future worker must recheck before send |
| messages.list | no cursor index; content name differs from text | thread index, stable created_at/id; content→text serialization; full before/after history specification |
| messages.send | no outbox/delivery states, media/summary/rich message fields or send dedupe | kind/transcript/duration/private audio key/summary/snapshots/revision; queued/sending/delivered/read states, message_deliveries/jobs/idempotency; signed media URLs generated, not stored |
| approvals.list/decide | F0 facts/reason/status existed; confidence, decision actor/time, sent holding reply and revision missing; message could belong to another same-vendor thread | new columns + composite thread/message FK, pending/deadline indexes; decisions/outbox atomic in future API; JSON facts remain snapshots, live references verified by service |
| orders.list/get/setStatus | F0 pending/confirmed/fulfilled/cancelled differs from seven frontend states; missing conversation/address/link/screenshot/paid date/revision/timeline/stock movement | explicit legacy-state mapping; new fields, order_timeline, stock_movements, item name/variant snapshots; customerName joins; status and pagination indexes |
| orders.confirmPayment | F0 explicit payment RPC exists but no payment ledger, idempotency ledger, stock transaction or paid event | payments, idempotency_keys, stock/reservation ledger, owner/manager RPC guard + paid_at/state/event; future HTTP transaction still must atomically reconcile payment + inventory |
| receipts.list/get/issue | F0 immutable JSON snapshot/number exists; snapshot lacks vendor/customer/subtotal fields; no secure capability share | future issuance uses item snapshots/vendor/customer/subtotal; receipt_shares hashed capability; existing snapshots stay unchanged; sequential locks retained; no hosted PDF/share route added |
| customers.list/get/update | F0 display_name, phone/email/language only; no notes/tags/flag/city/updated timestamp or identity model | new fields/constraints; display_name→name; customer_identities holds encrypted provider identity + HMAC; history through orders/conversations, not invented arrays |
| channels.list | F0 error status versus frontend expired, no own-account flag | expired + retained error state; own_account=true; error→expired/disconnected requires explicit DTO treatment, never claim connection |
| channels.begin/complete | no expiring latest OAuth state or credential storage | channel_attempts unique pending/account, 10min; channel_tokens encrypted + key version; real callback/refresh deferred |
| channels.helper/newHelperCode/confirmHelper | no helper link/code attempts/status | helper_links HMAC digest, 10min, max5 attempts, one pending/linked per vendor; raw code returned once by future server then encrypted idempotent replay; mock confirmation is NOT a production auth route |
| settings.get/update | vendor stores identity/type/tone/negotiation but no safe intent lanes/languages/hours/fees/member preferences | business_settings, seven business_hours, delivery_fees, member_preferences; IDs/tenant immutable; same-day WAT; explicit per-field endpoint auth |
| insights.get | F0 only latest row state, no funnel history | domain_events append-only + indexes; existing order/payment sums; no fabricated pre-migration historical transitions; API analytics deferred |
| team.list/invite/setRole/assign/audit | F0 real members have user_id/role only, no names/status/invitations; no assignment; audit has UUID actor not name | vendor_members name/status, team_invitations + invitation_secrets, active assignment FK; actor name derived from membership; audit actor composite FK; owner-protection API transaction required |
| billing.get/selectOffer | no account/offers/selection/trial/usage/bundles | billing_accounts, vendor-scoped billing_offers, billing_selections (no entitlements), usage_meters/usage_entries; real payment/subscription providers deferred |
| extras.get/configure/followup | no follow-up settings/queue/sent history/consent | followup_settings/followups, due index, jobs, consent/opt-out dates; sent timestamps checked; production only cancellation from UI, mock simulate_send stays local |
| extras.moderate | no flagged message or blocked external identity | moderation_flags, blocked_identities; actual message FK, reason/status/actor, no duplicate plaintext copy; provider block future job |
| extras.notifyRestock | no customer requests, variant preference or consent | restock_requests with product/variant/customer/identity constraints and waiting uniqueness; notify simulation not deployed; real stock/consent/job checks deferred |
| realtime.subscribe | no persistent event cursor/outbox | domain_events ordered cursor; future SSE invalidation DTO; subscription callbacks/unsubscribe stay client-side |
| MockControls.simulateIncoming/simulateInviteAccepted/simulatePaymentScreenshot/failNext | deliberately no production storage operation | Mock only, no endpoints; webhook/payment/member real paths must independently verify truth |
| DataClient.dispose | local resource cleanup only | no database/API operation |

## Supporting gaps explicitly requested beyond current frontend functions

- **Notification history:** notifications with per-member RLS, read_at, dedupe and cursor/unread indexes.
- **Channel tokens:** ciphertext/key version/expiry/revocation, service-only. No encryption key in DB.
- **Codes/secrets:** helper HMAC, OAuth state digest, invitation token digest, receipt capability digest.
- **Usage:** period bounds, counters, immutable deduped entries; no commercial entitlements inferred.
- **Reservations:** order/item/product/variant composite FKs, active uniqueness, quantity/expiry,
  locked inventory capacity guard; commit/release/expiry state. Service transactions still required.
- **Delivery:** separate provider attempts/IDs/timestamps/safe error codes and message state enum.
- **Customer identities:** unique per connected account + hashed external identity, encrypted routing
  identifier, optional verification; identity linking must be explicit and verified, not name matching.
- **Raw webhooks:** signature-verified vendor-scoped ciphertext + payload hash, provider dedupe,
  receipt/processing/retention timestamps. Resolve tenant only after verified routing; never accept
  arbitrary tenant body/header. Unresolved/invalid events are rejected/quarantined outside tenant DB.
- **Jobs:** due time, lease token/expiry, retries/max attempts, dedupe, typed entity FKs, safe error
  code/dead state; no arbitrary raw-message JSON job payload. No running worker supplied in B0.
- **Idempotency:** actor/operation/key/request hashes, encrypted completed replay, TTL and typed FKs.
- **Events:** immutable typed fact stream with safe entity references and explicit stage transitions.
- **Audit:** append-only, tenant-scoped actor reference; no arbitrary payload column. Legacy
  entity_type/entity_id is descriptive audit metadata, never a routing authority or FK substitute.

## Naming and migration decisions

Keep F0 snake_case SQL and map camelCase DTO fields in API serializers. Do not rename content,
display_name, stock_count, total_kobo or receipt_number just to imitate TypeScript. `assignedName`,
customerName, channel label, stock badges and billing usage are joins/aggregates. Product photos
and audio store private storage keys, never permanently public/signed URLs. Arrays of variants,
items, history and audit are relational child reads. Safe facts/rich-message/receipt data are frozen
JSON snapshots; never use arbitrary snapshot IDs to bypass typed live FKs.

No live prices, fees, trial entitlements, channel credentials or historical analytics are invented by
backfills. Existing F0 cities remain descriptive delivery_city text; customer city is a bounded field.
Existing receipts are not rewritten to add missing historical names; API must label unavailable
legacy snapshot fields or provide a versioned legacy serializer. Existing paid_at uses creation time
only as an explicitly documented migration fallback. Onboarding initializes settings/hours/preferences.

## Legacy data translation and provenance

| F0 state | Paid? | B0 state |
|---|---|---|
| pending | no / yes | draft / paid |
| confirmed | no / yes | awaiting_payment / preparing |
| fulfilled | no / yes | awaiting_payment / delivered |
| cancelled | either | cancelled (no automatic refund/restock) |

Backfilled order-item names are current catalogue names at migration, **not recovered purchase-time
truth**. `order_items.snapshot_source=legacy_migration` marks those rows; new rows default to
order_creation. Existing paid_at fallback timestamps have `paid_at_source=legacy_creation`.
Future verified payment transactions set paid_at_source=verified. Historical receipts remain byte-for-
byte unchanged. SQL events are not generated retroactively by provenance-only migration updates.
