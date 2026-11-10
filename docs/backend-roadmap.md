# Backend roadmap — authoritative B0 reconciliation

**B0 is the schema/security baseline; B2 adds an opt-in Gmail message pipeline and B3 adds the fact-backed reply engine.
See [B3 implementation, safety boundaries and pending live acceptance](backend/reply-engine.md).**
See [B2 implementation and deployment status](backend/gmail-pipeline.md) for the implemented
routes, tests and remaining live acceptance. Other B1/domain HTTP endpoints remain unimplemented.
The generated endpoint inventory below is the B0 planning inventory, not a current deployment
claim. F0 response shapes remain unchanged. Hosted verification and live Gmail acceptance are pending;
local provider simulations are not hosted proof.

Sources: [exact schema delta](backend/schema-delta.md), [function-to-storage gaps](backend/contract-gaps.md),
[enforced role matrix](backend/role-matrix.md), [events and idempotency](backend/events-and-idempotency.md).
`backend/endpoints.json` is the machine-readable endpoint inventory. Tests prevent method omissions
and generated-document drift. `api-contract.md` retains the exact current frontend declarations.

## Boundary and authorization

Browser URLs `/api/v1/*` will proxy to FastAPI `/v1/*`; no proxy/handlers are added by B0.
Every normal request requires a verified Supabase bearer token and X-Vendor-Id. Verify active
membership server-side; untrusted headers, role claims and body vendorId never grant access.
Agents' operational actions are limited to assigned or unassigned chats (not others' assigned chats).
Reads follow the table matrix; API must not reveal invitations to non-owners or billing to agents.
For business mutations, authorize the endpoint/field first, then use a transaction under the bounded
service role with tenant scope and resolved actor membership. RLS does not replace input/field/action
authorization. Never deploy using Supabase service_role as a general bypass client.

The table matrix describes direct SQL operations; API-authorized financial and operational actions
can use service-only tables, rather than granting clients the ability to forge incoming messages,
paid states, assignment, immutable events or jobs. Service credentials never reach the browser.
Existing SQL RPCs are explicit exceptions: onboarding creates the tenant; manual payment and receipt
issuance require owner/manager. New HTTP payment/receipt operations must still wrap/replace these
with the idempotency and ledger transaction below. The F0 RPC signature alone is not an idempotent
HTTP implementation and does not yet implement all stock/payment side effects.

## Cursor contract (backend target; current mock retains offset compatibility)

All unbounded collections use `limit` 1–100 (default 50), `cursor`, optional `direction=before|after`.
Response: `{ok:true,data:{items,nextCursor,previousCursor,hasMore}}`. Exact total is optional only
when explicitly requested; no fake total, no fixed first-100 truncation. Tokens are versioned,
base64url encoded **and HMAC signed**, binding tenant, resource, parent/thread, filters, order,
watermark and last `(sort_timestamp,id)` tuple. Invalid/tampered/expired/mismatched cursor is 400.
All ties use UUID id; never PostgreSQL insertion order. Clients deduplicate IDs across refreshes.

- Inbox: updated_at DESC,id DESC, bounded by initial page watermark. Rows changed beyond that
  watermark appear on refresh; this is not a transaction snapshot spanning requests.
- Orders/customers/catalogue/approvals: created_at DESC,id DESC; receipts: issued_at DESC,id DESC.
- Threads: created_at,id chronological presentation. Initial latest page queries DESC then reverses
  for display; `before` retrieves older messages, `after` retrieves newer messages, until exhaustion.
  No historical page ceiling. created_at and identity are immutable. Parent thread bound into cursor.
- Audit/notifications/follow-ups/flags/restock/team/offers: created_at DESC,id DESC (queue scans use
  scheduled_at/run_at ASC,id ASC, service-only). Extras returns independent cursors for each child
  collection; billing returns a cursor for offers. No single cursor ambiguously paginates mixed lists.
- Insights uses inclusive WAT from/to with range validation. SSE uses recorded_at,id event cursor;
  invalidations contain only area/entityId/type, no encrypted payload or private content.

Current frontend `ListInput.offset`, `Page.total`, array-returning team/channel methods and the
aggregate extras DTO are **legacy mock/adapter contracts**. Backend cursor DTOs/adapter updates
must land together in B1 before wiring API mode; B0 deliberately does not pretend this mismatch
is already solved. Offset will be rejected by implemented backend list routes, not silently ignored.

## Error and idempotency rules

Normal endpoints use the existing envelope `{ok:false,error:{code,message,retryable}}` and safe
`X-Request-Id` response header. Never log SQL parameters, message bodies, tokens, phone numbers
or connection strings. SQLSTATEs map to safe errors, not raw database exceptions:

| HTTP | Error code | Meaning |
|---|---|---|
| 400 / 422 / 413 | VALIDATION | Input/cursor/key missing or invalid; bounds/constraints |
| 401 / 403 | FORBIDDEN | Missing/invalid identity, inactive membership or role |
| 404 | NOT_FOUND | Missing or inaccessible tenant resource, avoids enumeration |
| 409 | CONFLICT | Revision/decision/key-body mismatch or existing incompatible operation |
| 429 / 503 | UNAVAILABLE | Retryable throttling/dependency outage; Retry-After |
| 501 | NOT_IMPLEMENTED | Deferred provider capability or forbidden simulation |

Every normal POST/PATCH/PUT/DELETE requires Idempotency-Key (opaque 16–128 printable ASCII
characters, no PII). Reuse it for retries; new user intention gets a new key. Mutations execute
idempotency reservation, domain mutation, ledger/event/outbox job and replay-result persistence
in one transaction. See events-and-idempotency.md for conflict/replay/lease rules. Provider
webhooks use verified provider/account/event identity instead of a browser header.

## Every frontend function and required supporting operation

All status values are deliberate: **planned** means not implemented, **existing-foundation**
means the F0 route exists, **local-only** means it must not become a production simulator.

<!-- endpoints:start -->

| Function | FastAPI target | Auth/role | Idempotency | Pagination | Storage | Status / notes |
|---|---|---|---|---|---|---|
| CatalogueData.list | GET `/v1/catalogue` | owner manager agent | none | cursor | products,product_variants,product_photos | **planned**.  |
| CatalogueData.get | GET `/v1/catalogue/{id}` | owner manager agent | none | none | products,product_variants,product_photos | **planned**.  |
| ConversationsData.list | GET `/v1/conversations` | owner manager agent | none | cursor | conversations,conversation_reads | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ConversationsData.get | GET `/v1/conversations/{id}` | owner manager agent | none | none | conversations,conversation_reads | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| OrdersData.list | GET `/v1/orders` | owner manager agent | none | cursor | orders,order_items,order_timeline | **planned**.  |
| OrdersData.get | GET `/v1/orders/{id}` | owner manager agent | none | none | orders,order_items,order_timeline | **planned**.  |
| ReceiptsData.list | GET `/v1/receipts` | owner manager agent | none | cursor | receipts | **planned**.  |
| ReceiptsData.get | GET `/v1/receipts/{id}` | owner manager agent | none | none | receipts | **planned**.  |
| CustomersData.list | GET `/v1/customers` | owner manager agent | none | cursor | customers | **planned**.  |
| CustomersData.get | GET `/v1/customers/{id}` | owner manager agent | none | none | customers | **planned**.  |
| CatalogueData.extract | POST `/v1/catalogue/extractions` | owner manager | required | none | catalogue_drafts,product_photos | **planned**. Store private media references; provider integration deferred. |
| CatalogueData.createMany | POST `/v1/catalogue/batches` | owner manager | required | none | products,product_variants,product_photos | **planned**. Atomic batch; requestId also unique business request; reserve one idempotency key for whole batch. |
| CatalogueData.update | PATCH `/v1/catalogue/{id}` | owner manager | required | none | products,product_variants,product_photos | **planned**. expectedRevision required; existing stock changes also append stock_movements. |
| CatalogueData.archive | PATCH `/v1/catalogue/{id}/archive` | owner manager | required | none | products | **planned**. expectedRevision required; no historical deletion. |
| CatalogueData.proposeText | POST `/v1/catalogue/text-proposals` | owner manager | required | none | typed_proposals | **planned**. Proposal only, no stock change. |
| CatalogueData.confirmText | POST `/v1/catalogue/text-proposals/{proposalId}/confirm` | owner manager | required | none | typed_proposals,products,product_variants,stock_movements | **planned**. Lock proposal and inventory; confirm only once; conflict stale facts. |
| ConversationsData.markRead | POST `/v1/conversations/{id}/read` | owner manager agent | required | none | conversation_reads | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ConversationsData.setHumanMode | PATCH `/v1/conversations/{id}/human-mode` | owner manager agent | required | none | conversations,domain_events | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| MessagesData.send | POST `/v1/messages` | owner manager agent | required | none | messages,message_deliveries,jobs | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ApprovalsData.decide | POST `/v1/approvals/{id}/decision` | owner manager agent | required | none | approvals,messages,message_deliveries,jobs | **implemented-local**. B3 once-only decisions; stale snapshot refresh and verifier required, including at send. |
| OrdersData.setStatus | PATCH `/v1/orders/{id}/status` | owner manager agent | required | none | orders,order_timeline,messages,jobs | **planned**. expectedRevision; no generic transition into paid; agent assigned/unassigned conversation scope. |
| OrdersData.confirmPayment | POST `/v1/orders/{id}/payment` | owner manager | required | none | orders,payments,stock_movements,domain_events | **planned**. Vendor source only; expectedRevision; bank acknowledgement validated; no screenshot path; transactional ledger/stock. |
| ReceiptsData.issue | POST `/v1/receipts` | owner manager | required | none | receipts,receipt_shares | **planned**. Vendor lock and per-order uniqueness; guarded SQL RPC; freeze snapshot; no edit/delete. |
| CustomersData.update | PATCH `/v1/customers/{id}` | owner manager agent | required | none | customers | **planned**. Allowlisted notes/tags/flagged; metadata flag does not block provider. |
| ChannelsData.begin | POST `/v1/channels/connections` | owner manager | required | none | channel_attempts,channel_accounts | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ChannelsData.complete | POST `/v1/channels/connections/{attemptId}/complete` | owner manager | required | none | channel_attempts,channel_tokens,channel_accounts | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ChannelsData.newHelperCode | POST `/v1/channels/whatsapp/helper/codes` | owner manager | required | none | helper_links | **planned**. Generate code once; store HMAC only; encrypted replay response; 10min and rate limits. |
| ChannelsData.confirmHelper | POST `/v1/channels/whatsapp/helper/codes/{id}/confirm` | none | required | none | helper_links | **planned**. Frontend mock-only confirmation. Production browser route returns NOT_IMPLEMENTED; provider receipt must verify via separate signed webhook. |
| SettingsData.update | PATCH `/v1/settings` | owner manager; agent own preferences only | required | none | vendors,business_settings,business_hours,delivery_fees,member_preferences | **planned**. Field authorization: owner business identity/type/tone/negotiation; owner+manager reply lanes/hours/fees; everyone own preferences. Split transaction permissions; never blanket service authorization. |
| TeamData.invite | POST `/v1/team/invitations` | owner | required | none | team_invitations,invitation_secrets,jobs | **planned**. Lowercase email; pending uniqueness; role manager/agent only; external email not implemented. |
| TeamData.setRole | PATCH `/v1/team/{id}/role` | owner | required | none | vendor_members | **planned**. Protect owner; manager/agent only; target same vendor; lock membership. |
| TeamData.assign | PATCH `/v1/conversations/{conversationId}/assignment` | owner manager | required | none | conversations | **planned**. Active same-vendor member or null only. |
| BillingData.selectOffer | PATCH `/v1/billing/selection` | owner | required | none | billing_selections,billing_offers | **planned**. Selection only. Never charge or grant entitlement. |
| ExtrasData.configure | PATCH `/v1/extras/followups/settings` | owner manager | required | none | followup_settings,followups | **planned**. 24–720 hours; reschedule pending only; consent/opt-out required before future delivery. |
| ExtrasData.followup | PATCH `/v1/extras/followups/{id}` | owner manager agent | required | none | followups | **planned**. Cancel only in production; simulate_send NOT_IMPLEMENTED; real due sends are jobs. |
| ExtrasData.moderate | PATCH `/v1/extras/flags/{id}` | owner manager agent | required | none | moderation_flags,blocked_identities,jobs | **planned**. Agent assigned/unassigned related chat; block intent not provider-confirmed until job completes. |
| ExtrasData.notifyRestock | POST `/v1/extras/restock/{id}` | none | required | none | restock_requests,jobs | **planned**. Mock-only simulator at present; production browser route NOT_IMPLEMENTED, real alert delivery through consent-checked job. |
| MessagesData.list | GET `/v1/messages` | owner manager agent | none | cursor-bidirectional | messages | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ApprovalsData.list | GET `/v1/approvals` | owner manager agent | none | cursor | approvals | **implemented-local**. B3 once-only decisions; stale snapshot refresh and verifier required, including at send. |
| ChannelsData.list | GET `/v1/channels` | owner manager agent | none | cursor | channel_accounts | **implemented-local**. B2 opt-in; Gmail only. See gmail-pipeline.md for limits and pending live acceptance. |
| ChannelsData.helper | GET `/v1/channels/whatsapp/helper` | owner manager | none | none | helper_links | **planned**. Sensitive helper hashes/tokens are never serialized. |
| SettingsData.get | GET `/v1/settings` | owner manager agent | none | none | vendors,business_settings,business_hours,delivery_fees,member_preferences | **planned**.  |
| InsightsData.get | GET `/v1/insights` | owner manager | none | date-range | domain_events,orders,payments,stock_movements | **planned**.  |
| TeamData.list | GET `/v1/team` | owner manager agent | none | cursor | vendor_members,team_invitations | **planned**.  |
| TeamData.audit | GET `/v1/team/audit` | owner manager | none | cursor | audit_log | **planned**.  |
| BillingData.get | GET `/v1/billing` | owner | none | cursor-offers | billing_accounts,billing_offers,billing_selections,usage_meters,usage_entries | **planned**.  |
| ExtrasData.get | GET `/v1/extras` | owner manager agent | none | independent-cursors | followup_settings,followups,moderation_flags,restock_requests | **planned**.  |
| RealtimeData.subscribe | GET `/v1/events` | owner manager agent | none | event-cursor | domain_events | **planned**. SSE reconnect via Last-Event-ID; safe invalidation DTO, no raw messages/secret rows. Local listener/unsubscribe are not JSON routes. |
| MockControls.simulateIncoming | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.simulateInviteAccepted | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.simulatePaymentScreenshot | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.failNext | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| DataClient.dispose | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| Infrastructure.health | GET `/health` | public | none | none | — | **existing-foundation**. Existing liveness; outside /v1 prefix. |
| Infrastructure.me | GET `/v1/me` | authenticated | none | none | auth.users | **existing-foundation**. Existing Supabase token validation. |
| Infrastructure.vendors | GET `/v1/vendors` | authenticated | none | none | vendors | **existing-foundation**. Existing RLS-scoped endpoint; cursor migration pending. |
| Future.orders.create | POST `/v1/orders` | owner manager agent | required | none | orders,order_items,stock_reservations | **planned**. Not a new B0 feature; future creation API needed for orders produced by chat. |
| Future.stock.restock | POST `/v1/catalogue/{id}/restock` | owner manager | required | none | products,product_variants,stock_movements | **planned**. expectedRevision, explicit quantity and variant, transaction + ledger. |
| Future.reservations.create | POST `/v1/orders/{id}/reservations` | owner manager service | required | none | stock_reservations | **planned**. Lock inventory; expiry/release/commit must be transactional. |
| Future.notifications.list | GET `/v1/notifications` | owner manager agent | none | cursor | notifications | **planned**. Own membership only; no cross-user alert history. |
| Future.notifications.read | PATCH `/v1/notifications/{id}` | owner manager agent | required | none | notifications | **planned**. Own read_at only. |
| Future.identities.link | POST `/v1/customers/{id}/identities` | owner manager | required | none | customer_identities | **planned**. Explicit verified merge/link; no silent cross-channel identity inference. |
| Future.invitations.accept | POST `/v1/team/invitations/accept` | authenticated invited identity | required | none | team_invitations,invitation_secrets,vendor_members | **planned**. Validate token hash, verified email, expiry; scoped service after invitation resolved. |
| Future.receiptShare | GET `/v1/receipt-shares/{token}` | expiring capability | none | none | receipt_shares,receipts | **planned**. Hash token, minimal immutable DTO, no customer contact fields. |
| Future.webhook | POST `/v1/webhooks/{provider}` | verified provider signature | required | none | webhook_events,jobs | **planned**. Resolve vendor from verified account/reference, never arbitrary X-Vendor-Id. Dedup provider event; fast durable ACK. Provider exception to header idempotency. |
| Future.worker.claim | INTERNAL `—` | service | none | cursor-due | jobs | **planned**. No public route. Per-vendor transaction, SKIP LOCKED lease, retries and dead-letter state. |
| Future.oauth.callback | GET `/v1/channels/oauth/{provider}/callback` | verified expiring OAuth state | none | none | channel_attempts,channel_tokens | **planned**. No implicit trusted query param; resolve attempt/state before tenant transaction. |
| MessagesData.retry | POST `/v1/messages/{id}/retry` | owner manager agent (thread scoped) | required | none | messages,jobs,message_deliveries | **implemented-local**. State-conditional retry; ambiguous sends reconcile only. Live Gmail acceptance pending. |
| SettingsData.getReplyPolicy | GET `/v1/settings/reply-engine` | owner manager agent | none | none | business_settings,vendors | **implemented-local**. B3 safe intent allowlist; no approve-everything option. Activation is prospective only. |
| SettingsData.updateReplyPolicy | PATCH `/v1/settings/reply-engine` | owner manager | required | none | business_settings,vendors | **implemented-local**. B3 safe intent allowlist; no approve-everything option. Activation is prospective only. |

<!-- endpoints:end -->

## Implementation sequence after B0

1. **B1:** hosted schema/RLS smoke check, API auth/tenant transaction helper, cursor DTO + adapter
   reconciliation, error mapping and transactional idempotency wrapper; read-only vertical slice.
2. **B2:** catalogue/storage/customer persistence, optimistic revisions, stock ledger/reservations,
   consent and identity authorization. No real AI guesses before verified fact storage.
3. **B3:** one provider (WhatsApp first), verified encrypted webhook store/outbox/jobs, retries,
   takeover, approvals and delivery reconciliation. Connect fact-verified AI only after safety tests.
4. **B4:** order/payment ledger, Paystack verification, sequential snapshots and secure sharing.
5. **B5:** invitations, billing/usage enforcement, durable follow-ups/restock/notifications and
   event-based funnel analytics. Provider consent/windows and retention jobs precede automatic sends.

## Deployment / hosted verification

Apply numbered migrations once in filename order, as the migration owner; do not rerun old files.
Back up first. Blank Supabase has its own auth schema/roles; never apply tests/bootstrap.sql there.
F0-to-B0 migration backfills defaults, snapshots item names and translates order states while
preserving existing issued receipt snapshots. Invalid existing cross-parent data causes an atomic
failure; repair it explicitly, never silently discard it. Historical paid timestamps have only an
F0 creation-date fallback; do not fabricate past funnel transitions/events.

The hosted runner uses the actual project auth.uid()/roles, creates random rollback-only fixtures,
executes all 768 role/operation checks and cross-tenant probes, and rolls back. It does **not**
persist migrations or seed production data. For an F0/blank project it temporarily applies the
missing chain inside that same rollback transaction; an already-B0 project is tested as deployed.
Request the direct/session connection string only after local checks are ready. Supply it via the
secret environment `SUPABASE_TEST_DATABASE_URL` (not committed files or logs). Transaction-mode
poolers are unsupported. This environment restricts outbound hosts; hosted access may require an
authorized environment with Supabase connectivity. Do not mark the hosted check passed until run.
