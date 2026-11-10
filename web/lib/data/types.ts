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
  category: string;
  description: string;
  kind: 'product' | 'service' | 'made-to-order';
  priceKobo: Kobo;
  lowestPriceKobo: Kobo;
  stock: number | null;
  variants: Variant[];
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
