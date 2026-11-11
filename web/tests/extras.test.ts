import { it, expect, afterEach } from 'vitest';
import { createMockClient, createApiClient, type DataClient, type Result } from '../lib/data';
import { createSeed } from '../lib/data/seed';
import { insightsReport, validRange, localDay } from '../lib/data/insights-logic';
const clients: DataClient[] = [];
const mock = () => {
  const c = createMockClient({ latencyMs: 0 });
  clients.push(c);
  return c;
};
function data<T>(r: Result<T>) {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.dispose();
});
it('computes all seven insight series from actual state and handles empty/date-limited ranges', async () => {
  const c = mock();
  const d = data(await c.insights.get());
  expect(d.byChannel.reduce((n, r) => n + r.conversations, 0)).toBe(40);
  expect(d.stages.reduce((n, r) => n + r.value, 0)).toBe(40);
  expect(d.responseSeconds).toBeGreaterThan(0);
  expect(d.responseSamples).toBeGreaterThanOrEqual(40);
  expect(d.handling.every((r) => r.value >= 0)).toBe(true);
  expect(d.topProducts.length).toBeGreaterThan(0);
  expect(d.hours.reduce((n, r) => n + r.value, 0)).toBeGreaterThanOrEqual(80);
  expect(d.dailySales.reduce((n, r) => n + r.revenueKobo, 0)).toBe(d.revenueKobo);
  const empty = data(await c.insights.get({ from: '2000-01-01', to: '2000-01-02' }));
  expect(empty.revenueKobo).toBe(0);
  expect(empty.responseSeconds).toBeNull();
  expect(empty.conversationCount).toBe(0);
  expect(empty.topProducts).toEqual([]);
  expect((await c.insights.get({ from: '2026-02-30', to: '2026-03-03' })).ok).toBe(false);
  expect(validRange({ from: '2026-11-11', to: '2026-11-10' })).toBe(false);
  expect(localDay('2026-11-09T23:30:00Z')).toBe('2026-11-10');
});
it('excludes unpaid/cancelled revenue and uses payment day and confirmed units', () => {
  const s = createSeed();
  s.orders = s.orders.slice(0, 3);
  for (const o of s.orders) {
    o.status = 'paid';
    o.paymentStatus = 'paid';
    o.paidAt = '2026-11-10T10:00:00Z';
    o.totalKobo = 10000;
    o.items = [
      { productId: 'product-1', name: 'Adire', quantity: 2, variantId: null, unitPriceKobo: 5000 },
    ];
  }
  s.orders[1].status = 'cancelled';
  s.orders[2].paymentStatus = 'unpaid';
  const d = insightsReport(s, { from: '2026-11-10', to: '2026-11-10' });
  expect(d.revenueKobo).toBe(10000);
  expect(d.topProducts).toEqual([{ label: 'Adire', value: 2 }]);
  expect(d.dailySales).toEqual([{ date: '2026-11-10', revenueKobo: 10000 }]);
});
it('configures follow-ups, reschedules pending only, protects takeover, sends/cancels idempotently and isolates sessions', async () => {
  const c = mock();
  const initial = data(await c.extras.get());
  expect(initial.followupSettings.enabled).toBe(false);
  expect(initial.followups.some((f) => f.status === 'sent')).toBe(true);
  const f = initial.followups[0];
  expect((await c.extras.followup({ id: f.id, action: 'simulate_send' })).ok).toBe(false);
  expect((await c.extras.configure({ enabled: true, afterHours: 1, style: 'friendly' })).ok).toBe(
    false,
  );
  data(await c.extras.configure({ enabled: true, afterHours: 72, style: 'Pidgin-friendly' }));
  const saved = data(await c.extras.get());
  expect(saved.followups[0].text).toContain('No pressure');
  expect(saved.followups.find((f) => f.status === 'sent')).toEqual(
    initial.followups.find((f) => f.status === 'sent'),
  );
  await c.conversations.setHumanMode({
    id: f.conversationId,
    until: new Date(Date.now() + 60000).toISOString(),
  });
  expect((await c.extras.followup({ id: f.id, action: 'simulate_send' })).ok).toBe(false);
  await c.conversations.setHumanMode({ id: f.conversationId, until: null });
  expect(data(await c.extras.followup({ id: f.id, action: 'simulate_send' })).status).toBe('sent');
  expect((await c.extras.followup({ id: f.id, action: 'simulate_send' })).ok).toBe(false);
  expect(
    data(await c.extras.followup({ id: initial.followups[1].id, action: 'cancel' })).status,
  ).toBe('cancelled');
  expect(data(await mock().extras.get()).followupSettings.enabled).toBe(false);
});
it('persists moderation and checks current catalogue stock before restock notifications', async () => {
  const c = mock();
  const s = data(await c.extras.get());
  expect(data(await c.extras.moderate({ id: s.flags[0].id, action: 'not_spam' })).status).toBe(
    'cleared',
  );
  expect((await c.extras.moderate({ id: s.flags[0].id, action: 'block' })).ok).toBe(false);
  expect(data(await c.extras.moderate({ id: s.flags[1].id, action: 'block' })).status).toBe(
    'blocked',
  );
  expect(data(await c.extras.notifyRestock({ id: s.restock[0].id })).status).toBe('notified');
  expect((await c.extras.notifyRestock({ id: s.restock[0].id })).ok).toBe(false);
  expect((await c.extras.notifyRestock({ id: 'missing' })).ok).toBe(false);
  const a = s.restock[1];
  const p = data(await c.catalogue.get(a.productId));
  data(
    await c.catalogue.update({
      id: p.id,
      expectedRevision: p.revision,
      product: { ...p, stock: 0, variants: p.variants.map((v) => ({ ...v, stock: 0 })) },
    }),
  );
  expect((await c.extras.notifyRestock({ id: a.id })).ok).toBe(false);
  expect(data(await c.extras.get()).flags.map((f) => f.status)).toEqual(['cleared', 'blocked']);
});
it('searches saved customer memory and supplies honest language summaries', async () => {
  const c = mock();
  const customer = data(await c.customers.get('customer-1'));
  data(
    await c.customers.update({
      id: customer.id,
      notes: 'Prefers indigo. Deliver after 5pm.',
      tags: ['repeat buyer'],
      flagged: false,
    }),
  );
  expect(data(await c.customers.list({ search: 'repeat buyer' })).items[0].id).toBe(customer.id);
  expect(data(await c.customers.list({ search: 'Deliver after' })).items[0].id).toBe(customer.id);
  const messages = data(await c.messages.list({ conversationId: 'conversation-1' })).items;
  expect(messages.find((m) => m.englishSummary?.includes('delivery'))?.englishSummary).toContain(
    'delivery',
  );
  expect((await c.customers.update({ ...customer, notes: 'x'.repeat(2001) })).ok).toBe(false);
});
it('API extras uses authenticated tenant headers with no mock fallback', async () => {
  const calls: string[] = [];
  const c = createApiClient({
    vendorId: 'vendor-a',
    getToken: async () => 'token',
    fetcher: (async (url, options) => {
      calls.push(String(url));
      expect(options?.headers).toMatchObject({
        'X-Vendor-Id': 'vendor-a',
        Authorization: 'Bearer token',
      });
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
  });
  expect(await c.extras.get()).toMatchObject({ ok: false, error: { code: 'NOT_IMPLEMENTED' } });
  await c.insights.get({ from: '2026-11-01', to: '2026-11-10' });
  expect(calls).toEqual(['/api/v1/extras', '/api/v1/insights?from=2026-11-01&to=2026-11-10']);
});
