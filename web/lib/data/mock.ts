import { extrasMock } from './extras-mock';
import { insightsReport, validRange } from './insights-logic';
import { settingsMock } from './settings-mock';
import { ordersMock } from './orders-mock';
import { inboxSimulator } from './inbox-simulator';
import { humanMode } from './inbox-logic';
import { catalogueMock } from './catalogue-mock';
import type { DataClient } from './contract';
import type { DataEvent, ID, ListInput, Message, Page, Result, ErrorCode } from './types';
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
  const later = (work: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) work();
    }, ms);
    timers.add(timer);
  };
  const simulate = inboxSimulator({
    state,
    vendorId,
    id,
    emit,
    addMessage,
    later,
    replyDelayMs: options.replyDelayMs ?? 1200,
  });
  function tick() {
    for (const c of state.conversations) {
      if (c.humanModeUntil && Date.parse(c.humanModeUntil) <= Date.now()) {
        c.humanModeUntil = null;
        emit('conversations', c.id);
      }
    }
    for (const a of state.approvals) {
      const c = state.conversations.find((c) => c.id === a.conversationId);
      if (
        a.status === 'pending' &&
        !a.holdingReplySentAt &&
        Date.parse(a.holdingReplyDueAt) <= Date.now() &&
        c?.status === 'open' &&
        !humanMode(c)
      ) {
        const r = addMessage(
          c.id,
          'Thanks for your patience. Our team will respond shortly.',
          'ai',
        );
        if (r.ok) {
          a.holdingReplySentAt = r.data.createdAt;
          emit('approvals', a.id);
        }
      }
    }
    later(tick, 1000);
  }
  later(tick, 1000);
  const configuration = settingsMock({ state, vendorId, id, run, emit });
  const commerce = ordersMock({ state, vendorId, id, run, emit, page, addMessage });
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
                  (!input?.stage || c.stage === input.stage) &&
                  (!input?.needsMe ||
                    state.approvals.some(
                      (a) => a.conversationId === c.id && a.status === 'pending',
                    )) &&
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
        run('messages', () => {
          if (!state.conversations.some((c) => c.id === input.conversationId))
            return fail('NOT_FOUND', 'Conversation not found.');
          const rows = state.messages
            .filter((m) => m.conversationId === input.conversationId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return page(rows, {
            ...input,
            offset: input.latest ? Math.max(0, rows.length - (input.limit ?? 50)) : input.offset,
          });
        }),
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
          if (
            input.action !== 'reject' &&
            a.facts.some(
              (f) =>
                f.sourceRevision !== undefined &&
                state.products.find((p) => p.id === f.sourceId)?.revision !== f.sourceRevision,
            )
          )
            return fail(
              'CONFLICT',
              'Catalogue facts changed. Reject this card and request a fresh proposal.',
            );
          if (input.action !== 'reject') {
            const message = addMessage(a.conversationId, text!, 'vendor');
            if (!message.ok) return message;
            if (input.action === 'edit') a.proposedReply = text!;
          }
          a.status =
            input.action === 'send' ? 'sent' : input.action === 'edit' ? 'edited' : 'rejected';
          emit('approvals', a.id);
          emit('conversations', a.conversationId);
          emit('insights', vendorId);
          return ok(a);
        }),
    },
    orders: commerce.orders,
    receipts: commerce.receipts,
    customers: {
      list: (input) =>
        run('customers', () =>
          page(
            state.customers.filter((c) =>
              matches(`${c.name} ${c.city} ${c.notes} ${c.tags.join(' ')}`, input),
            ),
            input,
          ),
        ),
      get: (key) => run('customers', () => find(state.customers, key)),
      update: (input) =>
        run('customers', () => {
          const c = state.customers.find((c) => c.id === input.id);
          if (!c) return fail('NOT_FOUND', 'Customer not found.');
          if (
            typeof input.notes !== 'string' ||
            input.notes.length > 2000 ||
            !Array.isArray(input.tags) ||
            input.tags.length > 10 ||
            input.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 30) ||
            typeof input.flagged !== 'boolean'
          )
            return fail(
              'VALIDATION',
              'Use notes up to 2,000 characters and at most ten tags of 1–30 characters.',
            );
          c.notes = input.notes.trim();
          c.tags = [...new Set(input.tags.map((t) => t.trim()))];
          c.flagged = input.flagged;
          emit('customers', c.id);
          return ok(c);
        }),
    },
    channels: configuration.channels,
    settings: configuration.settings,
    extras: extrasMock(state, run, emit),
    insights: {
      get: (range) =>
        run('insights', () =>
          range && !validRange(range)
            ? fail('VALIDATION', 'Choose valid start and end dates in order.')
            : ok(insightsReport(state, range)),
        ),
    },
    team: configuration.team,
    billing: configuration.billing,
    realtime: {
      subscribe: async (listener) => {
        if (disposed) return fail('UNAVAILABLE', 'This data session has ended.');
        listeners.add(listener);
        return { ok: true, data: () => listeners.delete(listener) };
      },
    },
    developer: {
      simulateInviteAccepted: (input) => configuration.acceptInvite(input.memberId),
      simulateIncoming: (input) => run('messages', () => simulate(input)),
      simulatePaymentScreenshot: (input) => commerce.screenshot(input.orderId),
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
