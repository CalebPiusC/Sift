import type { createSeed } from './seed';
import type { DataEvent, ID, Message, Result } from './types';
import type { MockControls } from './contract';
import { isBusinessOpen } from './settings-logic';
import { humanMode } from './inbox-logic';
import { naira } from './money';
type Context = {
  state: ReturnType<typeof createSeed>;
  vendorId: ID;
  id: (prefix: string) => ID;
  emit: (area: DataEvent['area'], id: ID, type?: DataEvent['type']) => void;
  addMessage: (conversationId: ID, text: string, sender: Message['sender']) => Result<Message>;
  later: (work: () => void, ms: number) => void;
  replyDelayMs: number;
};
export function inboxSimulator(
  ctx: Context,
): (input: Parameters<MockControls['simulateIncoming']>[0]) => Result<Message> {
  const { state, vendorId, id, emit, addMessage, later } = ctx;
  return (input) => {
    const c = state.conversations.find((c) => c.id === input.conversationId);
    if (!c)
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found.', retryable: false },
      };
    const scenario = input.scenario ?? 'greeting';
    const text = {
      greeting: 'Hello! Good afternoon, please.',
      product: 'Please show me the indigo adire set.',
      ready_to_pay: 'I am ready to pay. Please send payment details.',
      approval: 'Can you do a special bulk price for 40 pieces?',
      voice: 'Abeg, I wan ask about this adire.',
      order: 'Please show my order summary.',
    }[scenario];
    const incoming = addMessage(c.id, text, 'customer');
    if (!incoming.ok) return incoming;
    if (scenario === 'voice') {
      const m = state.messages.find((m) => m.id === incoming.data.id)!;
      m.kind = 'voice';
      m.language = 'pcm';
      m.voice = { durationSeconds: 12, transcript: text, audioUrl: null };
      incoming.data = structuredClone(m);
    }
    if (scenario === 'ready_to_pay') {
      c.stage = 'ready_to_pay';
      emit('conversations', c.id);
    }
    if (scenario === 'product') {
      c.stage = 'interested';
      emit('conversations', c.id);
    }
    later(() => {
      if (c.status !== 'open' || humanMode(c)) return;
      if (scenario === 'approval' || scenario === 'ready_to_pay') {
        const p = state.products.find((p) => !p.archived && p.name === 'Indigo Adire Set');
        if (
          state.approvals.some(
            (a) =>
              a.conversationId === c.id &&
              a.status === 'pending' &&
              a.messageId === incoming.data.id,
          )
        )
          return;
        const a = {
          id: id('approval'),
          vendorId,
          conversationId: c.id,
          messageId: incoming.data.id,
          customerMessage: text,
          facts: p
            ? [
                { label: 'Product', value: p.name, sourceId: p.id, sourceRevision: p.revision },
                {
                  label: 'Price',
                  value: naira(p.priceKobo),
                  sourceId: p.id,
                  sourceRevision: p.revision,
                },
                {
                  label: 'Stock',
                  value: p.stock === null ? 'Not tracked' : String(p.stock),
                  sourceId: p.id,
                  sourceRevision: p.revision,
                },
                {
                  label: 'Floor',
                  value: naira(p.lowestPriceKobo),
                  sourceId: p.id,
                  sourceRevision: p.revision,
                },
              ]
            : [],
          proposedReply:
            scenario === 'ready_to_pay'
              ? 'Thank you! I will confirm the payment instructions with you shortly.'
              : 'Thank you! Let me check the bulk price and fulfilment with our team.',
          reason:
            scenario === 'ready_to_pay' ? ('unverified_facts' as const) : ('bulk_order' as const),
          confidence: 0.7,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
          holdingReplyDueAt: new Date(Date.now() + 300000).toISOString(),
          holdingReplySentAt: null,
        };
        state.approvals.push(a);
        emit('approvals', a.id, 'created');
        return;
      }
      if (!isBusinessOpen(state.settings.businessHours)) {
        if (state.settings.autoIntents.includes('greeting'))
          addMessage(c.id, state.settings.businessHours.awayMessage, 'ai');
        return;
      }
      if (scenario === 'product') {
        if (!state.settings.autoIntents.includes('price')) return;
        const p = state.products.find((p) => !p.archived && p.name === 'Indigo Adire Set');
        if (!p) return;
        const result = addMessage(c.id, `Here is ${p.name} from our catalogue.`, 'ai');
        if (result.ok) {
          state.messages.find((m) => m.id === result.data.id)!.product = {
            id: p.id,
            name: p.name,
            priceKobo: p.priceKobo,
            stock: p.stock,
            revision: p.revision,
          };
          emit('messages', result.data.id);
        }
        return;
      }
      if (scenario === 'order') {
        if (!state.settings.autoIntents.includes('order_status')) return;
        const o = state.orders.find((o) => o.customerId === c.customerId);
        if (!o) return;
        const r = addMessage(c.id, 'Here is your order summary.', 'ai');
        if (r.ok) {
          state.messages.find((m) => m.id === r.data.id)!.order = {
            id: o.id,
            items: structuredClone(o.items),
            totalKobo: o.totalKobo,
            paymentStatus: o.paymentStatus,
            status: o.status,
          };
          emit('messages', r.data.id);
        }
        return;
      }
      if (state.settings.autoIntents.includes('greeting'))
        addMessage(
          c.id,
          state.settings.replyLanguages.length === 1 && state.settings.replyLanguages[0] === 'pcm'
            ? `Welcome to ${state.settings.businessName}! How we fit help you today?`
            : state.settings.tone === 'professional'
              ? `Good day. Welcome to ${state.settings.businessName}. How may we assist you?`
              : `Hello! Welcome to ${state.settings.businessName}. How can we help you today?`,
          'ai',
        );
    }, ctx.replyDelayMs);
    return incoming;
  };
}
