import { it, expect, afterEach, vi } from 'vitest';
import { createMockClient, type DataClient, type Result } from '../lib/data';
import { humanMode, channelLink } from '../lib/data/inbox-logic';
const clients: DataClient[] = [];
function mock() {
  const c = createMockClient({ latencyMs: 0, replyDelayMs: 50 });
  clients.push(c);
  return c;
}
function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.dispose();
  vi.useRealTimers();
});
it('combines channel/stage/needs-me/search filters and preserves tenant scope', async () => {
  const c = mock();
  const all = data(await c.conversations.list());
  expect(new Set(all.items.map((c) => c.stage)).size).toBe(5);
  const pending = data(await c.conversations.list({ needsMe: true }));
  expect(pending.total).toBe(5);
  const row = pending.items[0];
  const filtered = data(
    await c.conversations.list({
      channel: row.channel,
      stage: row.stage,
      needsMe: true,
      search: row.customerName,
    }),
  );
  expect(filtered.items.map((c) => c.id)).toEqual([row.id]);
  expect(filtered.items[0].vendorId).toBe(c.vendorId);
  await c.approvals.decide({ id: 'approval-1', action: 'reject' });
  expect(data(await c.conversations.list({ needsMe: true })).total).toBe(4);
});
it('pauses scheduled AI, resumes new replies after hand-back and expiry, and scopes takeover per chat', async () => {
  vi.useFakeTimers();
  const c = mock();
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await c.conversations.setHumanMode({
    id: 'conversation-1',
    until: new Date(Date.now() + 2000).toISOString(),
  });
  await vi.advanceTimersByTimeAsync(60);
  let messages = data(await c.messages.list({ conversationId: 'conversation-1' }));
  expect(messages.items.at(-1)?.sender).toBe('customer');
  await c.developer!.simulateIncoming({ conversationId: 'conversation-2' });
  await vi.advanceTimersByTimeAsync(60);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-2' })).items.at(-1)?.sender,
  ).toBe('ai');
  await c.conversations.setHumanMode({ id: 'conversation-1', until: null });
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(60);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)?.sender,
  ).toBe('ai');
  await c.conversations.setHumanMode({
    id: 'conversation-1',
    until: new Date(Date.now() + 100).toISOString(),
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(data(await c.conversations.get('conversation-1')).humanModeUntil).toBe(null);
});
it('sends a holding reply once at five minutes, defers it in human mode and cancels decided cards', async () => {
  vi.useFakeTimers();
  const c = mock();
  await c.approvals.decide({ id: 'approval-2', action: 'reject' });
  await c.conversations.setHumanMode({
    id: 'conversation-1',
    until: new Date(Date.now() + 600000).toISOString(),
  });
  await vi.advanceTimersByTimeAsync(241000);
  let a = data(await c.approvals.list()).items;
  expect(a.find((a) => a.id === 'approval-1')!.holdingReplySentAt).toBeNull();
  expect(a.find((a) => a.id === 'approval-2')!.holdingReplySentAt).toBeNull();
  expect(a.find((a) => a.id === 'approval-3')!.holdingReplySentAt).not.toBeNull();
  await c.conversations.setHumanMode({ id: 'conversation-1', until: null });
  await vi.advanceTimersByTimeAsync(1000);
  expect(data(await c.approvals.list()).items[0].holdingReplySentAt).not.toBeNull();
  await vi.advanceTimersByTimeAsync(300000);
  const m = data(await c.messages.list({ conversationId: 'conversation-1' }));
  expect(
    m.items.filter((m) => m.text === 'Thanks for your patience. Our team will respond shortly.'),
  ).toHaveLength(1);
});
it('supports edit/send/reject exactly once and blocks stale catalogue facts', async () => {
  const c = mock();
  const before = data(await c.messages.list({ conversationId: 'conversation-1' })).total;
  expect(
    (await c.approvals.decide({ id: 'approval-1', action: 'edit', editedReply: '  ' })).ok,
  ).toBe(false);
  expect(
    (
      await c.approvals.decide({
        id: 'approval-1',
        action: 'edit',
        editedReply: 'I will check the bulk quantity myself.',
      })
    ).ok,
  ).toBe(true);
  expect(data(await c.messages.list({ conversationId: 'conversation-1' })).total).toBe(before + 1);
  expect((await c.approvals.decide({ id: 'approval-1', action: 'send' })).ok).toBe(false);
  const p = data(await c.catalogue.get('product-1'));
  const { id, vendorId, revision, archived, ...input } = p;
  await c.catalogue.update({
    id,
    expectedRevision: revision,
    product: { ...input, stock: input.stock === null ? null : input.stock + 1, variants: [] },
  });
  expect((await c.approvals.decide({ id: 'approval-3', action: 'send' })).ok).toBe(false);
  expect((await c.approvals.decide({ id: 'approval-3', action: 'reject' })).ok).toBe(true);
});
it('simulates factual product/order cards, original-language voice, ready to pay and approval without claiming payment', async () => {
  vi.useFakeTimers();
  const c = mock();
  for (const scenario of ['product', 'voice', 'order', 'ready_to_pay', 'approval'] as const) {
    await c.developer!.simulateIncoming({ conversationId: 'conversation-1', scenario });
    await vi.advanceTimersByTimeAsync(60);
  }
  const m = data(await c.messages.list({ conversationId: 'conversation-1', limit: 100 }));
  expect(m.items.some((m) => m.product?.name === 'Indigo Adire Set')).toBe(true);
  expect(m.items.some((m) => m.order?.id === 'order-1')).toBe(true);
  expect(m.items.some((m) => m.kind === 'voice' && m.language === 'pcm')).toBe(true);
  expect(data(await c.conversations.get('conversation-1')).stage).toBe('ready_to_pay');
  expect(data(await c.orders.get('order-1')).paymentStatus).toBe('unpaid');
  expect(data(await c.approvals.list({ status: 'pending' })).total).toBe(7);
  const p = data(await c.approvals.list()).items.at(-1)!;
  expect(p.facts.map((f) => f.label)).toEqual(['Product', 'Price', 'Stock', 'Floor']);
  await vi.advanceTimersByTimeAsync(301000);
  expect(data(await c.approvals.list()).items.at(-1)!.holdingReplySentAt).not.toBeNull();
});
it('validates and persists customer notes/tags/flag without cross-customer updates', async () => {
  const c = mock();
  expect(
    (
      await c.customers.update({
        id: 'customer-1',
        notes: 'Abuja delivery preferred',
        tags: ['VIP', 'VIP'],
        flagged: true,
      })
    ).ok,
  ).toBe(true);
  const customer = data(await c.customers.get('customer-1'));
  expect(customer.tags).toEqual(['VIP']);
  expect(customer.flagged).toBe(true);
  expect(data(await c.customers.get('customer-2')).notes).toBe('');
  expect((await c.customers.update({ ...customer, tags: ['x'.repeat(31)] })).ok).toBe(false);
  expect((await c.customers.update({ ...customer, id: 'not-here' })).ok).toBe(false);
});
it('shows latest messages after long chats, and clears timers on disposal', async () => {
  vi.useFakeTimers();
  const c = mock();
  for (let i = 0; i < 110; i++)
    await c.messages.send({ conversationId: 'conversation-1', text: `Vendor message ${i}` });
  const page = data(
    await c.messages.list({ conversationId: 'conversation-1', latest: true, limit: 100 }),
  );
  expect(page.items.at(-1)?.text).toBe('Vendor message 109');
  expect(page.offset).toBeGreaterThan(0);
  await c.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('only opens trusted channel deep links and clearly falls back without a customer link', async () => {
  const c = mock();
  const row = data(await c.conversations.get('conversation-1'));
  expect(humanMode(row)).toBe(false);
  expect(channelLink({ ...row, threadUrl: 'javascript:alert(1)' }).exact).toBe(false);
  expect(channelLink({ ...row, threadUrl: 'https://wa.me/2348000000000' })).toEqual({
    url: 'https://wa.me/2348000000000',
    exact: true,
  });
  expect(channelLink({ ...row, threadUrl: 'https://evil.test/' }).exact).toBe(false);
});
