# Selvora current frontend data contract — F0–F7

**Status:** exact current frontend declarations and legacy mock/adapter semantics. Business HTTP
endpoints are NOT implemented. B0 now supplies reconciled schema/security; the authoritative
[backend roadmap](backend-roadmap.md) supersedes the older HTTP table below for endpoint coverage,
auth/roles, signed cursor pagination, errors and Idempotency-Key rules. Current frontend offsets/
array DTOs are retained until B1 updates adapter and backend together. No new UI features in B0.

## Selecting the implementation

Set `DATA_MODE=mock` (default) or `DATA_MODE=api` in `web/.env.local` / the server environment. Restart the server after changing it. The dynamic server layout parses the enum; only the enum is sent to the client. No additional `NEXT_PUBLIC_` variable or client-side mode override exists. Invalid values fail closed with a configuration error.

`DataProvider` creates one isolated client/session. Mock mode opens the fictional Adire by Tola workspace, not a real authenticated account. Its sticky **Sample data** banner covers every screen, including loading/error states. API mode has no sample banner, no developer controls, no seed initialization on the API execution path and no fallback to mock on errors. The old development-only “Explore the workspace” flow is still separately production-gated; sample mode does not grant access to real data.

The frontend can be completed with the mock adapter. API mode retains Supabase authentication. Once the business is loaded it configures the client with the actual vendor ID. There are no working backend data endpoints/realtime transport in F1, so this adapter reports honest errors until connected.

## Common rules

- Import **all public interfaces/types** from `web/lib/data/index.ts`. The exact declarations below are generated from `types.ts` and `contract.ts`; `npm run docs:contract` updates them. A test prevents drift.
- All data operations return `Promise<Result<T>>`; `get` of a missing record returns `NOT_FOUND`, never `null`. `dispose()` returns `Promise<void>` and must be safe to call repeatedly. Event listeners/unsubscribe are callbacks, not remote operations.
- `ID` is an opaque string: mock IDs are descriptive, real IDs may be UUIDs. Every entity has `vendorId`; the server must authenticate membership and apply RLS rather than trust this field/header.
- `Kobo` is a safe, non-negative **integer**. Naira is formatting only: `2500000` → `₦25,000`. Dates are UTC ISO-8601 strings, except daily aggregation dates (`YYYY-MM-DD`). Nullable values are explicit `null`, not omitted. Unknown stock is `null`, zero is out of stock.
- `ListInput`: case-insensitive substring `search` (where specified), zero-based `offset` default 0 and `limit` default 50, integer range 1–100. `Page.total` is the count **after filtering, before pagination**. Filters combine with AND. Empty results are successful pages.
- Catalogue search matches name/category; conversation search matches customer name/last text; approval search matches customer text/reason; order search matches ID/customer/item names; receipt search matches number/customer/order ID; customer search matches name/city. Message lists do not support text search. Catalogue/approvals/customers/receipts preserve creation/seed order; orders sort `createdAt` descending; conversations sort `updatedAt` descending; messages sort `createdAt` ascending. Stable ties preserve insertion order.
- `Result` success: `{ok:true,data:T}`. Failure: `{ok:false,error:{code,message,retryable}}`. Errors are safe for display and never expose provider bodies, credentials, raw customer payloads or phone numbers in logs. Standard errors: `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `UNAVAILABLE`, `NOT_IMPLEMENTED`. Only transient `UNAVAILABLE` failures should offer automatic retry. Mutations retry only when idempotent.
- `useResource` wraps reads in `Resource<T>` (`loading`, `success`, `error`) and exposes manual `retry()`. It ignores stale/unmounted completions and invalidates on realtime events. UI mutation helper `useAction` exposes `busy`, `error` and async `run`. The adapters themselves never invent a loading result: loading belongs to the hook while a promise is pending.

## Legacy frontend-adapter HTTP mapping (incomplete; backend roadmap is authoritative)

All paths are relative to `/api/v1`. Every request has `Authorization: Bearer <Supabase access token>` and `X-Vendor-Id`; the server **must** verify tenant membership. Browser calls are same-origin; future deployment must proxy this prefix to FastAPI. Responses use the `Result<T>` envelope. The current API adapter handles offline/non-JSON/missing endpoints without returning samples.

| Interface.function | HTTP / input | Success data |
|---|---|---|
| CatalogueData.list | GET `/catalogue`, query `ListInput & {category?: Category, stock?: StockFilter, archived?: boolean}` | `Page<Product>` |
| CatalogueData.get | GET `/catalogue/:id` | `Product` |
| ConversationsData.list | GET `/conversations`, query `ListInput & {channel?, status?, stage?, needsMe?}` | `Page<Conversation>` |
| ConversationsData.get | GET `/conversations/:id` | `Conversation` |
| ConversationsData.markRead | POST `/conversations/:id/read`, `{}` | `Conversation` |
| ConversationsData.setHumanMode | PATCH `/conversations/:id/human-mode`, `{until: ISODate \| null}` | `Conversation` |
| MessagesData.list | GET `/messages`, query `ListInput & {conversationId, latest?}` | `Page<Message>` |
| MessagesData.send | POST `/messages`, `{conversationId, text}` | `Message` |
| ApprovalsData.list | GET `/approvals`, query `ListInput & {status?}` | `Page<Approval>` |
| ApprovalsData.decide | POST `/approvals/:id/decision`, `{action, editedReply?}` | `Approval` |
| OrdersData.list | GET `/orders`, query `ListInput & {status?}` | `Page<Order>` |
| OrdersData.get | GET `/orders/:id` | `Order` |
| OrdersData.setStatus | PATCH `/orders/:id/status`, `{status, expectedRevision}` | `Order` |
| OrdersData.confirmPayment | POST `/orders/:id/payment`, `{source: "vendor", expectedRevision}` | `Order` |
| ReceiptsData.list | GET `/receipts`, query `ListInput` | `Page<Receipt>` |
| ReceiptsData.get | GET `/receipts/:id` | `Receipt` |
| ReceiptsData.issue | POST `/receipts`, `{orderId}` | `Receipt` |
| CustomersData.list | GET `/customers`, query `ListInput` | `Page<Customer>` |
| CustomersData.get | GET `/customers/:id` | `Customer` |
| CustomersData.update | PATCH `/customers/:id`, `{notes, tags, flagged}` | `Customer` |
| ChannelsData.list | GET `/channels`, no input | `ChannelAccount[]` |
| SettingsData.get | GET `/settings`, no input | `BusinessSettings` |
| SettingsData.update | PATCH `/settings`, allowlisted partial settings (below) | `BusinessSettings` |
| InsightsData.get | GET `/insights`, no input | `Insights` |
| TeamData.list | GET `/team`, no input | `TeamMember[]` |
| TeamData.invite | POST `/team/invitations`, `{name, email, role: "manager" \| "agent"}` | `TeamMember` |
| BillingData.get | GET `/billing`, no input | `Billing` |
| RealtimeData.subscribe | Async client subscription; listener receives `DataEvent` | `Unsubscribe` callback (not JSON) |
| MockControls.simulateIncoming | **Mock only**, `{conversationId}` | Created customer `Message` |
| MockControls.simulatePaymentScreenshot | **Mock only**, `{orderId}`; unverified evidence only | `Order` |
| MockControls.failNext | **Mock only**, `area: DataEvent["area"]` | `null` |
| DataClient.dispose | Local async lifecycle, no input | `void` |

## Semantics and safety

- `messages.send` is a **vendor text reply**, trimmed length 1–4,000. No vendor voice-recording API exists. Customer voice messages have duration/transcript; sample audio URL is null, visibly marked unavailable. A real implementation may supply a short-lived authorised audio URL, never public private media.
- `markRead` sets unread to zero. `setHumanMode` takes a future expiry or null for Hand Back. Sample incoming greetings are added immediately; a canned **amount-free** AI greeting arrives ~1.2 seconds later only if the conversation is open and human mode is off/expired **when the delayed reply executes**. No Gemini call or real channel send happens. This simulator demonstrates UI events, not the future intent/fact-verification pipeline.
- `approvals.decide`: only pending cards may be acted on; `send` uses the proposed text, `edit` requires a 1–4,000 character `editedReply`, `reject` sends nothing. Send/edit create a vendor message and resolve the approval atomically in memory. Repeated decisions return `CONFLICT`. There is no bulk/approve-everything function. F1 shows cards read-only; interactive approval UI can use these methods in its frontend phase.
- Order states now match F4: `draft → awaiting_payment → paid → preparing → out_for_delivery → delivered`, with cancellation allowed before out-for-delivery. **Only payment confirmation enters Paid**; generic status updates cannot do so. Cancelled/delivered are terminal. See F4 semantics below for revision checks and messages.
- Only explicit `confirmPayment({source:"vendor", expectedRevision})` can confirm a bank transfer. Paystack seed/read data is trusted server-origin history, never a client confirmation choice. Screenshots cannot confirm payment. Unpaid drafts/cancelled orders cannot be confirmed. Already-paid retries preserve their original source and never repeat stock deductions.
- `receipts.issue` requires a paid order and returns the existing receipt for retries of that order. Numbers are sequential per vendor; snapshots are deep copies. **No update/delete receipt function exists**. Backend implementation must use transactional locking and database immutability as already defined in Phase 1; in-memory JavaScript is not a replacement for RLS or PostgreSQL concurrency guarantees.
- Settings patch only accepts businessName (2–80 trimmed chars), businessType, tone, autoNegotiation, autoIntents and deliveryFees. IDs and tenant scope cannot be patched. Auto-negotiation starts off. Auto-intents are restricted to the seven listed safe intents, never discounts/complaints/refunds/unknown intents. No approve-everything flag exists. Delivery fees use non-negative integer kobo for Lagos/Abuja/Ibadan in this version.
- Invitations require a non-empty name, syntactically valid email and manager/agent role; duplicate email returns `CONFLICT`. Mock invitations send no email. Team/billing/channels are sample read views, not real account connections or charges.
- Insights are computed from current mock records, not independent hardcoded counters. Revenue includes delivery for paid orders excluding cancelled; daily series sums to total. These are all-time totals over this dataset, not a promise of month/date-range reporting. Billing usage represents the current period seeded snapshot.
- Future backend permissions: owner manages settings/team/billing; owner/manager manages catalogue/channel connections; members access operational inbox/orders. Mock mode is not an authorisation system. Backend must enforce permissions, row scope, stock/price facts, approval lanes and verified webhook rules; it must map these DTOs to the existing database (including the expanded frontend order-status enum) rather than expose tables blindly.

## Mock lifetime and realtime

`createMockClient({vendorId?, latencyMs?, replyDelayMs?})` creates an independent deep-owned seed in memory. Defaults: sample vendor, 100ms read/mutation latency, 1,200ms reply delay. Reload/new client resets changes. Nothing is written to localStorage, Supabase, a queue or channels. `createApiClient({vendorId,getToken,fetcher?})` uses a supplied async token function and optional fetch implementation. `getToken` failures are safe `UNAVAILABLE`; missing tenant/token is `FORBIDDEN`.

`realtime.subscribe(listener)` returns `Result<Unsubscribe>`. Events have area, vendorId, entityId and created/updated type. Message creation also invalidates conversations/insights; approval/order mutations invalidate insights. Events are in-process and best-effort, not durable delivery. Unsubscribe is synchronous and idempotent; `dispose` cancels pending AI timers and removes all listeners. React Strict Mode creates a fresh client after cleanup. API realtime currently returns `NOT_IMPLEMENTED` until WebSockets/Supabase realtime is connected; developer controls are null in API mode.

The developer **Simulate incoming message** button lives in the selected conversation. It shows mutation errors and is never rendered by the API adapter. `failNext(area)` causes the next operation in that area to return one retryable `UNAVAILABLE` error; it is an async test/developer control, not a backend endpoint.

## F2 catalogue operations and confirmation rules

All six additional operations are typed in `catalogue-types.ts`, extended by `CatalogueData`, and available on both adapters. **Only mock implements the operations locally; API routes below remain backend targets.**

| Function | Endpoint / input | Success data |
|---|---|---|
| catalogue.extract | POST `/catalogue/extractions`, `ExtractionInput {photos, category, bulk}` | `CatalogueDraft[]` |
| catalogue.createMany | POST `/catalogue/batches`, `{requestId, products: ProductInput[]}` | `Product[]` |
| catalogue.update | PATCH `/catalogue/:id`, `{expectedRevision, product: ProductInput}` | `Product` |
| catalogue.archive | PATCH `/catalogue/:id/archive`, `{expectedRevision, archived}` | `Product` |
| catalogue.proposeText | POST `/catalogue/text-proposals`, `{text}` | `TypedProposal` |
| catalogue.confirmText | POST `/catalogue/text-proposals/:proposalId/confirm`, `{productId}` | `Product` |

### Category, stock, photo and draft DTOs

- Categories are the fixed `categories` tuple, including Shoes. Vendors choose **chips**, never a category text field. The add flow is photos → category → editable card(s) → price/floor → plain-language confirmation. `bulk: true` means one card per photo (1–10); false means one product with all photos. There is no voice input/recording capability. Customer voice-note playback/transcript DTOs from F1 remain inbound-only.
- Mock extraction **does not read image pixels**. It returns plausible category-based names and blank prices; it must not invent catalogue facts. Shoes require tapped sizes; Food & drink requires portion and positive whole-minute prep time; Services requires positive whole-minute duration. Photos are read into session-only data URLs; neither the photos nor drafts are persisted until confirmation, and even confirmed mock records reset on refresh.
- `ProductPhoto {id,url,name}`: UI accepts JPG/PNG/WebP only, at most 10 photos, up to 3 MB each. Mock `url` is a base64 image data URL. The future API may accept those within configured request limits and return authorised HTTPS storage URLs; upload validation/Storage/RLS still belong to the backend. Do not put customer-sensitive images at public URLs.
- Product now includes `photos`, `details`, `lowStockThreshold` (whole number ≥0), `archived` and `revision` (starts at 1). `ProductInput` deliberately excludes id/vendorId/archived/revision; these are server-owned. All prices are integer kobo. Selling price must be positive and floor ≥0 and ≤selling price. Every variant needs a name, distinct ID, valid non-negative stock/null, and a price at least the floor.
- If variants exist, total stock is the sum of variant stock. Either every variant tracks stock, or none does. Editing per-variant stock recomputes the total. No arbitrary stock allocation is invented. `stockBadge` precedence is Not tracked (`null`), Out of stock (`0`), Low (`1..threshold` inclusive), then In stock. `in_stock` filter excludes low/out stock; the all-stock option includes everything.
- `catalogue.list` excludes archived products by default. `archived: true` returns only archived items. Archive/restore preserves existing orders and receipt snapshots. Revision mismatches return `CONFLICT`, never silently overwrite newer edits.
- `createMany` validates the **entire** 1–10 item batch, including one photo per new item, before any insert. `requestId` makes duplicate confirmations idempotent; reuse with different contents returns `CONFLICT`. The future backend must make this atomic, tenant-scoped and durable rather than rely on JS memory. All successful catalogue mutations emit catalogue invalidation events.
- Typed update grammar (mock local parser): `NAME finished`, `NAME sold out`, `NAME out of stock`; `set/update NAME stock to COUNT`; `raise/set/change/update NAME price to AMOUNT`. Supported examples: `15k` = ₦15,000, `N1.5k` = ₦1,500, `₦15,000` = ₦15,000. Negative, malformed-comma and non-finite/unsafe amounts are rejected. All query words must match the active product's name (case-insensitive). Unknown grammar yields a helpful validation error; no category inference/edit is performed here.
- `proposeText` only proposes: it stores a session proposal snapshot and returns candidate IDs/names and a plain-word summary. More than one candidate requires a **picker**, never automatic selection. No mutation occurs until `confirmText`. The chosen ID must belong to the proposal and retain its revision; otherwise NOT_FOUND/CONFLICT. Confirmation consumes the proposal, preventing repeat execution. Cancelling sends no mutation.
- A finished variant product sets all variant stocks to zero, stated in the summary. A positive aggregate stock change on a variant product is rejected with instructions to edit per-variant stock. Untracked stock changes are rejected. A price update sets list and every variant price to the proposed amount, explicitly stated before confirmation, leaving the floor unchanged; below-floor proposals cannot be confirmed. No discounts or negotiation are enabled.

## F3 inbox additions and runtime semantics

Frontend-only: no channel delivery, backend routes, hosted realtime transport or database changes are implemented here. Every operation still returns `Result<T>` and is tenant-scoped by the adapter/session (future backend must enforce authentication/RLS). Customer details never accept vendor IDs or arbitrary property updates.

- `Conversation` adds `stage: LeadStage` (`new | interested | ready_to_pay | paid | cold`), nullable `threadUrl`, and `suggestedReplies: string[]`. `conversations.list` now accepts `stage` and `needsMe` in addition to channel/status/search. Needs me selects pending approvals. Mode is active human only while `humanModeUntil` is future; list/header show it explicitly. Mock expiry clears the field/emits a conversation event. Explicit payment confirmation updates associated conversation stages to paid; ready-to-pay simulation never alters payment state.
- `setHumanMode` remains PATCH `/conversations/:id/human-mode` with `{until}`. UI takes over for 30 minutes; null hands back. Every delayed mock AI/holding send rechecks the current chat mode and status immediately before sending. It does not pause other chats. Vendor sends and explicit approval decisions remain available while paused. Real backend send-time locking, timeout scheduling, original-account integration and durable queues are future work.
- `messages.list` remains GET `/messages?conversationId=...`; adds `latest?: boolean`. When true, the mock returns the latest `limit` records in chronological order and the actual calculated offset. Current UI requests latest 100; older-history paging is disclosed as unconnected. Without latest, standard offset behaviour is unchanged.
- Optional `Message.product` and `Message.order` are immutable-at-send display snapshots (exact types below), not live price/payment lookup sources. Simulator generates them from the active vendor's current catalogue/order records at send time. Product quantities and prices are never invented. Voice bubbles show inbound transcript and original language; no vendor voice recording is offered and sample `audioUrl` is null.
- `Approval.holdingReplySentAt: ISODate | null` records whether a non-factual holding response has been sent. `holdingReplyDueAt` is five minutes after creation. Seed cards are already one minute old. Mock scheduler checks once per second: only pending, due, open, AI-active chats send a single holding reply; decided cards send nothing. Human mode defers until hand-back/expiry. Browser throttling/session disposal means this is not reliable backend scheduling. A holding send is **not approval**, so the pending card and Needs you badge stay present.
- `Fact.sourceRevision?: number` enables catalogue-staleness protection. Non-reject approval decisions return CONFLICT if a referenced product revision changed; reject remains allowed. Send/Edit create exactly one vendor message; reject creates none. Repeated decisions return CONFLICT. Edited vendor replies are explicit human decisions, not automatically approved AI assertions. `decide` still posts to `/approvals/:id/decision` with action and optional editedReply.
- `Customer` adds `notes`, `tags`, `flagged`. New `customers.update({id,notes,tags,flagged})` maps to PATCH `/customers/:id` with `{notes,tags,flagged}` and returns `Customer`. Notes ≤2,000 chars; ≤10 tags, each trimmed 1–30 chars (deduplicated); flagged boolean. Only those three fields can change. Spam/scam flag is private metadata—not channel blocking/reporting or automatic AI pause. Past orders are looked up by customer ID, never customer name.
- Deep links must be HTTPS on the selected channel's allowed host (or `mailto:` for Email); unsafe/unrelated links fall back to the relevant channel inbox/email app. Sample records have null thread URLs; the UI explicitly says the fallback is not an exact chat link. The app never invents a recipient phone number or social handle.
- In-app notifications are derived from current ready-to-pay conversations and pending approvals. Only these two types are enabled by default; read IDs/preferences are UI state across inbox tabs, not persisted notifications or browser push. No API notification endpoints are implied.
- Developer-only `simulateIncoming` adds optional scenario: greeting/product/ready_to_pay/approval/voice/order. It defaults to greeting for existing callers, emits customer + delayed eligible AI/approval events, respects enabled AUTO intents and checks takeover at send time. Ready-to-pay creates an unverified-facts approval because there are no verified bank instructions. Unsupported intent/bulk decisions never silently send an AI promise. Mock timers and listeners are disposed on session end.
- Resource refetches retain successful content during realtime refresh (rather than unmounting forms on every event), discard stale request results, and expose safe retry errors. Query changes still show loading. This prevents unsent replies and edited customer details from disappearing mid-interaction.

## F4 orders, payment and immutable receipt semantics

**No backend implementation is added.** The frontend status vocabulary intentionally replaces the earlier F1 mock order enum. Future FastAPI/database work must explicitly map/migrate this contract rather than reuse the previous mock state names. Existing database immutability/RLS guarantees are unchanged.

- `Order` adds revision, linked conversation ID (nullable), deliveryAddress, paymentScreenshotReceived, paymentLink (nullable), paidAt, stockMovements and an append-only timeline. `OrderItem.variantName` optionally snapshots the friendly variant name. List filters accept the seven F4 states, combined with ID/customer/item search. UI loads at most 100 per list; pagination beyond that is not connected.
- `setStatus({id,status,expectedRevision})` → PATCH `/orders/:id/status` with `{status,expectedRevision}`. Allowed edges: draft → awaiting_payment/cancelled; awaiting_payment → cancelled; paid → preparing/cancelled; preparing → out_for_delivery/cancelled; out_for_delivery → delivered. Same-state requests with current revision are idempotent. Stale revisions or invalid/skipped edges yield CONFLICT. There is no generic “mark paid” or refund transition.
- Every transition previews an amount-safe `deliveryMessage` from the order snapshot. The successful mock action records it in the timeline and creates a **vendor** message in that order's linked chat (explicit vendor action, even during takeover). It does not invent an ETA, rider, tracking URL, payment instructions or delivery charge. Unlinked real orders require backend messaging integration; durable outbox/retries are future backend work. Timeline IDs/times are server/mock owned. Cancellation is explicit and never claims a refund or automatic stock return.
- `confirmPayment({id,source:"vendor",expectedRevision})` → POST `/orders/:id/payment` with `{source:"vendor",expectedRevision}`. Requires Awaiting payment, exact safe integer-kobo line totals, and current revision. UI has a separate confirmation step showing the amount/order plus a mandatory “I checked my bank” acknowledgement. Client-supplied screenshot/customer/paystack sources are rejected; verified Paystack webhook confirmation must be a separate authenticated server path, not this input.
- `paymentScreenshotReceived` is **only unverified evidence**. Developer-only `simulatePaymentScreenshot({orderId})` sets it and adds a timeline entry, never changes paymentStatus/source, stock, revenue, lead stage or receipts. UI warning: “Screenshots can be faked. Check your bank before confirming.” There is no OCR/screenshot verification or actual image upload in F4.
- Successful first confirmation atomically (in mock memory) records paidAt/source, moves to Paid, updates the customer's conversation stages, and deducts stock once. Already-paid retries return the existing order without deductions/messages/revision changes, including retries after subsequent delivery updates. Product revisions/events change when stock actually changes; order/insights/conversation/message events invalidate relevant views.
- Stock allocation uses detached current product copies, iterates ordered quantities, targets only the exact variant ID, and recomputes aggregate variant stock. Deductions clamp at available stock; no negative balances or guessed variants. `StockMovement` records requested/deducted/shortfall/note. Missing product/variant causes a fulfilment shortfall and no guessed deduction. Untracked stock remains null with no shortfall claim. Real payment is still recorded during shortage: the UI prominently asks the vendor to arrange fulfilment. Existing historical seed paid orders are sample snapshots; their stock is not retrospectively deducted.
- After payment, current stock rows show low/out/variant prompts. Restock uses existing revision-checked `catalogue.update`, not a new order endpoint. It requires a typed positive whole-unit quantity, variant selection where needed, review, then explicit confirmation. A changed product revision disables stale confirmation. Restock adds stock the vendor says they have received; it does not reserve/reconcile old shortfalls, invent inventory, or alter an issued receipt.
- Awaiting-payment mock links look like `https://paystack.com/pay/selvora-sample-do-not-pay-...` and are explicitly **non-payable placeholders**. Copy/share exercises browser APIs only. Only HTTPS `paystack.com` / `checkout.paystack.com` links are accepted by the payment block. There is no real checkout-session API or payment-webhook work in this phase. Clipboard/share failures show a manual-selection fallback rather than pretending to succeed; cancelled native share is a no-op.
- `receipts.issue({orderId})` → POST `/receipts`. Requires verified paid state/source and consistent totals. It is idempotent per vendor/order; concurrent mock calls return one ID/number. The next number is max+1 within this vendor's session; backend must use existing transactional locking and immutable receipt triggers. Snapshot fields include vendorName, customerName, item/variant names, quantities/prices, subtotalKobo, deliveryFeeKobo, totalKobo, paymentSource, issuedAt; order/customer/catalogue/settings changes cannot rewrite them. No update/delete receipt DTO exists.
- `Receipt.shareUrl` is nullable and backend-owned in API mode. Production sharing requires a signed/revocable authorised link; not implemented here. Mock share links use `/receipts/shared#sample=<base64url JSON>` with a fictional unsigned snapshot, deliberately labelled sample/not proof of payment. The fragment stays client-side during HTTP routing; it is **not encryption** and anyone given the link sees its customer name/items/totals. No address/phone/email is included. This route performs bounds/shape/integer-total checks and renders only sample snapshots, never claims an authenticated receipt. It is not a production receipt lookup endpoint.
- PDF download is client-generated via dynamically imported pdf-lib/fontkit and a local licensed Inter TTF. It uses frozen receipt fields, naira glyphs, Lagos dates, line wrapping, page breaks and sample watermarks. Full font embedding avoids composite-glyph subset corruption. Unsupported glyphs, invalid receipt totals or font/network failures fail cleanly instead of generating misleading content. API PDFs omit the sample watermark only for actual API receipts. The font license/source note is in `web/public/fonts/`.

## Exact exported entities and interfaces

<!-- generated-contract:start -->

### Types

```ts
export type ID = string;
export type ISODate = string;
/** Integer kobo, never floating-point naira. */
export type Kobo = number;
export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'email';
export type BusinessType = 'products' | 'services' | 'made-to-order' | 'mixed';
export type Tone = 'friendly' | 'professional' | 'Pidgin-friendly';
export type Role = 'owner' | 'manager' | 'agent';
export interface Entity {
  id: ID;
  vendorId: ID;
}
export interface Variant {
  id: ID;
  name: string;
  priceKobo: Kobo;
  stock: number | null;
}
export interface Product extends Entity {
  name: string;
  category: import('./catalogue-types').Category;
  description: string;
  kind: 'product' | 'service' | 'made-to-order';
  priceKobo: Kobo;
  lowestPriceKobo: Kobo;
  stock: number | null;
  variants: Variant[];
  photos: import('./catalogue-types').ProductPhoto[];
  details: import('./catalogue-types').ProductDetails;
  lowStockThreshold: number;
  archived: boolean;
  revision: number;
}
export type LeadStage = 'new' | 'interested' | 'ready_to_pay' | 'paid' | 'cold';
export interface Customer extends Entity {
  notes: string;
  tags: string[];
  flagged: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  city: 'Lagos' | 'Abuja' | 'Ibadan';
  language: 'en' | 'pcm';
  createdAt: ISODate;
}
export interface Conversation extends Entity {
  assignedTo: ID | null;
  assignedName: string | null;
  stage: LeadStage;
  threadUrl: string | null;
  suggestedReplies: string[];
  customerId: ID;
  customerName: string;
  channel: Channel;
  status: 'open' | 'resolved';
  unreadCount: number;
  lastMessage: string;
  updatedAt: ISODate;
  humanModeUntil: ISODate | null;
}
export interface Message extends Entity {
  englishSummary?: string | null;
  conversationId: ID;
  sender: 'customer' | 'ai' | 'vendor';
  kind: 'text' | 'voice';
  product?: Pick<Product, 'id' | 'name' | 'priceKobo' | 'stock' | 'revision'>;
  order?: Pick<Order, 'id' | 'items' | 'totalKobo' | 'paymentStatus' | 'status'>;
  text: string;
  voice: { durationSeconds: number; transcript: string; audioUrl: string | null } | null;
  status:
    | 'received'
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed'
    | 'pending_approval'
    | 'blocked';
  deliveryErrorCode?: string | null;
  language: 'en' | 'pcm';
  createdAt: ISODate;
}
export type ApprovalReason =
  | 'discount_below_floor'
  | 'bulk_order'
  | 'complaint'
  | 'refund'
  | 'low_confidence'
  | 'unknown_intent'
  | 'unverified_facts';
export interface Fact {
  label: string;
  value: string;
  sourceId: ID;
  sourceRevision?: number;
}
export interface Approval extends Entity {
  conversationId: ID;
  messageId: ID;
  customerMessage: string;
  facts: Fact[];
  proposedReply: string;
  reason: ApprovalReason;
  confidence: number;
  status: 'pending' | 'sent' | 'edited' | 'rejected';
  createdAt: ISODate;
  holdingReplyDueAt: ISODate;
  holdingReplySentAt: ISODate | null;
}
export type OrderStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'paid'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';
export interface OrderItem {
  variantName?: string | null;
  productId: ID;
  name: string;
  variantId: ID | null;
  quantity: number;
  unitPriceKobo: Kobo;
}
export interface OrderTimelineEntry {
  id: ID;
  at: ISODate;
  label: string;
  customerMessage: string | null;
}
export interface StockMovement {
  productId: ID;
  variantId: ID | null;
  requested: number;
  deducted: number;
  shortfall: number;
  note: string;
}
export interface Order extends Entity {
  paymentReview?: string | null;
  refundStatus?: string | null;
  restockedAt?: string | null;
  revision: number;
  conversationId: ID | null;
  deliveryAddress: string;
  paymentScreenshotReceived: boolean;
  paymentLink: string | null;
  paidAt: ISODate | null;
  stockMovements: StockMovement[];
  timeline: OrderTimelineEntry[];
  customerId: ID;
  customerName: string;
  items: OrderItem[];
  status: OrderStatus;
  city: Customer['city'];
  deliveryFeeKobo: Kobo;
  totalKobo: Kobo;
  paymentStatus: 'unpaid' | 'paid';
  paymentSource: 'vendor' | 'paystack' | null;
  createdAt: ISODate;
}
export interface Receipt extends Entity {
  vendorName: string;
  subtotalKobo: Kobo;
  paymentSource: 'vendor' | 'paystack';
  shareUrl: string | null;
  orderId: ID;
  number: number;
  totalKobo: Kobo;
  items: OrderItem[];
  deliveryFeeKobo: Kobo;
  customerName: string;
  issuedAt: ISODate;
}
export interface ChannelAccount extends Entity {
  channel: Channel;
  displayName: string;
  status: 'connected' | 'disconnected' | 'expired';
  ownAccount: boolean;
}
export type AutoIntent =
  | 'greeting'
  | 'price'
  | 'availability'
  | 'variants'
  | 'delivery_info'
  | 'order_status'
  | 'alternatives';
export interface BusinessSettings extends Entity {
  replyLanguages: import('./settings-types').AppLanguage[];
  businessHours: import('./settings-types').BusinessHours;
  preferences: import('./settings-types').Preferences;
  businessName: string;
  businessType: BusinessType;
  tone: Tone;
  autoNegotiation: boolean;
  autoIntents: AutoIntent[];
  deliveryFees: { city: Customer['city']; feeKobo: Kobo }[];
}
export interface TeamMember extends Entity {
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited';
}
export interface Billing extends Entity {
  offers: import('./settings-types').BillingOffer[];
  selectedOfferId: ID | null;
  trialEndsAt: ISODate;
  bundleBalance: number;
  plan: 'starter' | 'growth';
  status: 'trial' | 'active' | 'past_due';
  monthlyPriceKobo: Kobo;
  nextBillingAt: ISODate;
  usage: { conversations: number; limit: number };
}
export interface Insights {
  revenueKobo: Kobo;
  orderCount: number;
  conversationCount: number;
  pendingApprovals: number;
  dailySales: { date: string; revenueKobo: Kobo }[];
  byChannel: { channel: Channel; conversations: number }[];
}
export interface ListInput {
  cursor?: string;
  search?: string;
  offset?: number;
  limit?: number;
}
export interface Page<T> {
  nextCursor?: string | null;
  hasMore?: boolean;
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
export type ErrorCode =
  'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' | 'NOT_IMPLEMENTED';
export interface DataError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: DataError };
export type Resource<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: DataError };
export type DataMode = 'mock' | 'api';
export interface DataEvent {
  area:
    | 'catalogue'
    | 'conversations'
    | 'messages'
    | 'approvals'
    | 'orders'
    | 'receipts'
    | 'customers'
    | 'channels'
    | 'settings'
    | 'extras'
    | 'insights'
    | 'team'
    | 'billing';
  vendorId: ID;
  entityId: ID;
  type: 'created' | 'updated';
}
export type Unsubscribe = () => void;
```

### Interfaces

```ts
import type { HelperLink, ChannelAttempt, AuditEntry } from './settings-types';
import type { CatalogueMutations, Category, StockFilter } from './catalogue-types';
import type {
  Approval,
  AutoIntent,
  Billing,
  BusinessSettings,
  ChannelAccount,
  Conversation,
  Customer,
  DataEvent,
  DataMode,
  ID,
  Insights,
  ListInput,
  Message,
  Order,
  OrderStatus,
  Page,
  Product,
  Receipt,
  Result,
  Role,
  TeamMember,
  Unsubscribe,
} from './types';
export interface CatalogueData extends CatalogueMutations {
  list(
    input?: ListInput & { category?: Category; stock?: StockFilter; archived?: boolean },
  ): Promise<Result<Page<Product>>>;
  get(id: ID): Promise<Result<Product>>;
}
export interface ConversationsData {
  list(
    input?: ListInput & {
      channel?: ChannelAccount['channel'];
      status?: Conversation['status'];
      stage?: Conversation['stage'];
      needsMe?: boolean;
    },
  ): Promise<Result<Page<Conversation>>>;
  get(id: ID): Promise<Result<Conversation>>;
  markRead(id: ID): Promise<Result<Conversation>>;
  setHumanMode(input: { id: ID; until: string | null }): Promise<Result<Conversation>>;
}
export interface MessagesData {
  list(input: ListInput & { conversationId: ID; latest?: boolean }): Promise<Result<Page<Message>>>;
  retry?(id: ID): Promise<Result<{ id: ID }>>;
  send(input: {
    conversationId: ID;
    text: string;
    idempotencyKey?: string;
  }): Promise<Result<Message>>;
}
export interface ApprovalsData {
  list(input?: ListInput & { status?: Approval['status'] }): Promise<Result<Page<Approval>>>;
  decide(input: {
    id: ID;
    action: 'send' | 'edit' | 'reject';
    editedReply?: string;
  }): Promise<Result<Approval>>;
}
export interface OrdersData {
  requestCheckout?(id: ID): Promise<Result<{ queued: boolean }>>;
  cancellationActions?(input: {
    id: ID;
    refund: boolean;
    restock: boolean;
    confirmed: boolean;
  }): Promise<Result<Order>>;
  list(input?: ListInput & { status?: OrderStatus }): Promise<Result<Page<Order>>>;
  get(id: ID): Promise<Result<Order>>;
  setStatus(input: {
    id: ID;
    status: OrderStatus;
    expectedRevision: number;
  }): Promise<Result<Order>>;
  confirmPayment(input: {
    id: ID;
    source: 'vendor';
    confirmed?: boolean;
    expectedRevision: number;
  }): Promise<Result<Order>>;
}
export interface ReceiptsData {
  share?(id: ID): Promise<Result<{ url: string }>>;
  revoke?(id: ID): Promise<Result<{ revoked: boolean }>>;
  list(input?: ListInput): Promise<Result<Page<Receipt>>>;
  get(id: ID): Promise<Result<Receipt>>;
  issue(input: { orderId: ID }): Promise<Result<Receipt>>;
}
export interface CustomersData {
  list(input?: ListInput): Promise<Result<Page<Customer>>>;
  get(id: ID): Promise<Result<Customer>>;
  update(input: {
    id: ID;
    notes: string;
    tags: string[];
    flagged: boolean;
  }): Promise<Result<Customer>>;
}
export interface ChannelsData {
  list(): Promise<Result<ChannelAccount[]>>;
  begin(input: { channel: ChannelAccount['channel'] }): Promise<Result<ChannelAttempt>>;
  complete(input: { attemptId: ID }): Promise<Result<ChannelAccount>>;
  helper(): Promise<Result<HelperLink | null>>;
  newHelperCode(): Promise<Result<HelperLink>>;
  confirmHelper(input: { id: ID }): Promise<Result<HelperLink>>;
}
export interface ReplyPolicy {
  enabled: boolean;
  autoIntents: AutoIntent[];
  autoNegotiation: boolean;
  tone: BusinessSettings['tone'];
}
export interface SettingsData {
  getReplyPolicy?(): Promise<Result<ReplyPolicy>>;
  updateReplyPolicy?(input: ReplyPolicy): Promise<Result<ReplyPolicy>>;
  get(): Promise<Result<BusinessSettings>>;
  update(
    input: Partial<
      Pick<
        BusinessSettings,
        | 'businessName'
        | 'businessType'
        | 'tone'
        | 'autoNegotiation'
        | 'autoIntents'
        | 'deliveryFees'
        | 'replyLanguages'
        | 'businessHours'
        | 'preferences'
      >
    >,
  ): Promise<Result<BusinessSettings>>;
}
export interface InsightsData {
  get(
    range?: import('./extras-types').DateRange,
  ): Promise<Result<import('./extras-types').InsightsReport>>;
}
export interface TeamData {
  setRole(input: { id: ID; role: Exclude<Role, 'owner'> }): Promise<Result<TeamMember>>;
  assign(input: { conversationId: ID; memberId: ID | null }): Promise<Result<Conversation>>;
  audit(): Promise<Result<AuditEntry[]>>;
  list(): Promise<Result<TeamMember[]>>;
  invite(input: {
    name: string;
    email: string;
    role: Exclude<Role, 'owner'>;
  }): Promise<Result<TeamMember>>;
}
export interface BillingData {
  selectOffer(input: { offerId: ID }): Promise<Result<Billing>>;
  get(): Promise<Result<Billing>>;
}
export interface RealtimeData {
  subscribe(listener: (event: DataEvent) => void): Promise<Result<Unsubscribe>>;
}
/** Only mock adapters implement developer simulation; never part of the backend API. */
export interface MockControls {
  simulateIncoming(input: {
    conversationId: ID;
    scenario?: 'greeting' | 'product' | 'ready_to_pay' | 'approval' | 'voice' | 'order';
  }): Promise<Result<Message>>;
  simulateInviteAccepted(input: { memberId: ID }): Promise<Result<TeamMember>>;
  simulatePaymentScreenshot(input: { orderId: ID }): Promise<Result<Order>>;
  failNext(area: DataEvent['area']): Promise<Result<null>>;
}
export interface DataClient {
  readonly mode: DataMode;
  readonly vendorId: ID;
  catalogue: CatalogueData;
  conversations: ConversationsData;
  messages: MessagesData;
  approvals: ApprovalsData;
  orders: OrdersData;
  receipts: ReceiptsData;
  customers: CustomersData;
  channels: ChannelsData;
  settings: SettingsData;
  insights: InsightsData;
  extras: import('./extras-types').ExtrasData;
  team: TeamData;
  billing: BillingData;
  realtime: RealtimeData;
  developer: MockControls | null;
  dispose(): Promise<void>;
}
export type { AutoIntent };
```

### Catalogue additions

```ts
import type { Product, ID, Result } from './types';
export const categories = [
  'Fashion',
  'Shoes',
  'Beauty',
  'Food & drink',
  'Home',
  'Accessories',
  'Services',
  'Custom',
] as const;
export type Category = (typeof categories)[number];
export type StockFilter = 'in_stock' | 'low' | 'out' | 'not_tracked';
export interface ProductPhoto {
  id: ID;
  url: string;
  name: string;
}
export interface ProductDetails {
  sizes: string[];
  portion: string;
  prepMinutes: number | null;
  durationMinutes: number | null;
}
export type ProductInput = Omit<Product, 'id' | 'vendorId' | 'archived' | 'revision'>;
export interface ExtractionInput {
  photos: ProductPhoto[];
  category: Category;
  bulk: boolean;
}
export interface CatalogueDraft {
  key: ID;
  product: ProductInput;
}
export interface CreateProductsInput {
  requestId: ID;
  products: ProductInput[];
}
export interface EditProductInput {
  id: ID;
  expectedRevision: number;
  product: ProductInput;
}
export interface TypedProposal {
  id: ID;
  text: string;
  candidates: { id: ID; name: string; summary: string }[];
}
export interface CatalogueMutations {
  extract(input: ExtractionInput): Promise<Result<CatalogueDraft[]>>;
  createMany(input: CreateProductsInput): Promise<Result<Product[]>>;
  update(input: EditProductInput): Promise<Result<Product>>;
  archive(input: { id: ID; expectedRevision: number; archived: boolean }): Promise<Result<Product>>;
  proposeText(input: { text: string }): Promise<Result<TypedProposal>>;
  confirmText(input: { proposalId: ID; productId: ID }): Promise<Result<Product>>;
}
```

### Settings additions

```ts
import type { Entity, ID, ISODate, Channel, Kobo } from './types';
export type AppLanguage = 'en' | 'pcm';
export interface Preferences {
  lowData: boolean;
  darkMode: boolean;
  language: AppLanguage;
  notifications: { readyToPay: boolean; needsYou: boolean };
}
export interface BusinessHours {
  enabled: boolean;
  timezone: 'Africa/Lagos';
  days: { day: number; closed: boolean; opens: string; closes: string }[];
  awayMessage: string;
}
export interface HelperLink {
  id: ID;
  code: string;
  expiresAt: ISODate;
  status: 'pending' | 'linked';
  helperNumber: string | null;
}
export interface ChannelAttempt {
  authorizationUrl?: string;
  id: ID;
  channel: Channel;
  expiresAt: ISODate;
  status: 'pending' | 'completed';
}
export interface AuditEntry extends Entity {
  actorName: string;
  action: string;
  subject: string;
  at: ISODate;
}
export interface BillingOffer {
  id: ID;
  name: string;
  kind: 'monthly' | 'yearly' | 'volume' | 'bundle';
  priceKobo: Kobo;
  conversations: number;
  description: string;
}
```

### Insights and extras additions

```ts
import type { Entity, ISODate, Result, Insights } from './types';
export interface DateRange {
  from: string;
  to: string;
}
export interface InsightsReport extends Insights {
  responseSeconds: number | null;
  responseSamples: number;
  stages: { label: string; value: number }[];
  topProducts: { label: string; value: number }[];
  hours: { label: string; value: number }[];
  handling: { label: string; value: number }[];
}
export interface FollowupSettings {
  enabled: boolean;
  afterHours: number;
  style: 'friendly' | 'professional' | 'Pidgin-friendly';
}
export interface Followup extends Entity {
  customerName: string;
  conversationId: string;
  scheduledAt: ISODate;
  sentAt: ISODate | null;
  status: 'scheduled' | 'sent' | 'cancelled';
  text: string;
}
export interface FlaggedMessage extends Entity {
  customerName: string;
  channel: string;
  text: string;
  reason: string;
  createdAt: ISODate;
  status: 'flagged' | 'cleared' | 'blocked';
}
export interface RestockAlert extends Entity {
  productId: string;
  productName: string;
  customerName: string;
  createdAt: ISODate;
  status: 'waiting' | 'notified';
}
export interface ExtrasSnapshot {
  followupSettings: FollowupSettings;
  followups: Followup[];
  flags: FlaggedMessage[];
  restock: RestockAlert[];
}
export interface ExtrasData {
  get(): Promise<Result<ExtrasSnapshot>>;
  configure(input: FollowupSettings): Promise<Result<FollowupSettings>>;
  followup(input: { id: string; action: 'cancel' | 'simulate_send' }): Promise<Result<Followup>>;
  moderate(input: { id: string; action: 'not_spam' | 'block' }): Promise<Result<FlaggedMessage>>;
  notifyRestock(input: { id: string }): Promise<Result<RestockAlert>>;
}
```

<!-- generated-contract:end -->

## F5 configuration semantics (backend handoff, not implemented)

Channel `begin` creates a ten-minute latest-attempt-only authorisation flow; `complete`
returns own-account status. TikTok completion returns `NOT_IMPLEMENTED`. Helper
`newHelperCode` replaces any prior four-digit code and expires at ten minutes;
`confirmHelper` is mock-only UI simulation. API UI checks status instead of pretending
that clicking a button authorises the link. A configured number is nullable, never invented.
Helper linking must never connect or send customer-channel messages.

Settings updates allow only supported intents, tones, reply languages, seven unique
same-day Africa/Lagos hours, bounded away message and typed preferences. Tenant identity
cannot be changed. Negotiation is off by default and never undercuts stored floors.
Team assignment accepts only active same-vendor members or null; owner is protected.
Real invitations, authentication, role checks, immutable durable audit and helper code
rate limits/secret storage require backend work before production.

Billing offer selection is not checkout and grants no entitlement. Usage/trial and sample
prices are illustrative. Verified Paystack payments and entitlements remain backend-owned.
Preferences are per-workspace in-memory in mock; API adapter does not fall back to mock.

## F6 insights/extras handoff (not a backend implementation)

`insights.get({from,to})` accepts inclusive YYYY-MM-DD WAT dates, rejects invalid or reversed
ranges, and returns actual-state aggregates with null response time for no completed pairs.
Leads/stages are an activity-filtered snapshot. Response pairs are dated by first sent reply;
unanswered bursts are excluded. Revenue/paid units use payment dates, falling back to creation
for older data, excluding unpaid/cancelled orders. AI/vendor share counts sent messages.

`extras.get` returns session follow-up configuration/history, flagged messages and customer
restock requests. Configure accepts only enabled, whole hours 24–720 and supported style.
Pending schedules use last activity, clamped to now if overdue. Cancel/simulate-send resolve
only scheduled entries; sends require enabled/open/cold and no active human takeover.
Simulation changes queue history only and deliberately bypasses due time. Moderation resolves
only flagged entries. Restock notification simulation rejects missing/archived/unavailable
products and already-notified requests. These mock actions never invoke external providers.
API routes use authenticated tenant headers and never fall back to mocks; API UI hides send/
restock simulators. Real scheduling, consent/opt-out, provider blocking, variant-specific
subscriptions, translation verification and delivery confirmations require backend work.
`Message.englishSummary` is optional; missing summaries are never manufactured by the UI.
