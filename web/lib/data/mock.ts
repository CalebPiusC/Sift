import { catalogueMock } from './catalogue-mock';
import type { DataClient } from './contract';
import type {
  DataEvent,
  ID,
  ListInput,
  Message,
  Page,
  Result,
  ErrorCode,
  OrderStatus,
} from './types';
import { createSeed, SAMPLE_VENDOR } from './seed';
const clone = <T>(value: T): T => structuredClone(value);
const ok = <T>(data: T): Result<T> => ({ ok: true, data: clone(data) });
const fail = (code: ErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message, retryable: code === 'UNAVAILABLE' },
});
function page<T>(items: T[], input: ListInput = {}): Result<Page<T>> {
  const { offset = 0, limit = 50 } = input;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    return fail('VALIDATION', 'Use an offset of zero or greater and a limit from 1 to 100.');
  return ok({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
}
export function createMockClient(
  options: { vendorId?: ID; latencyMs?: number; replyDelayMs?: number } = {},
): DataClient {
  const vendorId = options.vendorId ?? SAMPLE_VENDOR;
  const state = createSeed(vendorId);
  const listeners = new Set<(event: DataEvent) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const failures = new Set<DataEvent['area']>();
  let disposed = false;
  let sequence = 0;
  const id = (prefix: string) => `${prefix}-live-${++sequence}`;
  const emit = (area: DataEvent['area'], entityId: ID, type: DataEvent['type'] = 'updated') => {
    if (disposed) return;
    for (const listener of listeners) {
      try {
        listener({ area, vendorId, entityId, type });
      } catch {
        /* One subscriber cannot interrupt a mutation. */
      }
    }
  };
  async function run<T>(area: DataEvent['area'], work: () => Result<T>): Promise<Result<T>> {
    if (options.latencyMs !== 0)
      await new Promise((resolve) => setTimeout(resolve, options.latencyMs ?? 100));
    if (disposed) return fail('UNAVAILABLE', 'This data session has ended.');
    if (failures.delete(area))
      return fail('UNAVAILABLE', 'Sample connection interrupted. Please retry.');
    try {
      return work();
    } catch {
      return fail('UNAVAILABLE', 'Unable to load data. Please retry.');
    }
  }
  const find = <T extends { id: ID }>(rows: T[], key: ID): Result<T> => {
    const row = rows.find((r) => r.id === key);
    return row ? ok(row) : fail('NOT_FOUND', 'This item could not be found.');
  };
  const matches = (value: string, input?: ListInput) =>
    !input?.search || value.toLowerCase().includes(input.search.toLowerCase());
  const addMessage = (
    conversationId: ID,
    text: string,
    sender: Message['sender'],
  ): Result<Message> => {
    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (!conversation) return fail('NOT_FOUND', 'Conversation not found.');
    if (!text.trim() || text.length > 4000)
      return fail('VALIDATION', 'A message must contain 1 to 4,000 characters.');
    const message: Message = {
      id: id('message'),
      vendorId,
      conversationId,
      sender,
      kind: 'text',
      text: text.trim(),
      voice: null,
      status: sender === 'customer' ? 'received' : 'sent',
      language: 'en',
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    conversation.lastMessage = message.text;
    conversation.updatedAt = message.createdAt;
    if (sender === 'customer') conversation.unreadCount++;
    emit('messages', message.id, 'created');
    emit('conversations', conversationId);
    emit('insights', vendorId);
    return ok(message);
  };
  const client: DataClient = {
    mode: 'mock',
    vendorId,
    catalogue: catalogueMock({ products: state.products, vendorId, id, run, emit, page }),
    conversations: {
      list: (input) =>
        run('conversations', () =>
          page(
            state.conversations
              .filter(
                (c) =>
                  (!input?.channel || c.channel === input.channel) &&
                  (!input?.status || c.status === input.status) &&
                  matches(`${c.customerName} ${c.lastMessage}`, input),
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
            input,
          ),
        ),
      get: (key) => run('conversations', () => find(state.conversations, key)),
      markRead: (key) =>
        run('conversations', () => {
          const c = state.conversations.find((c) => c.id === key);
          if (!c) return fail('NOT_FOUND', 'Conversation not found.');
          c.unreadCount = 0;
          emit('conversations', key);
          return ok(c);
        }),
      setHumanMode: (input) =>
        run('conversations', () => {
          const c = state.conversations.find((c) => c.id === input.id);
          if (!c) return fail('NOT_FOUND', 'Conversation not found.');
          if (
            input.until !== null &&
            (!Number.isFinite(Date.parse(input.until)) || Date.parse(input.until) <= Date.now())
          )
            return fail('VALIDATION', 'Choose a future takeover expiry or null to hand back.');
          c.humanModeUntil = input.until;
          emit('conversations', c.id);
          return ok(c);
        }),
    },
    messages: {
      list: (input) =>
        run('messages', () =>
          state.conversations.some((c) => c.id === input.conversationId)
            ? page(
                state.messages
                  .filter((m) => m.conversationId === input.conversationId)
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
                input,
              )
            : fail('NOT_FOUND', 'Conversation not found.'),
        ),
      send: (input) =>
        run('messages', () => addMessage(input.conversationId, input.text, 'vendor')),
    },
    approvals: {
      list: (input) =>
        run('approvals', () =>
          page(
            state.approvals.filter(
              (a) =>
                (!input?.status || a.status === input.status) &&
                matches(`${a.customerMessage} ${a.reason}`, input),
            ),
            input,
          ),
        ),
      decide: (input) =>
        run('approvals', () => {
          const a = state.approvals.find((a) => a.id === input.id);
          if (!a) return fail('NOT_FOUND', 'Approval not found.');
          if (a.status !== 'pending')
            return fail('CONFLICT', 'This approval has already been decided.');
          if (!['send', 'edit', 'reject'].includes(input.action))
            return fail('VALIDATION', 'Choose send, edit or reject.');
          const text = input.action === 'edit' ? input.editedReply?.trim() : a.proposedReply;
          if (input.action !== 'reject' && (!text || text.length > 4000))
            return fail('VALIDATION', 'Provide a reply of 1 to 4,000 characters.');
          if (input.action !== 'reject') {
            const message = addMessage(a.conversationId, text!, 'vendor');
            if (!message.ok) return message;
            if (input.action === 'edit') a.proposedReply = text!;
          }
          a.status =
            input.action === 'send' ? 'sent' : input.action === 'edit' ? 'edited' : 'rejected';
          emit('approvals', a.id);
          emit('insights', vendorId);
          return ok(a);
        }),
    },
    orders: {
      list: (input) =>
        run('orders', () =>
          page(
            state.orders.filter(
              (o) =>
                (!input?.status || o.status === input.status) &&
                matches(`${o.id} ${o.customerName}`, input),
            ),
            input,
          ),
        ),
      get: (key) => run('orders', () => find(state.orders, key)),
      setStatus: (input) =>
        run('orders', () => {
          const o = state.orders.find((o) => o.id === input.id);
          if (!o) return fail('NOT_FOUND', 'Order not found.');
          const transitions: Record<OrderStatus, OrderStatus[]> = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['processing', 'cancelled'],
            processing: ['shipped', 'cancelled'],
            shipped: ['delivered'],
            delivered: ['refunded'],
            cancelled: [],
            refunded: [],
          };
          if (o.status === input.status) return ok(o);
          if (!transitions[o.status].includes(input.status))
            return fail('CONFLICT', 'That order status transition is not allowed.');
          if (input.status !== 'cancelled' && o.paymentStatus !== 'paid')
            return fail('CONFLICT', 'Confirm payment before progressing this order.');
          o.status = input.status;
          emit('orders', o.id);
          emit('insights', vendorId);
          return ok(o);
        }),
      confirmPayment: (input) =>
        run('orders', () => {
          const o = state.orders.find((o) => o.id === input.id);
          if (!o) return fail('NOT_FOUND', 'Order not found.');
          if (input.source !== 'vendor')
            return fail('VALIDATION', 'Only explicit vendor confirmation is accepted here.');
          if (o.status === 'cancelled' || o.status === 'refunded')
            return fail('CONFLICT', 'This order cannot receive payment.');
          if (o.paymentStatus === 'unpaid') {
            o.paymentStatus = 'paid';
            o.paymentSource = 'vendor';
            emit('orders', o.id);
            emit('insights', vendorId);
          }
          return ok(o);
        }),
    },
    receipts: {
      list: (input) => run('receipts', () => page(state.receipts, input)),
      get: (key) => run('receipts', () => find(state.receipts, key)),
      issue: (input) =>
        run('receipts', () => {
          const existing = state.receipts.find((r) => r.orderId === input.orderId);
          if (existing) return ok(existing);
          const o = state.orders.find((o) => o.id === input.orderId);
          if (!o) return fail('NOT_FOUND', 'Order not found.');
          if (o.paymentStatus !== 'paid') return fail('CONFLICT', 'Confirmed payment is required.');
          const r = {
            id: id('receipt'),
            vendorId,
            orderId: o.id,
            number: state.receipts.reduce((n, r) => Math.max(n, r.number), 0) + 1,
            totalKobo: o.totalKobo,
            items: clone(o.items),
            deliveryFeeKobo: o.deliveryFeeKobo,
            customerName: o.customerName,
            issuedAt: new Date().toISOString(),
          };
          state.receipts.push(r);
          emit('receipts', r.id, 'created');
          return ok(r);
        }),
    },
    customers: {
      list: (input) =>
        run('customers', () =>
          page(
            state.customers.filter((c) => matches(`${c.name} ${c.city}`, input)),
            input,
          ),
        ),
      get: (key) => run('customers', () => find(state.customers, key)),
    },
    channels: { list: () => run('channels', () => ok(state.channels)) },
    settings: {
      get: () => run('settings', () => ok(state.settings)),
      update: (input) =>
        run('settings', () => {
          if (
            input.businessName !== undefined &&
            (input.businessName.trim().length < 2 || input.businessName.trim().length > 80)
          )
            return fail('VALIDATION', 'Business name must contain 2 to 80 characters.');
          if (
            input.businessType &&
            !['products', 'services', 'made-to-order', 'mixed'].includes(input.businessType)
          )
            return fail('VALIDATION', 'Unknown business type.');
          if (input.tone && !['friendly', 'professional', 'Pidgin-friendly'].includes(input.tone))
            return fail('VALIDATION', 'Unknown business tone.');
          if (input.autoNegotiation !== undefined && typeof input.autoNegotiation !== 'boolean')
            return fail('VALIDATION', 'Auto-negotiation must be on or off.');
          const allowed = [
            'greeting',
            'price',
            'availability',
            'variants',
            'delivery_info',
            'order_status',
            'alternatives',
          ];
          if (input.autoIntents?.some((intent) => !allowed.includes(intent)))
            return fail('VALIDATION', 'This intent needs vendor approval.');
          if (
            input.deliveryFees?.some(
              (f) =>
                !['Lagos', 'Abuja', 'Ibadan'].includes(f.city) ||
                !Number.isSafeInteger(f.feeKobo) ||
                f.feeKobo < 0,
            )
          )
            return fail('VALIDATION', 'Delivery fees must be non-negative integer kobo.');
          // Explicit allowlist: IDs/tenant scope cannot be overwritten by untyped callers.
          for (const key of [
            'businessName',
            'businessType',
            'tone',
            'autoNegotiation',
            'autoIntents',
            'deliveryFees',
          ] as const) {
            if (input[key] !== undefined)
              Object.assign(state.settings, { [key]: clone(input[key]) });
          }
          state.settings.businessName = state.settings.businessName.trim();
          emit('settings', state.settings.id);
          return ok(state.settings);
        }),
    },
    insights: {
      get: () =>
        run('insights', () => {
          const sales = state.orders.filter(
            (o) => o.paymentStatus === 'paid' && !['cancelled', 'refunded'].includes(o.status),
          );
          const days = new Map<string, number>();
          for (const o of sales) {
            const day = o.createdAt.slice(0, 10);
            days.set(day, (days.get(day) ?? 0) + o.totalKobo);
          }
          return ok({
            revenueKobo: sales.reduce((n, o) => n + o.totalKobo, 0),
            orderCount: state.orders.length,
            conversationCount: state.conversations.length,
            pendingApprovals: state.approvals.filter((a) => a.status === 'pending').length,
            dailySales: [...days].sort().map(([date, revenueKobo]) => ({ date, revenueKobo })),
            byChannel: state.channels.map((c) => ({
              channel: c.channel,
              conversations: state.conversations.filter((x) => x.channel === c.channel).length,
            })),
          });
        }),
    },
    team: {
      list: () => run('team', () => ok(state.team)),
      invite: (input) =>
        run('team', () => {
          if (
            !input.name.trim() ||
            !/^\S+@\S+\.\S+$/.test(input.email) ||
            !['manager', 'agent'].includes(input.role)
          )
            return fail('VALIDATION', 'Provide a name, email and manager/agent role.');
          if (state.team.some((m) => m.email.toLowerCase() === input.email.toLowerCase()))
            return fail('CONFLICT', 'This teammate already exists.');
          const m = {
            id: id('team'),
            vendorId,
            ...input,
            name: input.name.trim(),
            email: input.email.toLowerCase(),
            status: 'invited' as const,
          };
          state.team.push(m);
          emit('team', m.id, 'created');
          return ok(m);
        }),
    },
    billing: { get: () => run('billing', () => ok(state.billing)) },
    realtime: {
      subscribe: async (listener) => {
        if (disposed) return fail('UNAVAILABLE', 'This data session has ended.');
        listeners.add(listener);
        return { ok: true, data: () => listeners.delete(listener) };
      },
    },
    developer: {
      simulateIncoming: (input) =>
        run('messages', () => {
          const incoming = addMessage(
            input.conversationId,
            'Hello! Good afternoon, please.',
            'customer',
          );
          if (!incoming.ok) return incoming;
          const timer = setTimeout(() => {
            timers.delete(timer);
            const c = state.conversations.find((c) => c.id === input.conversationId);
            if (
              !disposed &&
              c?.status === 'open' &&
              state.settings.autoIntents.includes('greeting') &&
              (!c.humanModeUntil || Date.parse(c.humanModeUntil) <= Date.now())
            )
              addMessage(
                input.conversationId,
                `Hello! Welcome to ${state.settings.businessName}. How can we help you today?`,
                'ai',
              );
          }, options.replyDelayMs ?? 1200);
          timers.add(timer);
          return incoming;
        }),
      failNext: async (area) => {
        failures.add(area);
        return ok(null);
      },
    },
    dispose: async () => {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      listeners.clear();
    },
  };
  return client;
}
