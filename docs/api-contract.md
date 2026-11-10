# Selvora frontend data contract — F1/F2

**Status:** frontend contract and in-memory adapter implemented. Backend endpoints below are a target, **not a claim that they exist**. F1/F2 change no FastAPI routes or database migrations.

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
- Catalogue search matches name/category; conversation search matches customer name/last text; approval search matches customer text/reason; order search matches ID/customer name; customer search matches name/city. Message/receipt lists do not support text search. Catalogue/orders/approvals/customers/receipts preserve creation/seed order; conversations sort `updatedAt` descending; messages sort `createdAt` ascending. Stable ties preserve insertion order.
- `Result` success: `{ok:true,data:T}`. Failure: `{ok:false,error:{code,message,retryable}}`. Errors are safe for display and never expose provider bodies, credentials, raw customer payloads or phone numbers in logs. Standard errors: `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `UNAVAILABLE`, `NOT_IMPLEMENTED`. Only transient `UNAVAILABLE` failures should offer automatic retry. Mutations retry only when idempotent.
- `useResource` wraps reads in `Resource<T>` (`loading`, `success`, `error`) and exposes manual `retry()`. It ignores stale/unmounted completions and invalidates on realtime events. UI mutation helper `useAction` exposes `busy`, `error` and async `run`. The adapters themselves never invent a loading result: loading belongs to the hook while a promise is pending.

## Function → HTTP mapping (future backend)

All paths are relative to `/api/v1`. Every request has `Authorization: Bearer <Supabase access token>` and `X-Vendor-Id`; the server **must** verify tenant membership. Browser calls are same-origin; future deployment must proxy this prefix to FastAPI. Responses use the `Result<T>` envelope. The current API adapter handles offline/non-JSON/missing endpoints without returning samples.

| Interface.function | HTTP / input | Success data |
|---|---|---|
| CatalogueData.list | GET `/catalogue`, query `ListInput & {category?: Category, stock?: StockFilter, archived?: boolean}` | `Page<Product>` |
| CatalogueData.get | GET `/catalogue/:id` | `Product` |
| ConversationsData.list | GET `/conversations`, query `ListInput & {channel?, status?}` | `Page<Conversation>` |
| ConversationsData.get | GET `/conversations/:id` | `Conversation` |
| ConversationsData.markRead | POST `/conversations/:id/read`, `{}` | `Conversation` |
| ConversationsData.setHumanMode | PATCH `/conversations/:id/human-mode`, `{until: ISODate \| null}` | `Conversation` |
| MessagesData.list | GET `/messages`, query `ListInput & {conversationId}` | `Page<Message>` |
| MessagesData.send | POST `/messages`, `{conversationId, text}` | `Message` |
| ApprovalsData.list | GET `/approvals`, query `ListInput & {status?}` | `Page<Approval>` |
| ApprovalsData.decide | POST `/approvals/:id/decision`, `{action, editedReply?}` | `Approval` |
| OrdersData.list | GET `/orders`, query `ListInput & {status?}` | `Page<Order>` |
| OrdersData.get | GET `/orders/:id` | `Order` |
| OrdersData.setStatus | PATCH `/orders/:id/status`, `{status}` | `Order` |
| OrdersData.confirmPayment | POST `/orders/:id/payment`, `{source: "vendor"}` | `Order` |
| ReceiptsData.list | GET `/receipts`, query `ListInput` | `Page<Receipt>` |
| ReceiptsData.get | GET `/receipts/:id` | `Receipt` |
| ReceiptsData.issue | POST `/receipts`, `{orderId}` | `Receipt` |
| CustomersData.list | GET `/customers`, query `ListInput` | `Page<Customer>` |
| CustomersData.get | GET `/customers/:id` | `Customer` |
| ChannelsData.list | GET `/channels`, no input | `ChannelAccount[]` |
| SettingsData.get | GET `/settings`, no input | `BusinessSettings` |
| SettingsData.update | PATCH `/settings`, allowlisted partial settings (below) | `BusinessSettings` |
| InsightsData.get | GET `/insights`, no input | `Insights` |
| TeamData.list | GET `/team`, no input | `TeamMember[]` |
| TeamData.invite | POST `/team/invitations`, `{name, email, role: "manager" \| "agent"}` | `TeamMember` |
| BillingData.get | GET `/billing`, no input | `Billing` |
| RealtimeData.subscribe | Async client subscription; listener receives `DataEvent` | `Unsubscribe` callback (not JSON) |
| MockControls.simulateIncoming | **Mock only**, `{conversationId}` | Created customer `Message` |
| MockControls.failNext | **Mock only**, `area: DataEvent["area"]` | `null` |
| DataClient.dispose | Local async lifecycle, no input | `void` |

## Semantics and safety

- `messages.send` is a **vendor text reply**, trimmed length 1–4,000. No vendor voice-recording API exists. Customer voice messages have duration/transcript; sample audio URL is null, visibly marked unavailable. A real implementation may supply a short-lived authorised audio URL, never public private media.
- `markRead` sets unread to zero. `setHumanMode` takes a future expiry or null for Hand Back. Sample incoming greetings are added immediately; a canned **amount-free** AI greeting arrives ~1.2 seconds later only if the conversation is open and human mode is off/expired **when the delayed reply executes**. No Gemini call or real channel send happens. This simulator demonstrates UI events, not the future intent/fact-verification pipeline.
- `approvals.decide`: only pending cards may be acted on; `send` uses the proposed text, `edit` requires a 1–4,000 character `editedReply`, `reject` sends nothing. Send/edit create a vendor message and resolve the approval atomically in memory. Repeated decisions return `CONFLICT`. There is no bulk/approve-everything function. F1 shows cards read-only; interactive approval UI can use these methods in its frontend phase.
- Order states: `pending → confirmed/cancelled`, `confirmed → processing/cancelled`, `processing → shipped/cancelled`, `shipped → delivered`, `delivered → refunded`. Cancelled/refunded are terminal; setting the same state is idempotent. Progression other than cancellation requires confirmed payment. Refund state here does not execute a payment refund; the future backend must require the approval/refund workflow before permitting it.
- Only `confirmPayment({source:"vendor"})` represents explicit vendor confirmation. Paystack may appear in seed/read data but is **not accepted as a client confirmation input**. Screenshots cannot confirm payment. Closed cancelled/refunded orders reject confirmation. Already-paid orders preserve their original payment source.
- `receipts.issue` requires a paid order and returns the existing receipt for retries of that order. Numbers are sequential per vendor; snapshots are deep copies. **No update/delete receipt function exists**. Backend implementation must use transactional locking and database immutability as already defined in Phase 1; in-memory JavaScript is not a replacement for RLS or PostgreSQL concurrency guarantees.
- Settings patch only accepts businessName (2–80 trimmed chars), businessType, tone, autoNegotiation, autoIntents and deliveryFees. IDs and tenant scope cannot be patched. Auto-negotiation starts off. Auto-intents are restricted to the seven listed safe intents, never discounts/complaints/refunds/unknown intents. No approve-everything flag exists. Delivery fees use non-negative integer kobo for Lagos/Abuja/Ibadan in this version.
- Invitations require a non-empty name, syntactically valid email and manager/agent role; duplicate email returns `CONFLICT`. Mock invitations send no email. Team/billing/channels are sample read views, not real account connections or charges.
- Insights are computed from current mock records, not independent hardcoded counters. Revenue includes delivery for paid orders excluding cancelled/refunded; daily series sums to total. These are all-time totals over this dataset, not a promise of month/date-range reporting. Billing usage represents the current period seeded snapshot.
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
export interface Customer extends Entity {
  name: string;
  email: string | null;
  phone: string | null;
  city: 'Lagos' | 'Abuja' | 'Ibadan';
  language: 'en' | 'pcm';
  createdAt: ISODate;
}
export interface Conversation extends Entity {
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
  conversationId: ID;
  sender: 'customer' | 'ai' | 'vendor';
  kind: 'text' | 'voice';
  text: string;
  voice: { durationSeconds: number; transcript: string; audioUrl: string | null } | null;
  status: 'received' | 'sent' | 'pending_approval' | 'blocked';
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
}
export type OrderStatus =
  'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export interface OrderItem {
  productId: ID;
  name: string;
  variantId: ID | null;
  quantity: number;
  unitPriceKobo: Kobo;
}
export interface Order extends Entity {
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
  status: 'connected' | 'disconnected';
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
  search?: string;
  offset?: number;
  limit?: number;
}
export interface Page<T> {
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
    input?: ListInput & { channel?: ChannelAccount['channel']; status?: Conversation['status'] },
  ): Promise<Result<Page<Conversation>>>;
  get(id: ID): Promise<Result<Conversation>>;
  markRead(id: ID): Promise<Result<Conversation>>;
  setHumanMode(input: { id: ID; until: string | null }): Promise<Result<Conversation>>;
}
export interface MessagesData {
  list(input: ListInput & { conversationId: ID }): Promise<Result<Page<Message>>>;
  send(input: { conversationId: ID; text: string }): Promise<Result<Message>>;
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
  list(input?: ListInput & { status?: OrderStatus }): Promise<Result<Page<Order>>>;
  get(id: ID): Promise<Result<Order>>;
  setStatus(input: { id: ID; status: OrderStatus }): Promise<Result<Order>>;
  confirmPayment(input: { id: ID; source: 'vendor' }): Promise<Result<Order>>;
}
export interface ReceiptsData {
  list(input?: ListInput): Promise<Result<Page<Receipt>>>;
  get(id: ID): Promise<Result<Receipt>>;
  issue(input: { orderId: ID }): Promise<Result<Receipt>>;
}
export interface CustomersData {
  list(input?: ListInput): Promise<Result<Page<Customer>>>;
  get(id: ID): Promise<Result<Customer>>;
}
export interface ChannelsData {
  list(): Promise<Result<ChannelAccount[]>>;
}
export interface SettingsData {
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
      >
    >,
  ): Promise<Result<BusinessSettings>>;
}
export interface InsightsData {
  get(): Promise<Result<Insights>>;
}
export interface TeamData {
  list(): Promise<Result<TeamMember[]>>;
  invite(input: {
    name: string;
    email: string;
    role: Exclude<Role, 'owner'>;
  }): Promise<Result<TeamMember>>;
}
export interface BillingData {
  get(): Promise<Result<Billing>>;
}
export interface RealtimeData {
  subscribe(listener: (event: DataEvent) => void): Promise<Result<Unsubscribe>>;
}
/** Only mock adapters implement developer simulation; never part of the backend API. */
export interface MockControls {
  simulateIncoming(input: { conversationId: ID }): Promise<Result<Message>>;
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

<!-- generated-contract:end -->
