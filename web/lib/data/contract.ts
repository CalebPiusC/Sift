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
