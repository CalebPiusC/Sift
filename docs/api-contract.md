# Selvora frontend data contract

Current declarations below are generated from TypeScript. They describe interfaces,
not proof that an API exists or a screen works against it. Current capability and
acceptance status lives **only** in [status matrix](status-matrix.md); the exact
[B1 gaps](backend/b1-gap-audit.md) and [route audit](backend/route-audit.md) explain
missing endpoints. [Historical F0–F7 sample semantics](history/frontend-contract-f0-f7.md)
are archived, not current backend status.

`DataProvider` chooses one mock or API client for the workspace. Mock is the default,
with a truthful Sample data banner; API mode has no fallback to seed data. Next
proxies `/api/v1/*` to FastAPI `/v1/*` when API_ORIGIN is configured. Many catalogue
and general-settings targets are currently absent; an adapter URL is not an endpoint.
Supabase realtime subscription wiring exists but hosted delivery is unproven.

Regenerate declarations: `npm run docs:contract`. Run `npm run test:contract`.

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
  voice: {
    durationSeconds: number | null;
    transcript: string;
    audioUrl: string | null;
    detectedLanguage?: string;
  } | null;
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
  preferencesRevision?: string;
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
  completeWhatsApp?(input: {
    attemptId: ID;
    code?: string;
    phoneNumberId?: string;
    wabaId?: string;
  }): Promise<Result<ChannelAccount>>;
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
    > & { expectedPreferencesRevision?: string; idempotencyKey?: string },
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
  checkout?(input: {
    offerId: ID;
  }): Promise<Result<{ checkoutId: ID; authorizationUrl: string; entitlementsChanged: boolean }>>;
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
  sandbox?: boolean;
  id: ID;
  code: string;
  expiresAt: ISODate;
  status: 'pending' | 'linked';
  helperNumber: string | null;
}
export interface ChannelAttempt {
  sandbox?: boolean;
  embeddedSignup?: { appId: string; configId: string; version: string } | null;
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
