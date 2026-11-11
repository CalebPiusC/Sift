# B0 event and idempotency model

> Current status authority: [status matrix](../status-matrix.md). This phase/design guide is technical context, not independent release sign-off.

## Events

`domain_events` is append-only, vendor-scoped and immutable even to the bounded service role.
Typed nullable composite FKs identify actor membership, customer, conversation, message, order,
receipt and product; no arbitrary metadata JSON, phone, token or message body. Event types are constrained:
message_received, reply_sent, approval_created, approval_decided, lead_stage_changed, order_created,
order_paid, order_status_changed, receipt_issued, stock_changed, takeover_started, takeover_ended,
followup_sent, restock_notified, channel_connected, customer_identity_linked, payment_verified.

`occurred_at` is business event time, `recorded_at` is durable ingestion time; both UTC. The stream
has aggregate_revision, from/to status, payment source and integer amount (where applicable),
correlation_id and unique `(vendor_id,dedupe_key)`. Replaying the same verified event must
reuse its dedupe identity. No insertion order assumption: use `(recorded_at,id)` for stream cursors,
`(occurred_at,id)` for per-conversation funnels. With equal timestamps the UUID is a deterministic
sort tiebreaker, NOT causal order. Consumers must use per-aggregate revision and actual from/to
transition pairs; if exact cross-aggregate causality is needed, the future producer adds an explicit
causation event ID in a reviewed migration rather than treating UUID sort as truth.

SQL triggers capture message receive/sent, approval creation/decision, initial and changed lead
stage, takeover start/hand-back, order creation/payment/status, receipt issuance, stock movement,
follow-up sent, restock notified and verified-payment ledger insertion in the same transaction.
Channel-connected and identity-linked producers are reserved for later verified integration
transactions. Time-based takeover expiry uses the worker introduced after B0;
no database timer is pretended here. Snapshot state changes and message sends must not be confused:
queued is not sent, screenshot is not order_paid, draft receipt is not receipt_issued.

Events are **not backfilled as fabricated historical facts**. B0 starts event history at migration.
Earlier records can support labelled snapshot analytics only. True historical funnel queries use
lead_stage_changed `from_stage`/`to_stage`, count distinct conversations, and explicitly define first
entry/re-entry, window and payment attribution. Corrections append compensating facts; never edit
old events. Retention/export/legal erasure design must be reviewed before real private data rollout.

## Idempotent writes (implementation contract, not a delivered HTTP wrapper)

All normal POST/PATCH/PUT/DELETE endpoints require `Idempotency-Key`; the full map is in
backend-roadmap.md. Especially order creation/status/payment, receipt issuance, stock adjustments,
reservations, sends, approvals and provider connection operations. A missing/invalid key is VALIDATION.

1. Authenticate/authorize tenant, active membership, role, action, fields and resource first. Resolve
   actor_scope from stable authenticated user or trusted worker identity, never arbitrary body values.
2. Canonicalize method + normalized path/resource + allowlisted body + relevant revision; hash it.
   HMAC the key with a server secret. Do not hash unstable JSON key ordering or log the key/body.
3. Begin DB transaction, SET LOCAL ROLE selvora_service and SET LOCAL app.vendor_id. Insert
   `(vendor_id,actor_scope,operation,key_hash,request_hash,status=in_progress,expires_at)` using the
   unique constraint. Concurrent duplicate insert waits for the winner’s transaction.
4. On conflict, lock/read the existing row. Different request_hash → 409 CONFLICT. Same completed
   request → decrypt and replay stored HTTP status/body. Do not reapply side effects or generate
   a new helper code/payment link/receipt. Authentication and resource access are rechecked before
   replay. Do not cache authorization errors across membership changes.
5. A transaction-visible in_progress row should exist only during the active transaction. A process
   crash before COMMIT rolls the reservation/domain work back. Do not commit an abandoned in_progress
   reservation and then perform financial work later; outbox intent and job are the completed result.
6. Lock aggregate/inventory rows in deterministic order. Enforce expectedRevision in the UPDATE
   predicate. Write domain changes, immutable ledger entries, events, jobs and encrypted replay result
   in ONE transaction; mark completed and commit. A provider call must not hold a DB transaction open.
7. Return accepted queued intent (202 where appropriate). The worker uses its own stable operation
   identity and provider idempotency capability; mark sent only on verified provider response.
   Retry limits/leases live in jobs; reclaim with lease token comparison and recheck takeover/consent.
8. Keep ordinary replay rows at least 24h (longer than allowed retry horizon); financial/send operation
   semantic uniqueness is permanent in order-payment references, per-order receipt uniqueness,
   stock/usage dedupe keys and provider event/delivery identities. TTL expiry is NOT permission to
   charge/send/deduct twice. Worker retention must preserve permanent business dedupe references.

Four-digit helper codes have tiny entropy: store **keyed HMAC with an external pepper**, not plain
SHA-256. Encrypt replay bodies (including one-time code) with external KMS/key-version reference;
never put encryption keys into SQL or browser env. OAuth/invitation/receipt capabilities have high
entropy; store only hashes. Channel credentials/raw provider payloads are application-encrypted.

## Outbox and webhook boundary

Verify signatures on the exact raw request bytes; resolve a vendor/account from verified provider
routing. Store encrypted raw event + hash + provider dedupe and enqueue job transactionally, then
ACK quickly. A duplicate provider identity with a different payload hash is rejected/quarantined,
not silently treated as the original event. Invalid/unresolved events never enter another vendor’s tables. Paystack uses verified
merchant/reference mapping, not a browser-supplied vendor ID or screenshot. Provider event IDs
are not trustworthy until signature/account checks pass. Event/job application has its own dedupe.

Later B2–B9 phases supply provider adapters, application encryption/HMAC, durable workers and
analytics. Universal idempotency and physical cleanup/erasure are NOT complete. The rules above
are design requirements; inspect each handler and the status matrix for actual coverage.
