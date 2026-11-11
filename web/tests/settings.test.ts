import { it, expect, vi, afterEach } from 'vitest';
import { createMockClient, type DataClient, type Result } from '../lib/data';
import { counterOffer, isBusinessOpen } from '../lib/data/settings-logic';
const clients: DataClient[] = [];
function mock() {
  const c = createMockClient({ latencyMs: 0, replyDelayMs: 10 });
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
it('simulates channel connect/reconnect, never changes ownership and leaves TikTok unconnected', async () => {
  const c = mock();
  for (const channel of ['whatsapp', 'instagram', 'facebook', 'email'] as const) {
    const flow = data(await c.channels.begin({ channel }));
    expect(data(await c.channels.complete({ attemptId: flow.id }))).toMatchObject({
      channel,
      status: 'connected',
      ownAccount: true,
    });
    expect((await c.channels.complete({ attemptId: flow.id })).ok).toBe(true);
  }
  const t = data(await c.channels.begin({ channel: 'tiktok' }));
  expect(await c.channels.complete({ attemptId: t.id })).toMatchObject({
    ok: false,
    error: { code: 'NOT_IMPLEMENTED' },
  });
  expect(data(await c.channels.list()).find((c) => c.channel === 'tiktok')!.status).toBe(
    'disconnected',
  );
  expect((await c.channels.complete({ attemptId: 'missing' })).ok).toBe(false);
});
it('expires/replaces connection flows and helper codes at ten minutes without linking the customer account', async () => {
  vi.useFakeTimers();
  const c = mock();
  const a = data(await c.channels.begin({ channel: 'instagram' }));
  const b = data(await c.channels.begin({ channel: 'instagram' }));
  expect((await c.channels.complete({ attemptId: a.id })).ok).toBe(false);
  await vi.advanceTimersByTimeAsync(600001);
  expect((await c.channels.complete({ attemptId: b.id })).ok).toBe(false);
  const before = data(await c.channels.list());
  expect(data(await c.channels.helper())).toBeNull();
  const code = data(await c.channels.newHelperCode());
  expect(code.code).toMatch(/^\d{4}$/);
  expect(Date.parse(code.expiresAt) - Date.now()).toBe(600000);
  expect(code.helperNumber).toBeNull();
  const replacement = data(await c.channels.newHelperCode());
  expect(replacement.code).not.toBe(code.code);
  expect((await c.channels.confirmHelper({ id: code.id })).ok).toBe(false);
  await vi.advanceTimersByTimeAsync(600001);
  expect((await c.channels.confirmHelper({ id: replacement.id })).ok).toBe(false);
  const fresh = data(await c.channels.newHelperCode());
  expect(data(await c.channels.confirmHelper({ id: fresh.id })).status).toBe('linked');
  expect(data(await c.channels.list())).toEqual(before);
  expect(data(await c.channels.helper())!.status).toBe('linked');
});
it('persists all reply controls/preferences with validation and no approve-all or tenant escape', async () => {
  const c = mock();
  const s = data(await c.settings.get());
  expect(s.autoNegotiation).toBe(false);
  const prefs = {
    ...s.preferences,
    lowData: true,
    darkMode: true,
    language: 'pcm' as const,
    notifications: { readyToPay: false, needsYou: true },
  };
  data(
    await c.settings.update({
      tone: 'professional',
      autoNegotiation: true,
      autoIntents: ['greeting'],
      replyLanguages: ['pcm'],
      preferences: prefs,
    }),
  );
  const saved = data(await c.settings.get());
  expect(saved.preferences).toEqual(prefs);
  expect(saved.autoIntents).toEqual(['greeting']);
  expect(saved.replyLanguages).toEqual(['pcm']);
  expect((await c.settings.update({ autoIntents: ['approve_everything' as 'greeting'] })).ok).toBe(
    false,
  );
  expect((await c.settings.update({ replyLanguages: [] })).ok).toBe(false);
  expect((await c.settings.update({ preferences: { ...prefs, language: 'xx' as 'en' } })).ok).toBe(
    false,
  );
  await c.settings.update({
    vendorId: 'evil',
    autoApprove: true,
    preferences: { ...prefs, secretExtra: true },
  } as never);
  const safe = data(await c.settings.get());
  expect(safe.vendorId).toBe(c.vendorId);
  expect(safe).not.toHaveProperty('autoApprove');
  expect(safe.preferences).not.toHaveProperty('secretExtra');
  const other = mock();
  expect(data(await other.settings.get()).preferences.lowData).toBe(false);
});
it('validates same-day WAT business hours and implements closed-hours away responses without bypassing approval/takeover', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  const c = mock();
  const s = data(await c.settings.get());
  const h = {
    ...s.businessHours,
    enabled: true,
    awayMessage: 'We are away. We will respond during business hours.',
    days: s.businessHours.days.map((d) => ({ ...d, closed: true })),
  };
  data(await c.settings.update({ businessHours: h }));
  expect(isBusinessOpen(h)).toBe(false);
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(20);
  expect(data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)!.text).toBe(
    h.awayMessage,
  );
  await c.conversations.setHumanMode({
    id: 'conversation-1',
    until: new Date(Date.now() + 60000).toISOString(),
  });
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(20);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)!.sender,
  ).toBe('customer');
  await c.developer!.simulateIncoming({ conversationId: 'conversation-2', scenario: 'approval' });
  await vi.advanceTimersByTimeAsync(20);
  expect(data(await c.approvals.list({ status: 'pending' })).total).toBe(6);
  const invalid = {
    ...h,
    days: h.days.map((d) => ({ ...d, closed: false, opens: '18:00', closes: '09:00' })),
  };
  expect((await c.settings.update({ businessHours: invalid })).ok).toBe(false);
  const monday = {
    ...h,
    days: h.days.map((d) => ({ ...d, closed: false, opens: '09:00', closes: '18:00' })),
  };
  expect(isBusinessOpen(monday, new Date('2026-11-10T08:00:00Z'))).toBe(true);
  expect(isBusinessOpen(monday, new Date('2026-11-10T17:00:00Z'))).toBe(false);
});
it('honours intent/tone/language templates in routine mock replies', async () => {
  vi.useFakeTimers();
  const c = mock();
  await c.settings.update({ autoIntents: [] });
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(20);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)!.sender,
  ).toBe('customer');
  await c.settings.update({ autoIntents: ['greeting'], tone: 'professional' });
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(20);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)!.text,
  ).toContain('Good day.');
  await c.settings.update({ replyLanguages: ['pcm'] });
  await c.developer!.simulateIncoming({ conversationId: 'conversation-1' });
  await vi.advanceTimersByTimeAsync(20);
  expect(
    data(await c.messages.list({ conversationId: 'conversation-1' })).items.at(-1)!.text,
  ).toContain('How we fit help');
});
it.each([
  [1000000, 2000000, 1500000, 1500000],
  [1800000, 2000000, 1500000, 1900000],
  [100000, 2000000, 1500000, 1500000],
  [3000000, 2000000, 1500000, 2000000],
  [1010000, 2000000, 1000000, 1510000],
])('clamps/rounds counter-offer %i/%i/%i', (offer, list, floor, expected) => {
  expect(counterOffer(offer, list, floor)).toBe(expected);
});
it('rejects invalid counter facts instead of inventing amounts', () => {
  expect(counterOffer(-1, 2000, 0)).toBeNull();
  expect(counterOffer(1000, 2000, 3000)).toBeNull();
  expect(counterOffer(NaN, 2000, 0)).toBeNull();
});
it('invites, changes roles, accepts in mock, assigns/unassigns chats and records audit events without link secrets', async () => {
  const c = mock();
  const m = data(
    await c.team.invite({ name: 'Bisi Cole', email: 'bisi@example.test', role: 'agent' }),
  );
  expect(m.status).toBe('invited');
  expect(
    (await c.team.invite({ name: 'Bisi', email: 'bisi@example.test', role: 'agent' })).ok,
  ).toBe(false);
  expect((await c.team.assign({ conversationId: 'conversation-1', memberId: m.id })).ok).toBe(
    false,
  );
  data(await c.developer!.simulateInviteAccepted({ memberId: m.id }));
  expect(data(await c.team.setRole({ id: m.id, role: 'manager' })).role).toBe('manager');
  expect((await c.team.setRole({ id: 'team-owner', role: 'agent' })).ok).toBe(false);
  expect((await c.team.setRole({ id: m.id, role: 'owner' as 'agent' })).ok).toBe(false);
  expect(
    data(await c.team.assign({ conversationId: 'conversation-1', memberId: m.id })),
  ).toMatchObject({ assignedTo: m.id, assignedName: 'Bisi Cole' });
  expect(data(await c.conversations.get('conversation-1')).assignedTo).toBe(m.id);
  expect(
    data(await c.team.assign({ conversationId: 'conversation-1', memberId: null })).assignedTo,
  ).toBeNull();
  expect((await c.team.assign({ conversationId: 'missing', memberId: m.id })).ok).toBe(false);
  const events = data(await c.team.audit());
  expect(events[0].action).toBe('Assigned chat');
  expect(events.some((e) => e.action === 'Invited teammate')).toBe(true);
  expect(events.every((e) => e.vendorId === c.vendorId)).toBe(true);
});
it('provides monthly/yearly/volume/bundle choices, saving placeholder selection without charges or fake credits', async () => {
  const c = mock();
  const b = data(await c.billing.get());
  expect(new Set(b.offers.map((o) => o.kind)).size).toBe(4);
  for (const tier of ['starter', 'growth'])
    expect(b.offers.find((o) => o.id === `${tier}-yearly`)!.priceKobo).toBe(
      b.offers.find((o) => o.id === `${tier}-monthly`)!.priceKobo * 10,
    );
  for (const o of b.offers) {
    const selected = data(await c.billing.selectOffer({ offerId: o.id }));
    expect(selected.selectedOfferId).toBe(o.id);
    expect(selected.plan).toBe(b.plan);
    expect(selected.status).toBe('trial');
    expect(selected.bundleBalance).toBe(0);
    expect(selected.usage).toEqual(b.usage);
  }
  expect((await c.billing.selectOffer({ offerId: 'free-everything' })).ok).toBe(false);
});
