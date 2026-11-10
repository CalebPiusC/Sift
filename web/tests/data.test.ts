import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMockClient, createApiClient, type Result, type DataClient } from '../lib/data';
import { parseDataMode } from '../lib/data/mode';
function value<T>(r: Result<T>): T {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
const clients: DataClient[] = [];
function mock(options: Parameters<typeof createMockClient>[0] = {}) {
  const c = createMockClient({ latencyMs: 0, ...options });
  clients.push(c);
  return c;
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.dispose();
  vi.useRealTimers();
});
describe('sample seed and contract', () => {
  it('contains 25 mixed products, 40 conversations/customers, five channels and voice transcripts', async () => {
    const c = mock();
    const products = value(await c.catalogue.list());
    expect(products.total).toBe(25);
    expect(new Set(products.items.map((p) => p.category)).size).toBe(7);
    expect(
      products.items.every(
        (p) => Number.isSafeInteger(p.priceKobo) && p.lowestPriceKobo <= p.priceKobo,
      ),
    ).toBe(true);
    expect(products.items.some((p) => p.stock === 0)).toBe(true);
    expect(new Set(products.items.map((p) => p.kind)).size).toBe(3);
    const conversations = value(await c.conversations.list());
    expect(conversations.total).toBe(40);
    expect(new Set(conversations.items.map((c) => c.channel)).size).toBe(5);
    const customers = value(await c.customers.list());
    expect(customers.total).toBe(40);
    expect(new Set(customers.items.map((c) => c.city)).size).toBe(3);
    const messages = value(await c.messages.list({ conversationId: 'conversation-1' }));
    expect(messages.items.some((m) => m.voice?.transcript && m.voice.audioUrl === null)).toBe(true);
    expect(new Set(messages.items.map((m) => m.sender))).toEqual(new Set(['ai', 'customer']));
    expect(value(await c.channels.list())).toHaveLength(5);
    expect(value(await c.approvals.list({ status: 'pending' })).total).toBe(5);
  });
  it('covers every order state with consistent line totals and immutable receipt copies', async () => {
    const c = mock();
    const orders = value(await c.orders.list());
    expect(new Set(orders.items.map((o) => o.status)).size).toBe(7);
    for (const o of orders.items)
      expect(o.totalKobo).toBe(
        o.items.reduce((n, i) => n + i.quantity * i.unitPriceKobo, 0) + o.deliveryFeeKobo,
      );
    const receipts = value(await c.receipts.list());
    expect(receipts.items.map((r) => r.number)).toEqual(receipts.items.map((_, i) => i + 1));
    const r = receipts.items[0];
    r.items[0].name = 'Changed';
    expect(value(await c.receipts.get(r.id)).items[0].name).not.toBe('Changed');
  });
  it('supports search, pagination and filters without leaking mutable references', async () => {
    const c = mock();
    expect(value(await c.catalogue.list({ category: 'Fashion' })).total).toBe(5);
    expect(value(await c.catalogue.list({ search: 'adire' })).total).toBe(2);
    expect(value(await c.conversations.list({ channel: 'email' })).total).toBe(8);
    expect(value(await c.conversations.list({ offset: 5, limit: 3 })).items).toHaveLength(3);
    expect((await c.catalogue.list({ limit: 101 })).ok).toBe(false);
    expect((await c.catalogue.get('missing')).ok).toBe(false);
    expect((await c.messages.list({ conversationId: 'missing' })).ok).toBe(false);
    const p = value(await c.catalogue.get('product-1'));
    p.priceKobo = 1;
    expect(value(await c.catalogue.get('product-1')).priceKobo).toBe(2500000);
  });
  it('can query every contract area, get detail and report accurate insights', async () => {
    const c = mock();
    expect(value(await c.conversations.get('conversation-1')).customerId).toBe('customer-1');
    expect(value(await c.customers.get('customer-1')).name).toBe('Chidinma Okafor');
    expect(value(await c.orders.get('order-1')).status).toBe('pending');
    expect(value(await c.settings.get()).autoNegotiation).toBe(false);
    expect(value(await c.team.list())).toHaveLength(3);
    expect(value(await c.billing.get()).plan).toBe('growth');
    const insights = value(await c.insights.get());
    expect(insights.conversationCount).toBe(40);
    expect(insights.orderCount).toBe(21);
    expect(insights.pendingApprovals).toBe(5);
    expect(insights.byChannel.every((c) => c.conversations === 8)).toBe(true);
    expect(insights.revenueKobo).toBe(insights.dailySales.reduce((n, d) => n + d.revenueKobo, 0));
  });
  it('isolates clients and handles recoverable errors', async () => {
    const c = mock();
    const b = mock({ vendorId: 'other-sample' });
    await c.developer!.failNext('catalogue');
    const error = await c.catalogue.list();
    expect(error).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE', retryable: true } });
    expect((await c.catalogue.list()).ok).toBe(true);
    await c.messages.send({ conversationId: 'conversation-1', text: 'Vendor reply' });
    expect(
      value(await b.messages.list({ conversationId: 'conversation-1' })).items.some(
        (m) => m.text === 'Vendor reply',
      ),
    ).toBe(false);
    expect(value(await b.catalogue.get('product-1')).vendorId).toBe('other-sample');
  });
});
describe('async mutations and events', () => {
  it('sends vendor messages, marks read and validates empty text', async () => {
    const c = mock();
    expect((await c.messages.send({ conversationId: 'conversation-1', text: '  ' })).ok).toBe(
      false,
    );
    expect(
      value(await c.messages.send({ conversationId: 'conversation-1', text: 'Thank you!' })).sender,
    ).toBe('vendor');
    expect(value(await c.conversations.markRead('conversation-1')).unreadCount).toBe(0);
  });
  it('simulates a live incoming message then a delayed AI greeting', async () => {
    vi.useFakeTimers();
    const c = mock({ replyDelayMs: 1000 });
    const events: string[] = [];
    const unsub = value(await c.realtime.subscribe((e) => events.push(e.area)));
    await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
    let items = value(await c.messages.list({ conversationId: 'conversation-1' })).items;
    expect(items.at(-1)?.sender).toBe('customer');
    expect(events).toContain('messages');
    await vi.advanceTimersByTimeAsync(1000);
    items = value(await c.messages.list({ conversationId: 'conversation-1' })).items;
    expect(items.at(-1)?.sender).toBe('ai');
    unsub();
    events.length = 0;
    await c.messages.send({ conversationId: 'conversation-1', text: 'Okay' });
    expect(events).toHaveLength(0);
  });
  it('rechecks chat takeover at reply time and cancels timers on dispose', async () => {
    vi.useFakeTimers();
    const c = mock({ replyDelayMs: 100 });
    await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
    await c.conversations.setHumanMode({
      id: 'conversation-1',
      until: new Date(Date.now() + 10000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(
      value(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)?.sender,
    ).toBe('customer');
    await c.conversations.setHumanMode({ id: 'conversation-1', until: null });
    await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
    await c.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect((await c.catalogue.list()).ok).toBe(false);
  });
  it('supports Send / Edit / Reject approvals and blocks repeated decisions', async () => {
    const c = mock();
    expect(value(await c.approvals.decide({ id: 'approval-1', action: 'send' })).status).toBe(
      'sent',
    );
    expect(
      value(
        await c.approvals.decide({
          id: 'approval-2',
          action: 'edit',
          editedReply: 'Let me check the quantity.',
        }),
      ).status,
    ).toBe('edited');
    expect(value(await c.approvals.decide({ id: 'approval-3', action: 'reject' })).status).toBe(
      'rejected',
    );
    expect((await c.approvals.decide({ id: 'approval-1', action: 'send' })).ok).toBe(false);
    expect(
      (await c.approvals.decide({ id: 'approval-4', action: 'edit', editedReply: '' })).ok,
    ).toBe(false);
    expect(value(await c.insights.get()).pendingApprovals).toBe(2);
  });
  it('only explicit vendor payment permits order progression and receipt issuance', async () => {
    const c = mock();
    expect((await c.orders.setStatus({ id: 'order-1', status: 'confirmed' })).ok).toBe(false);
    expect((await c.receipts.issue({ orderId: 'order-1' })).ok).toBe(false);
    expect(
      value(await c.orders.confirmPayment({ id: 'order-1', source: 'vendor' })).paymentSource,
    ).toBe('vendor');
    expect(value(await c.orders.setStatus({ id: 'order-1', status: 'confirmed' })).status).toBe(
      'confirmed',
    );
    expect((await c.orders.setStatus({ id: 'order-1', status: 'delivered' })).ok).toBe(false);
    const [a, b] = await Promise.all([
      c.receipts.issue({ orderId: 'order-1' }),
      c.receipts.issue({ orderId: 'order-1' }),
    ]);
    expect(value(a).id).toBe(value(b).id);
  });
  it('validates settings, tenant scope and team invitations', async () => {
    const c = mock();
    expect((await c.settings.update({ businessName: 'X' })).ok).toBe(false);
    expect((await c.settings.update({ deliveryFees: [{ city: 'Lagos', feeKobo: -1 }] })).ok).toBe(
      false,
    );
    expect(
      value(await c.settings.update({ tone: 'professional', businessName: 'Tola Studio' })).tone,
    ).toBe('professional');
    expect(
      value(await c.team.invite({ name: 'Bisi Cole', email: 'bisi@example.test', role: 'agent' }))
        .status,
    ).toBe('invited');
    expect(
      (await c.team.invite({ name: 'Bisi Cole', email: 'bisi@example.test', role: 'agent' })).ok,
    ).toBe(false);
  });
});
describe('API switch never silently seeds', () => {
  it('validates the single server-side switch', () => {
    expect(parseDataMode(undefined)).toBe('mock');
    expect(parseDataMode('api')).toBe('api');
    expect(() => parseDataMode('other')).toThrow();
  });
  it('sends same-origin authenticated requests and encodes IDs/filters', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, data: { items: [], total: 0, offset: 0, limit: 50 } }),
        ),
      );
    const c = createApiClient({ vendorId: 'tenant-a', getToken: async () => 'token', fetcher });
    expect(c.developer).toBeNull();
    expect((await c.catalogue.list({ search: 'adire & aso' })).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/catalogue?search=adire+%26+aso',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'X-Vendor-Id': 'tenant-a',
          Authorization: 'Bearer token',
        }),
      }),
    );
  });
  it('returns honest errors for missing API, auth, transport and realtime', async () => {
    const c = createApiClient({
      vendorId: 'a',
      getToken: async () => 'token',
      fetcher: vi.fn().mockResolvedValue(new Response('', { status: 404 })),
    });
    expect(await c.catalogue.list()).toMatchObject({
      ok: false,
      error: { code: 'NOT_IMPLEMENTED' },
    });
    expect(await c.realtime.subscribe(() => {})).toMatchObject({
      ok: false,
      error: { code: 'NOT_IMPLEMENTED' },
    });
    const unauth = createApiClient({ vendorId: '', getToken: async () => null });
    expect(await unauth.settings.get()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const offline = createApiClient({
      vendorId: 'a',
      getToken: async () => 't',
      fetcher: vi.fn().mockRejectedValue(new Error('private error')),
    });
    expect(await offline.orders.list()).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });
});
it('API adapter maps every contract operation and preserves typed error envelopes', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: null })));
  const c = createApiClient({ vendorId: 'tenant', getToken: async () => 'token', fetcher });
  const cases: [() => Promise<unknown>, string, string][] = [
    [() => c.catalogue.get('p/1'), 'catalogue/p%2F1', 'GET'],
    [() => c.conversations.list(), 'conversations', 'GET'],
    [() => c.conversations.get('c'), 'conversations/c', 'GET'],
    [() => c.conversations.markRead('c'), 'conversations/c/read', 'POST'],
    [
      () => c.conversations.setHumanMode({ id: 'c', until: null }),
      'conversations/c/human-mode',
      'PATCH',
    ],
    [() => c.messages.list({ conversationId: 'c' }), 'messages?conversationId=c', 'GET'],
    [() => c.messages.send({ conversationId: 'c', text: 'Hello' }), 'messages', 'POST'],
    [() => c.approvals.list(), 'approvals', 'GET'],
    [() => c.approvals.decide({ id: 'a', action: 'reject' }), 'approvals/a/decision', 'POST'],
    [() => c.orders.list(), 'orders', 'GET'],
    [() => c.orders.get('o'), 'orders/o', 'GET'],
    [() => c.orders.setStatus({ id: 'o', status: 'confirmed' }), 'orders/o/status', 'PATCH'],
    [() => c.orders.confirmPayment({ id: 'o', source: 'vendor' }), 'orders/o/payment', 'POST'],
    [() => c.receipts.list(), 'receipts', 'GET'],
    [() => c.receipts.get('r'), 'receipts/r', 'GET'],
    [() => c.receipts.issue({ orderId: 'o' }), 'receipts', 'POST'],
    [() => c.customers.list(), 'customers', 'GET'],
    [() => c.customers.get('u'), 'customers/u', 'GET'],
    [() => c.channels.list(), 'channels', 'GET'],
    [() => c.settings.get(), 'settings', 'GET'],
    [() => c.settings.update({ tone: 'friendly' }), 'settings', 'PATCH'],
    [() => c.insights.get(), 'insights', 'GET'],
    [() => c.team.list(), 'team', 'GET'],
    [
      () => c.team.invite({ name: 'Ada', email: 'ada@example.test', role: 'agent' }),
      'team/invitations',
      'POST',
    ],
    [() => c.billing.get(), 'billing', 'GET'],
  ];
  for (const [operation, path, method] of cases) {
    await operation();
    expect(fetcher).toHaveBeenLastCalledWith(
      `/api/v1/${path}`,
      expect.objectContaining({ method }),
    );
  }
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Order not found.', retryable: false },
      }),
      { status: 404 },
    ),
  );
  expect(await c.orders.get('missing')).toEqual({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Order not found.', retryable: false },
  });
});
