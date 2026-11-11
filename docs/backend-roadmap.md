# Backend route index and remaining work

**Current status authority:** [status matrix](status-matrix.md). This document is a
route/contract index, not another completion checklist. See [B1 gap audit](backend/b1-gap-audit.md)
for S1 and [actual route audit](backend/route-audit.md) for every declared HTTP route.
The older B0 implementation sequence has been superseded by S0 inventory → S1 B1
completion → S2 wording-only Gemini. Neither S1 nor S2 has been implemented by S0.

## What the index proves

`backend/endpoints.json` is reconciled against Python route declarations. A route
marked implemented-local exists; it does not prove DTO compatibility, full role
coverage, idempotency, live delivery or release approval. Planned paths without
handlers are explicitly not-implemented. Partial flags indicate restricted scope.
The application routers are mounted in `api/app/main.py`.

API mode is conditional; mock remains the default. Next's same-origin `/api/v1/*`
proxy exists. General catalogue and settings targets are largely absent; the
separate reply-policy settings and simple typed-edit endpoints do not fill them.

## Authorization, pagination and idempotency: actual versus target

- Normal tenant APIs resolve bearer identity and active membership through scoped
  transactions. RLS and API field/role authorization are complementary.
- List handling is not universally reconciled: messages/inbox use signed cursors,
  customers/notifications/audit use offsets, extras caps each section at 100 and
  some lists return arrays. See route handlers, not a universal cursor promise.
- There is no universal idempotency middleware for every mutation. Message sends
  have a durable header/body binding; approval, payment and helper actions also use
  domain-specific uniqueness/conditional transitions. S1 must test every new action
  for replay and mismatched body conflicts. The index's `required` idempotency column
  is the contract requirement, NOT proof that all handlers enforce the header.
- Errors are sanitized in main.py, including validation input redaction. Do not
  assume a universal X-Request-Id implementation; no such proof was found.
- Provider requests already in flight cannot be recalled by takeover or kill switch.

## Frontend contract and supporting operations

<!-- endpoints:start -->

| Function | FastAPI target | Auth/role | Idempotency | Pagination | Storage | Status / notes |
|---|---|---|---|---|---|---|
| CatalogueData.list | GET `/v1/catalogue` | owner manager agent | none | cursor | products,product_variants,product_photos | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| CatalogueData.get | GET `/v1/catalogue/{id}` | owner manager agent | none | none | products,product_variants,product_photos | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| ConversationsData.list | GET `/v1/conversations` | owner manager agent | none | cursor | conversations,conversation_reads | **implemented-local**. S0 route proof: api/app/pipeline/api.py::conversations. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ConversationsData.get | GET `/v1/conversations/{id}` | owner manager agent | none | none | conversations,conversation_reads | **implemented-local**. S0 route proof: api/app/pipeline/api.py::get_conversation. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.list | GET `/v1/orders` | owner manager agent | none | cursor | orders,order_items,order_timeline | **implemented-local**. S0 route proof: api/app/commerce/api.py::list_orders. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.get | GET `/v1/orders/{id}` | owner manager agent | none | none | orders,order_items,order_timeline | **implemented-local**. S0 route proof: api/app/commerce/api.py::get_order. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ReceiptsData.list | GET `/v1/receipts` | owner manager agent | none | cursor | receipts | **implemented-local**. S0 route proof: api/app/commerce/api.py::list_receipts. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ReceiptsData.get | GET `/v1/receipts/{id}` | owner manager agent | none | none | receipts | **implemented-local**. S0 route proof: api/app/commerce/api.py::get_receipt. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| CustomersData.list | GET `/v1/customers` | owner manager agent | none | offset; limit 1–100 | customers | **implemented-local**. S0 route proof: api/app/extras/api.py::customers. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| CustomersData.get | GET `/v1/customers/{id}` | owner manager agent | none | none | customers | **implemented-local**. S0 route proof: api/app/extras/api.py::get_customer. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| CatalogueData.extract | POST `/v1/catalogue/extractions` | owner manager | required | none | catalogue_drafts,product_photos | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| CatalogueData.createMany | POST `/v1/catalogue/batches` | owner manager | required | none | products,product_variants,product_photos | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| CatalogueData.update | PATCH `/v1/catalogue/{id}` | owner manager | required | none | products,product_variants,product_photos | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| CatalogueData.archive | PATCH `/v1/catalogue/{id}/archive` | owner manager | required | none | products | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| CatalogueData.proposeText | POST `/v1/catalogue/text-proposals` | owner manager | required | none | typed_proposals | **partial**. S0 route proof: api/app/whatsapp/api.py::proposal. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. Restricted regex commands, not general catalogue editing; variant confirmations unsupported. |
| CatalogueData.confirmText | POST `/v1/catalogue/text-proposals/{proposalId}/confirm` | owner manager | required | none | typed_proposals,products,product_variants,stock_movements | **partial**. S0 route proof: api/app/whatsapp/api.py::confirm_instruction. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. Simple non-variant price/stock only; variant edits fail closed. |
| ConversationsData.markRead | POST `/v1/conversations/{id}/read` | owner manager agent | required | none | conversation_reads | **implemented-local**. S0 route proof: api/app/pipeline/api.py::mark_read. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ConversationsData.setHumanMode | PATCH `/v1/conversations/{id}/human-mode` | owner manager agent | required | none | conversations,domain_events | **implemented-local**. S0 route proof: api/app/pipeline/api.py::takeover. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| MessagesData.send | POST `/v1/messages` | owner manager agent | required | none | messages,message_deliveries,jobs | **implemented-local**. S0 route proof: api/app/pipeline/api.py::send. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ApprovalsData.decide | POST `/v1/approvals/{id}/decision` | owner manager agent | required | none | approvals,messages,message_deliveries,jobs | **implemented-local**. S0 route proof: api/app/replies/api.py::decision. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.setStatus | PATCH `/v1/orders/{id}/status` | owner manager agent | required | none | orders,order_timeline,messages,jobs | **implemented-local**. S0 route proof: api/app/commerce/api.py::set_status. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.confirmPayment | POST `/v1/orders/{id}/payment` | owner manager | required | none | orders,payments,stock_movements,domain_events | **implemented-local**. S0 route proof: api/app/commerce/api.py::bank_payment. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ReceiptsData.issue | POST `/v1/receipts` | owner manager | required | none | receipts,receipt_shares | **implemented-local**. S0 route proof: api/app/commerce/api.py::issue. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| CustomersData.update | PATCH `/v1/customers/{id}` | owner manager agent | required | none | customers | **implemented-local**. S0 route proof: api/app/extras/api.py::notes. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.begin | POST `/v1/channels/connections` | owner manager | required | none | channel_attempts,channel_accounts | **partial**. S0 route proof: api/app/pipeline/api.py::connect. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. Only Gmail/WhatsApp supported; others return 501. |
| ChannelsData.complete | POST `/v1/channels/connections/{attemptId}/complete` | owner manager | required | none | channel_attempts,channel_tokens,channel_accounts | **implemented-local**. S0 route proof: api/app/pipeline/api.py::connection_status. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.newHelperCode | POST `/v1/channels/whatsapp/helper/codes` | owner manager | required | none | helper_links | **implemented-local**. S0 route proof: api/app/whatsapp/api.py::new_code. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.confirmHelper | — `—` | none | required | none | helper_links | **local-only**. Mock simulation only. API mode checks helper() and cannot confirm a code in the browser. |
| SettingsData.update | PATCH `/v1/settings` | owner manager; agent own preferences only | required | none | vendors,business_settings,business_hours,delivery_fees,member_preferences | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| TeamData.invite | POST `/v1/team/invitations` | owner | required | none | team_invitations,invitation_secrets,jobs | **implemented-local**. S0 route proof: api/app/extras/api.py::invite. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| TeamData.setRole | PATCH `/v1/team/{id}/role` | owner | required | none | vendor_members | **implemented-local**. S0 route proof: api/app/extras/api.py::role. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| TeamData.assign | PATCH `/v1/conversations/{conversationId}/assignment` | owner manager | required | none | conversations | **implemented-local**. S0 route proof: api/app/extras/api.py::assign. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| BillingData.selectOffer | PATCH `/v1/billing/selection` | owner | required | none | billing_selections,billing_offers | **implemented-local**. S0 route proof: api/app/billing/api.py::select. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ExtrasData.configure | PATCH `/v1/extras/followups/settings` | owner manager | required | none | followup_settings,followups | **implemented-local**. S0 route proof: api/app/extras/api.py::configure. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ExtrasData.followup | PATCH `/v1/extras/followups/{id}` | owner manager agent | required | none | followups | **implemented-local**. S0 route proof: api/app/extras/api.py::cancel. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. Cancel only; simulate_send is not accepted by real API. |
| ExtrasData.moderate | PATCH `/v1/extras/flags/{id}` | owner manager agent | required | none | moderation_flags,blocked_identities,jobs | **implemented-local**. S0 route proof: api/app/extras/api.py::moderate. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ExtrasData.notifyRestock | POST `/v1/extras/restock/{id}` | none | required | none | restock_requests,jobs | **implemented-local**. S0 route proof: api/app/extras/api.py::notify_restock. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| MessagesData.list | GET `/v1/messages` | owner manager agent | none | cursor-bidirectional | messages | **implemented-local**. S0 route proof: api/app/pipeline/api.py::messages. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ApprovalsData.list | GET `/v1/approvals` | owner manager agent | none | cursor | approvals | **implemented-local**. S0 route proof: api/app/replies/api.py::approvals. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.list | GET `/v1/channels` | owner manager agent | none | cursor | channel_accounts | **implemented-local**. S0 route proof: api/app/pipeline/api.py::channels. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.helper | GET `/v1/channels/whatsapp/helper` | owner manager | none | none | helper_links | **implemented-local**. S0 route proof: api/app/whatsapp/api.py::helper. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| SettingsData.get | GET `/v1/settings` | owner manager agent | none | none | vendors,business_settings,business_hours,delivery_fees,member_preferences | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| InsightsData.get | GET `/v1/insights` | owner manager | none | date-range | domain_events,orders,payments,stock_movements | **implemented-local**. S0 route proof: api/app/billing/insights.py::insights. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| TeamData.list | GET `/v1/team` | owner manager | none | none | vendor_members,team_invitations | **implemented-local**. S0 route proof: api/app/extras/api.py::team. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| TeamData.audit | GET `/v1/team/audit` | owner manager | none | offset | audit_log | **implemented-local**. S0 route proof: api/app/extras/api.py::audit_log. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| BillingData.get | GET `/v1/billing` | owner | none | none | billing_accounts,billing_offers,billing_selections,usage_meters,usage_entries | **implemented-local**. S0 route proof: api/app/billing/api.py::billing. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ExtrasData.get | GET `/v1/extras` | owner manager | none | bounded first 100 per section | followup_settings,followups,moderation_flags,restock_requests | **implemented-local**. S0 route proof: api/app/extras/api.py::extras. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| RealtimeData.subscribe | GET `/v1/events` | owner manager agent | none | event-cursor | domain_events | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| MockControls.simulateIncoming | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.simulateInviteAccepted | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.simulatePaymentScreenshot | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| MockControls.failNext | LOCAL `—` | — | none | none | — | **local-only**. Local lifecycle / mock-only; never deploy a simulation endpoint. |
| DataClient.dispose | LOCAL `—` | — | none | none | — | **local-only**. Client lifecycle, not HTTP: web/lib/data/api.ts. Supabase realtime invalidation is configured conditionally; hosted delivery unproven. |
| Infrastructure.health | GET `/health` | public | none | none | — | **implemented-local**. S0 route proof: api/app/main.py::health. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Infrastructure.me | GET `/v1/me` | authenticated | none | none | auth.users | **implemented-local**. S0 route proof: api/app/main.py::me. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Infrastructure.vendors | GET `/v1/vendors` | authenticated | none | none | vendors | **implemented-local**. S0 route proof: api/app/main.py::vendors. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Future.orders.create | INTERNAL `—` | owner manager agent | required | none | orders,order_items,stock_reservations | **internal-only**. Chat creates drafts via api/app/commerce/chat.py. No vendor order-creation HTTP form/route; do not implement the obsolete proposed POST /orders. |
| Future.stock.restock | POST `/v1/catalogue/{id}/restock` | owner manager | required | none | products,product_variants,stock_movements | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| Future.reservations.create | INTERNAL `—` | owner manager service | required | none | stock_reservations | **internal-only**. Reservation lifecycle is internal to commerce/domain.py. No public reservation-creation route. |
| Future.notifications.list | GET `/v1/notifications` | owner manager agent | none | offset | notifications | **implemented-local**. S0 route proof: api/app/extras/api.py::notifications. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Future.notifications.read | PATCH `/v1/notifications/{id}` | owner manager agent | required | none | notifications | **implemented-local**. S0 route proof: api/app/extras/api.py::read_notification. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Future.identities.link | POST `/v1/customers/{id}/identities` | owner manager | required | none | customer_identities | **not-implemented**. S0: no matching registered FastAPI route. Adapter targets/schema/sample tests do not implement this endpoint. See docs/backend/b1-gap-audit.md. |
| Future.invitations.accept | POST `/v1/team/invitations/accept` | authenticated invited identity | required | none | team_invitations,invitation_secrets,vendor_members | **implemented-local**. S0 route proof: api/app/extras/api.py::accept. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| Future.receiptShare | POST `/v1/public/receipts` | expiring capability | none | none | receipt_shares,receipts | **implemented-local**. S0 route proof: api/app/commerce/api.py::public_receipt. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. Read-only POST capability lookup: no mutation/idempotency key; token is kept out of URLs. |
| Future.webhook | POST `/v1/webhooks/{provider}` | verified provider signature | required | none | webhook_events,jobs | **partial**. Only explicit /webhooks/gmail, /webhooks/whatsapp and /webhooks/paystack routes exist. No generic provider handler or Instagram/Facebook/TikTok adapter. |
| Future.worker.claim | INTERNAL `—` | service | none | cursor-due | jobs | **implemented-local**. Internal only: pipeline/jobs.py claim and worker.py tick. Native lease/crash tests in tests/helpers/b2-runtime.py; no live deployment proof. |
| Future.oauth.callback | GET `/v1/channels/oauth/gmail/callback` | verified expiring OAuth state | none | none | channel_attempts,channel_tokens | **implemented-local**. S0 route proof: api/app/pipeline/api.py::callback. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| MessagesData.retry | POST `/v1/messages/{id}/retry` | owner manager agent (thread scoped) | required | none | messages,jobs,message_deliveries | **implemented-local**. S0 route proof: api/app/pipeline/api.py::retry. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| SettingsData.getReplyPolicy | GET `/v1/settings/reply-engine` | owner manager agent | none | none | business_settings,vendors | **implemented-local**. S0 route proof: api/app/replies/api.py::get_settings. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| SettingsData.updateReplyPolicy | PATCH `/v1/settings/reply-engine` | owner manager | required | none | business_settings,vendors | **implemented-local**. S0 route proof: api/app/replies/api.py::settings. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.requestCheckout | POST `/v1/orders/{id}/checkout` | owner manager | required | none | orders,jobs | **implemented-local**. S0 route proof: api/app/commerce/api.py::checkout. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| OrdersData.cancellationActions | POST `/v1/orders/{id}/cancellation-actions` | owner manager | required | none | orders,stock_movements,audit_log,jobs | **implemented-local**. S0 route proof: api/app/commerce/api.py::cancellation. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ReceiptsData.share | POST `/v1/receipts/{id}/share` | owner manager | required | none | receipts,receipt_shares | **implemented-local**. S0 route proof: api/app/commerce/api.py::share_receipt. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ReceiptsData.revoke | POST `/v1/receipts/{id}/revoke` | owner manager | required | none | receipt_shares,audit_log | **implemented-local**. S0 route proof: api/app/commerce/api.py::revoke. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| ChannelsData.completeWhatsApp | POST `/v1/channels/whatsapp/signup/{attempt}/complete` | owner manager | required | none | channel_accounts,channel_attempts,channel_tokens | **implemented-local**. S0 route proof: api/app/whatsapp/api.py::complete. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |
| BillingData.checkout | POST `/v1/billing/checkout` | owner | required | none | billing_checkouts,billing_offers | **implemented-local**. S0 route proof: api/app/billing/api.py::checkout. Route existence is NOT DTO, idempotency, frontend or live acceptance proof; see docs/status-matrix.md. |

<!-- endpoints:end -->

## Next phases and release gates

S1: private catalogue photos, real category-conditioned extraction, transactional
catalogue/variants/stock/archive and general settings/preferences; all screens use
real endpoints with tenant/role/replay/conflict tests. Preserve truthful labels.

S2: Gemini wording only, same fact authority/verifier/lanes/approval rules; safe
multilingual behavior, deterministic fallback, 200-message evaluation and vendor
cost evidence. Do not allow fallback to bypass send pauses.

No live-provider run or release approval is recorded. [Go-live checklist](operations/go-live-checklist.md)
remains NO-GO, including real signup → channel → paid order → receipt, physical
retention/deletion, alert destinations, hosted recovery and mobile acceptance.

## Schema deployment

Apply numbered migrations once in order with an authorized migration owner. Back
up first; never apply tests/bootstrap.sql to hosted systems. Existing volumes do
not rerun init scripts. Hosted rollback-only tests use securely exported
SUPABASE_TEST_DATABASE_URL; no hosted pass is implied by local fixture results.
