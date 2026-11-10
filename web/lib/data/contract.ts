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
export interface CatalogueData {
  list(input?: ListInput & { category?: string }): Promise<Result<Page<Product>>>;
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
