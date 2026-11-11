import type { Seed } from './seed';
import type { ExtrasData, ExtrasSnapshot } from './extras-types';
import type { Result, DataEvent } from './types';
export function extrasMock(
  s: Seed,
  run: <T>(area: DataEvent['area'], fn: () => Result<T>) => Promise<Result<T>>,
  emit: (area: DataEvent['area'], id: string) => void,
): ExtrasData {
  const ok = <T>(data: T): Result<T> => ({ ok: true, data: structuredClone(data) });
  const fail = (message: string): Result<never> => ({
    ok: false,
    error: { code: 'VALIDATION', message, retryable: false },
  });
  const at = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
  const base = { vendorId: s.settings.vendorId };
  const cold = s.conversations.filter((c) => c.stage === 'cold');
  const state: ExtrasSnapshot = {
    followupSettings: { enabled: false, afterHours: 48, style: 'friendly' },
    followups: cold.slice(0, 4).map((c, i) => ({
      ...base,
      id: `followup-${i + 1}`,
      conversationId: c.id,
      customerName: c.customerName,
      scheduledAt: at(i === 3 ? -24 : 24 + i * 4),
      sentAt: i === 3 ? at(-24) : null,
      status: i === 3 ? 'sent' : 'scheduled',
      text: 'Hello! Just checking whether you still need help. No pressure—reply whenever you are ready.',
    })),
    flags: [
      {
        ...base,
        id: 'flag-1',
        customerName: 'Unknown sender',
        channel: 'whatsapp',
        text: 'Send your bank OTP so we can release your transfer.',
        reason: 'Requests a banking OTP. Never share credentials or codes.',
        createdAt: at(-2),
        status: 'flagged',
      },
      {
        ...base,
        id: 'flag-2',
        customerName: 'Promo account',
        channel: 'instagram',
        text: 'Win free followers! Open this unfamiliar link.',
        reason: 'Unsolicited promotion with an unverified link.',
        createdAt: at(-6),
        status: 'flagged',
      },
    ],
    restock: s.products
      .filter((p) => p.kind === 'product')
      .slice(0, 3)
      .map((p, i) => ({
        ...base,
        id: `restock-${i + 1}`,
        productId: p.id,
        productName: p.name,
        customerName: s.customers[i].name,
        createdAt: at(-48 - i),
        status: 'waiting',
      })),
  };
  return {
    get: () => run('extras', () => ok(state)),
    configure: (input) =>
      run('extras', () => {
        if (
          typeof input.enabled !== 'boolean' ||
          !Number.isInteger(input.afterHours) ||
          input.afterHours < 24 ||
          input.afterHours > 720 ||
          !['friendly', 'professional', 'Pidgin-friendly'].includes(input.style)
        )
          return fail('Choose 24–720 whole hours and a supported style.');
        state.followupSettings = {
          enabled: input.enabled,
          afterHours: input.afterHours,
          style: input.style,
        };
        const text =
          input.style === 'professional'
            ? 'Good day. Please let us know if you need further assistance. No action is required.'
            : input.style === 'Pidgin-friendly'
              ? 'Hello! You still need help? No pressure, reply when you ready.'
              : 'Hello! Just checking whether you still need help. No pressure—reply whenever you are ready.';
        for (const f of state.followups.filter((f) => f.status === 'scheduled')) {
          const chat = s.conversations.find((c) => c.id === f.conversationId);
          f.scheduledAt = new Date(
            Math.max(Date.now(), Date.parse(chat?.updatedAt ?? at(0)) + input.afterHours * 3600000),
          ).toISOString();
          f.text = text;
        }
        emit('extras', 'followups');
        return ok(state.followupSettings);
      }),
    followup: (input) =>
      run('extras', () => {
        const f = state.followups.find((f) => f.id === input.id);
        if (!f || f.status !== 'scheduled')
          return fail('Only scheduled follow-ups can be changed.');
        if (!['cancel', 'simulate_send'].includes(input.action)) return fail('Unsupported action.');
        if (input.action === 'simulate_send') {
          const c = s.conversations.find((c) => c.id === f.conversationId);
          if (
            !state.followupSettings.enabled ||
            !c ||
            c.stage !== 'cold' ||
            c.status !== 'open' ||
            (c.humanModeUntil && Date.parse(c.humanModeUntil) > Date.now())
          )
            return fail(
              'Enable follow-ups for an open cold lead without Take Over before simulating.',
            );
          f.status = 'sent';
          f.sentAt = at(0);
        } else f.status = 'cancelled';
        emit('extras', f.id);
        return ok(f);
      }),
    moderate: (input) =>
      run('extras', () => {
        const f = state.flags.find((f) => f.id === input.id);
        if (!f || f.status !== 'flagged' || !['not_spam', 'block'].includes(input.action))
          return fail('Choose an unresolved flagged message.');
        f.status = input.action === 'block' ? 'blocked' : 'cleared';
        emit('extras', f.id);
        return ok(f);
      }),
    notifyRestock: (input) =>
      run('extras', () => {
        const a = state.restock.find((a) => a.id === input.id);
        const p = s.products.find((p) => p.id === a?.productId && !p.archived);
        if (
          !a ||
          a.status !== 'waiting' ||
          !p ||
          !(p.variants.length ? p.variants.some((v) => (v.stock ?? 0) > 0) : (p.stock ?? 0) > 0)
        )
          return fail('Stock must be available before simulating an alert.');
        a.status = 'notified';
        emit('extras', a.id);
        return ok(a);
      }),
  };
}
