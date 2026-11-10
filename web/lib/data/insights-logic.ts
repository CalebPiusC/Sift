import type { Seed } from './seed';
import type { DateRange, InsightsReport } from './extras-types';
export const localDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
export function validRange(r: DateRange) {
  return (
    [r.from, r.to].every(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        !Number.isNaN(Date.parse(d)) &&
        new Date(d).toISOString().slice(0, 10) === d,
    ) && r.from <= r.to
  );
}
export function insightsReport(s: Seed, r?: DateRange): InsightsReport {
  const inside = (iso: string) => !r || (localDay(iso) >= r.from && localDay(iso) <= r.to);
  const chats = s.conversations.filter((c) => inside(c.updatedAt));
  const orders = s.orders.filter((o) => inside(o.createdAt));
  const sales = s.orders.filter(
    (o) =>
      o.paymentStatus === 'paid' && o.status !== 'cancelled' && inside(o.paidAt ?? o.createdAt),
  );
  const msgs = s.messages.filter((m) => inside(m.createdAt));
  const days = new Map<string, number>(),
    products = new Map<string, number>();
  for (const o of sales) {
    const d = localDay(o.paidAt ?? o.createdAt);
    days.set(d, (days.get(d) ?? 0) + o.totalKobo);
    for (const i of o.items) products.set(i.name, (products.get(i.name) ?? 0) + i.quantity);
  }
  const response: number[] = [];
  for (const c of s.conversations) {
    let pending: string | null = null;
    for (const m of s.messages
      .filter((m) => m.conversationId === c.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (m.sender === 'customer') {
        pending ??= m.createdAt;
      } else if (m.status === 'sent' && pending) {
        if (inside(m.createdAt))
          response.push(Math.max(0, (Date.parse(m.createdAt) - Date.parse(pending)) / 1000));
        pending = null;
      }
    }
  }
  return {
    revenueKobo: sales.reduce((n, o) => n + o.totalKobo, 0),
    orderCount: orders.length,
    conversationCount: chats.length,
    pendingApprovals: s.approvals.filter((a) => a.status === 'pending' && inside(a.createdAt))
      .length,
    dailySales: [...days].sort().map(([date, revenueKobo]) => ({ date, revenueKobo })),
    byChannel: s.channels.map((c) => ({
      channel: c.channel,
      conversations: chats.filter((x) => x.channel === c.channel).length,
    })),
    responseSeconds: response.length
      ? Math.round(response.reduce((a, b) => a + b, 0) / response.length)
      : null,
    responseSamples: response.length,
    stages: ['new', 'interested', 'ready_to_pay', 'paid', 'cold'].map((label) => ({
      label: label.replaceAll('_', ' '),
      value: chats.filter((c) => c.stage === label).length,
    })),
    topProducts: [...products]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value })),
    hours: Array.from({ length: 12 }, (_, i) => ({
      label: `${String(i * 2).padStart(2, '0')}:00`,
      value: msgs.filter(
        (m) =>
          m.sender === 'customer' &&
          Math.floor(
            Number(
              new Date(m.createdAt).toLocaleTimeString('en-GB', {
                timeZone: 'Africa/Lagos',
                hour: '2-digit',
                hour12: false,
              }),
            ) / 2,
          ) === i,
      ).length,
    })),
    handling: ['ai', 'vendor'].map((who) => ({
      label: who === 'ai' ? 'AI' : 'Vendor',
      value: msgs.filter((m) => m.sender === who && m.status === 'sent').length,
    })),
  };
}
