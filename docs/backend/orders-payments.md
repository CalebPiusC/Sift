# B4 — orders, payments and receipts

## Status

Implemented locally: all current OrdersData/ReceiptsData contract endpoints; seven-state
server lifecycle; customer-chat draft collection; Paystack checkout initialization and verified
webhook reconciliation; explicit bank-payment confirmation challenge; reservation/deduction;
explicit cancellation choices; immutable sequential receipts; signed/revocable hosted receipt
links and real PDF downloads; channel status notifications and post-payment instructions.

**Real Paystack test-mode acceptance is pending.** No Paystack/Gmail credentials or reachable
provider webhook deployment were supplied. Integration tests use actual PostgreSQL and Redis,
and replace only Gmail/Paystack calls with explicit test doubles. Do not describe this as a real
Paystack checkout having been paid. The existing B2/B3 live Gmail and hosted Supabase checks
also remain pending.

## Files / deployment

- `commerce/domain.py`: graph, locks, reservation, stock/payment transaction, receipt issuance,
  timeline and explicit restock.
- `commerce/chat.py`: conservative product/quantity/address collection; no vendor creation form.
- `commerce/paystack.py`: checkout/verification/refund boundary, exact signature checking and
  encrypted ingress reconciliation.
- `commerce/receipts.py`: immutable DTO mapping, encrypted cached capabilities, signature,
  expiry and revocation checks.
- `commerce/messages.py`: durable channel notices, order-specific fact lookup and final verifier.
- `commerce/api.py`: tenant/role-authorized contract endpoints and provider/public-capability routes.
- Migration007 extends the existing48 tables. Apply migrations001–007 with a migration owner;
  do not reset real volumes. Compose initializes007 only for **new** volumes. The runtime rejects
  databases lacking its required commerce message column.

Use the API/worker/web startup steps in [gmail-pipeline.md](gmail-pipeline.md). In api/.env set
server-only `PAYSTACK_SECRET_KEY` (staging: your real **test** key) and `PUBLIC_WEB_URL` to the
public HTTPS web origin. Keep keyring/identity pepper stable; do not expose merchant secrets in
NEXT_PUBLIC variables, logs, source or chat. Configure Paystack dashboard webhooks to your
public HTTPS `/v1/webhooks/paystack` (or web-proxied `/api/v1/webhooks/paystack`). Do not log raw
bodies, authorization/signature headers, callback queries, addresses or phone numbers. API
responses are private/no-store. Receipt capabilities are in URL fragments, never server URLs,
and are sent in POST bodies for resolution.

This increment uses one configured merchant key. Per-vendor Paystack subaccounts/settlement,
other currencies, split payments and partial payments/refunds are not implemented. OnlyNGN
kobo orders are supported. A redirect/callback, customer message, SMS or screenshot is never
payment evidence.

## Chat flow and safe limitations

Enable the vendor's B3 reply engine. Examples:
1. Customer: “I want to buy Order sandal please”. The engine saves an unpaid draft from current
   `get_product_facts` output and asks for quantity/address; no vendor order form exists.
2. Customer: “2 units please; address:12 Allen Avenue, Lagos”. An unambiguous configured city
   delivery fee and explicit quantity complete the draft.
3. Customer: “confirm order”. The server rechecks catalogue prices and the configured fee,
   reserves tracked stock for30minutes, moves to awaiting_payment and schedules checkout.
4. Customer pays through the real hosted Paystack URL. A signed event is durably queued; the
   worker independently verifies it with Paystack and compares status/reference/amount/currency.
5. The atomic payment transaction deducts stock once, inserts the payment fact, marks paid,
   issues the receipt and schedules the channel notice.
6. The paid notice asks for additional instructions, without inventing a delivery promise.
   Customer “Instructions:leave with reception” is stored and acknowledged. Vendor state taps
   drive actual preparation/delivery timeline updates; order-status answers remain fact-backed.

Current collector is deliberately narrow: one unambiguous standard-product SKU per draft,
explicit quantity below10, named variant when variants exist, recognized address wording and a
configured city fee. Unknown/multi-product/bulk/custom/service/made-to-order requests go to B3
review, not invented fulfilment. Changes that make a draft ambiguous are not silently guessed.
Draft totals are provisional until required chat slots are complete; the UI displays DETAILS_REQUIRED.
No automatic repricing occurs after awaiting_payment. Paid delivery/address changes beyond
additional instructions require vendor review. This is not a general free-form order parser.

## Lifecycle / idempotency

`draft → awaiting_payment → paid → preparing → out_for_delivery → delivered`;
cancellation is allowed from draft/awaiting_payment/paid/preparing, not delivered or out_for_delivery.
Only verified-payment code can enter paid, never the ordinary status endpoint. Inserts start as
unpaid drafts. SQL guards reject invalid transitions, new lines after draft, financial changes
after draft and mutation of existing payment facts. Legacy direct browser confirm-payment and
issue-receipt RPC execution is revoked by007; use the authorized APIs.

Order mutations lock conversation → vendor commerce advisory lock → order, then product/variant
rows in stable order. Same-target status retries return the current order without duplicate work;
different transitions require the current expectedRevision. Payment retries return the paid fact;
webhook and reference identities, sale/restock dedupe keys, receipt/order uniqueness and durable
jobs prevent duplicate effects. Lists/get enforce tenant scope and agent assignment restrictions;
financial mutations and receipt access require active owner/manager membership.

## Payment / stock rules

- Bank transfer UI keeps the review, full-amount checkbox and confirm button. The API obtains a
  signed user/vendor/order/revision/total-bound challenge and requires an explicit confirmed flag.
  A token from a different order/user, stale revision or expired challenge cannot mark paid.
  Bank refunds remain manual external bank actions; a recorded refund request is not completion.
- HMAC-SHA512 checks **exact raw bytes** with constant-time comparison. Signed raw events are
  encrypted and committed with deduplicated jobs before202. Unknown references are acknowledged
  without exposing tenant data. The worker additionally calls Paystack's authenticated transaction
  verification endpoint; both event and verified response must reconcile to the order.
- Tracked reservations subtract other active, unexpired holds; expiry does not deduct stock.
  A database scheduler job releases holds after30minutes even after worker/Redis restarts.
  Expired checkout links are not resent. Expired awaiting orders must be cancelled/recreated
  for a fresh checkout rather than silently extending or repricing the old one.
- Payment locks parent/variant, commits its own holds, excludes other active holds and deducts
  the exact quantity in one transaction. Insufficient stock rolls back the entire payment-stock
  mutation. The last-item race never makes stock negative or deducts twice.
- Valid captured payments arriving after cancellation/stock loss are held as visible
  LATE_PAYMENT_REVIEW / STOCK_OR_ORDER_REVIEW exceptions, not silently fulfilled or restocked.
  They require operator reconciliation against Paystack (including explicit refund where needed).
  The raw signed event is retained; this increment does not ship an automated payment-exception
  resolution dashboard or misrepresent these exceptions as successfully allocated orders.
- Gateway initialize/refund POST ambiguity is **not** blindly replayed with a fresh reference.
  Checkout and refund uncertainty need provider reconciliation. Once-only refund requests store
  a provider refund reference and remain pending, not “refunded”; automated refund-completion
  webhook/reconciliation is follow-up work. Do not retry uncertain refunds manually without first
  checking the provider ledger.

Cancellation itself never calls a refund API or returns paid items to stock. Separate confirmed
vendor choices request a full refund and/or restock the previously deducted quantities. Each
choice is audit logged and idempotent. Receipts and original payment facts remain unchanged.

## Receipts and customer delivery

Issuance locks the vendor, uses the next per-vendor number and freezes line names, variant,
quantity, price, fees, customer/vendor names and payment source. Failed transactions roll back
number allocation; an order gets one receipt. UPDATE/DELETE remain prohibited. Incomplete legacy
snapshots are preserved but not reconstructed from today's mutable catalogue; they cannot be
presented as newly verified complete receipts.

The secure link is a signed capability with an independent random256-bit nonce, tenant/receipt
IDs and seven-day expiry. Only its hash plus an encrypted cache are stored. Every public lookup
checks signature/expiry and the tenant-scoped revocation row. Owners can revoke all existing
links and explicitly generate a fresh one. Revocation cannot recall content already downloaded
or an exported PDF. Public pages use no-store/no-referrer headers and reject unsigned sample
snapshots in API mode. Explicit DATA_MODE=mock still supports clearly labelled sample previews.

The public page receives only the authorized immutable snapshot, then uses the existing tested
PDF generator with the embedded naira-capable Inter font. Both private and public real receipt
views offer Download PDF, without sample labels. The PDF is a frozen export, not a cryptographic
PDF signature or an independently revocable file.

Status notices are durable queued/sending/sent/failed channel messages. Before Gmail POST the
worker rechecks takeover, current order status, owned order facts, payment evidence, link
capabilities and the verifier. Only DB-sourced checkout URLs or valid receipt capabilities are
allowed. Stale status/link notices are blocked rather than sent; newer status jobs produce the
current notice. Provider acceptance is labelled sent, not proven recipient delivery.

## HTTP surface (/v1)

- GET orders; GET orders/{id}; PATCH orders/{id}/status
- POST orders/{id}/payment-confirmation; POST orders/{id}/payment
- POST orders/{id}/checkout; POST orders/{id}/cancellation-actions
- POST webhooks/paystack (provider signature, no browser session required)
- GET receipts; GET receipts/{id}; POST receipts {orderId}
- POST receipts/{id}/share; POST receipts/{id}/revoke
- POST public/receipts {token} (signed capability, no user session)

## Tests / remaining real acceptance

`PATH="$PWD/.venv/bin:$PATH" npm run test:commerce` runs Python + native PostgreSQL/Redis.
The native harness exercises chat draft → simulated checkout → verified event → stock/receipt,
duplicate/mismatched signatures and amounts, once-only payments, revocation/tampering, forbidden
lifecycle jumps, repeated transitions, status delivery through the verifier, explicit refund
requests, no automatic restock, idempotent explicit restock, sequential immutable receipts,
concurrent last-variant-item payment and last-item reservation races, and scheduled expiry.
Existing B2 tests really SIGKILL/restart a worker child and recover durable leases.

Frontend tests cover the bank challenge/confirm sequence, no unchecked payment request,
public token-in-POST transport and rejection of unsigned samples in API mode. Existing PDF tests
build actual multi-page PDFs and inspect embedded font/metadata. Full regression:
`npm run test:all`, `npm run build` (includes120-case reply safety gate), Ruff, dependency audit.

To meet the requested done criterion: deploy the API/worker/Redis/Postgres/web with HTTPS and
real Paystack test credentials, authorize Gmail, seed genuine catalogue/fees, create an order
from email chat, complete a Paystack test payment, observe the verified paid notice and hosted
receipt/PDF, replay duplicate webhook bytes, and retain the passing race-test evidence. That
provider-backed acceptance has **not** happened here.
