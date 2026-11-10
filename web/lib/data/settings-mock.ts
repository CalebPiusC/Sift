import type { DataClient } from './contract';
import type { Seed } from './seed';
import type { AuditEntry, ChannelAttempt, HelperLink } from './settings-types';
import type { DataEvent, ID, Result, TeamMember, BusinessSettings } from './types';
import { validateSettings } from './settings-logic';
type Run = <T>(area: DataEvent['area'], work: () => Result<T>) => Promise<Result<T>>;
const ok = <T>(data: T): Result<T> => ({ ok: true, data: structuredClone(data) });
const fail = (
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_IMPLEMENTED',
  message: string,
): Result<never> => ({ ok: false, error: { code, message, retryable: false } });
export function settingsMock({
  state,
  vendorId,
  id,
  run,
  emit,
}: {
  state: Seed;
  vendorId: ID;
  id: (prefix: string) => ID;
  run: Run;
  emit: (area: DataEvent['area'], id: ID, type?: DataEvent['type']) => void;
}): Pick<DataClient, 'channels' | 'settings' | 'team' | 'billing'> & {
  acceptInvite: (memberId: ID) => Promise<Result<TeamMember>>;
} {
  const audit: AuditEntry[] = [
    {
      id: id('audit'),
      vendorId,
      actorName: 'Tola Adeyemi',
      action: 'Opened sample workspace',
      subject: 'Mock owner session',
      at: new Date().toISOString(),
    },
  ];
  function record(action: string, subject: string) {
    audit.unshift({
      id: id('audit'),
      vendorId,
      actorName: 'Tola Adeyemi',
      action,
      subject,
      at: new Date().toISOString(),
    });
    emit('team', vendorId);
  }
  const attempts = new Map<ID, ChannelAttempt>();
  const latest = new Map<string, ID>();
  let helper: HelperLink | null = null;
  const keys = [
    'businessName',
    'businessType',
    'tone',
    'autoNegotiation',
    'autoIntents',
    'deliveryFees',
    'replyLanguages',
    'businessHours',
    'preferences',
  ] as const;
  return {
    channels: {
      list: () => run('channels', () => ok(state.channels)),
      begin: (input) =>
        run('channels', () => {
          if (!state.channels.some((c) => c.channel === input.channel))
            return fail('NOT_FOUND', 'Channel not found.');
          const attempt: ChannelAttempt = {
            id: id('connection'),
            channel: input.channel,
            status: 'pending',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          };
          attempts.set(attempt.id, attempt);
          latest.set(input.channel, attempt.id);
          return ok(attempt);
        }),
      complete: (input) =>
        run('channels', () => {
          const a = attempts.get(input.attemptId);
          if (!a || latest.get(a.channel) !== a.id)
            return fail('CONFLICT', 'This flow was replaced. Start a new connection.');
          if (a.channel === 'tiktok')
            return fail(
              'NOT_IMPLEMENTED',
              'TikTok availability is being confirmed. No connection has been made.',
            );
          const c = state.channels.find((c) => c.channel === a.channel)!;
          if (a.status === 'completed') return ok(c);
          if (Date.parse(a.expiresAt) <= Date.now())
            return fail('CONFLICT', 'Connection flow expired. Start again.');
          c.status = 'connected';
          c.ownAccount = true;
          a.status = 'completed';
          record('Connected sample channel', a.channel);
          emit('channels', c.id);
          return ok(c);
        }),
      helper: () => run('channels', () => ok(helper)),
      newHelperCode: () =>
        run('channels', () => {
          let code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
          if (code === helper?.code) code = String((Number(code) + 1) % 10000).padStart(4, '0');
          helper = {
            id: id('helper-code'),
            code,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            status: 'pending',
            helperNumber: null,
          };
          emit('channels', helper.id);
          return ok(helper);
        }),
      confirmHelper: (input) =>
        run('channels', () => {
          if (!helper || helper.id !== input.id)
            return fail('CONFLICT', 'This code was replaced. Use the current code.');
          if (helper.status === 'linked') return ok(helper);
          if (Date.parse(helper.expiresAt) <= Date.now())
            return fail('CONFLICT', 'This code expired. Request a new code.');
          helper.status = 'linked';
          record('Linked sample WhatsApp helper', 'Helper only, not a customer messaging account');
          emit('channels', helper.id);
          return ok(helper);
        }),
    },
    settings: {
      get: () => run('settings', () => ok(state.settings)),
      update: (input) =>
        run('settings', () => {
          const next = structuredClone(state.settings);
          for (const key of keys)
            if (input[key] !== undefined)
              Object.assign(next, { [key]: structuredClone(input[key]) });
          const error = validateSettings(next);
          if (error) return fail('VALIDATION', error);
          next.preferences = {
            lowData: next.preferences.lowData,
            darkMode: next.preferences.darkMode,
            language: next.preferences.language,
            notifications: {
              readyToPay: next.preferences.notifications.readyToPay,
              needsYou: next.preferences.notifications.needsYou,
            },
          };
          next.businessHours = {
            enabled: next.businessHours.enabled,
            timezone: 'Africa/Lagos',
            awayMessage: next.businessHours.awayMessage,
            days: next.businessHours.days.map((d) => ({
              day: d.day,
              closed: d.closed,
              opens: d.opens,
              closes: d.closes,
            })),
          };
          next.deliveryFees = next.deliveryFees.map((f) => ({ city: f.city, feeKobo: f.feeKobo }));
          next.businessName = next.businessName.trim();
          next.autoIntents = [...new Set(next.autoIntents)];
          next.replyLanguages = [...new Set(next.replyLanguages)];
          Object.assign(state.settings, next);
          record('Updated settings', 'Business/reply/preferences settings');
          emit('settings', next.id);
          return ok(next);
        }),
    },
    team: {
      list: () => run('team', () => ok(state.team)),
      invite: (input) =>
        run('team', () => {
          if (
            typeof input.name !== 'string' ||
            !input.name.trim() ||
            input.name.trim().length > 80 ||
            typeof input.email !== 'string' ||
            input.email.length > 254 ||
            !/^\S+@\S+\.\S+$/.test(input.email) ||
            !['manager', 'agent'].includes(input.role)
          )
            return fail('VALIDATION', 'Provide a name, email and manager/agent role.');
          if (state.team.some((m) => m.email.toLowerCase() === input.email.trim().toLowerCase()))
            return fail('CONFLICT', 'This teammate already exists.');
          const m: TeamMember = {
            id: id('team'),
            vendorId,
            name: input.name.trim(),
            email: input.email.trim().toLowerCase(),
            role: input.role,
            status: 'invited',
          };
          state.team.push(m);
          record('Invited teammate', m.name);
          emit('team', m.id, 'created');
          return ok(m);
        }),
      setRole: (input) =>
        run('team', () => {
          const m = state.team.find((m) => m.id === input.id);
          if (!m) return fail('NOT_FOUND', 'Teammate not found.');
          if (m.role === 'owner' || !['manager', 'agent'].includes(input.role))
            return fail(
              'VALIDATION',
              'The owner cannot be reassigned or demoted here. Choose manager or agent for other teammates.',
            );
          m.role = input.role;
          record('Changed team role', `${m.name} · ${m.role}`);
          emit('team', m.id);
          return ok(m);
        }),
      assign: (input) =>
        run('team', () => {
          const c = state.conversations.find((c) => c.id === input.conversationId);
          if (!c) return fail('NOT_FOUND', 'Conversation not found.');
          const m =
            input.memberId === null
              ? null
              : state.team.find((m) => m.id === input.memberId && m.status === 'active');
          if (input.memberId !== null && !m)
            return fail('VALIDATION', 'Assign chats only to an active teammate.');
          c.assignedTo = m?.id ?? null;
          c.assignedName = m?.name ?? null;
          record('Assigned chat', `${c.customerName} → ${m?.name ?? 'Unassigned'}`);
          emit('conversations', c.id);
          return ok(c);
        }),
      audit: () => run('team', () => ok(audit)),
    },
    billing: {
      get: () => run('billing', () => ok(state.billing)),
      selectOffer: (input) =>
        run('billing', () => {
          const offer = state.billing.offers.find((o) => o.id === input.offerId);
          if (!offer) return fail('NOT_FOUND', 'Billing option not found.');
          state.billing.selectedOfferId = offer.id;
          record('Selected billing placeholder', offer.name);
          emit('billing', state.billing.id);
          return ok(state.billing);
        }),
    },
    acceptInvite: (memberId) =>
      run('team', () => {
        const m = state.team.find((m) => m.id === memberId);
        if (!m) return fail('NOT_FOUND', 'Teammate not found.');
        if (m.status === 'active') return ok(m);
        m.status = 'active';
        record('Simulated invitation acceptance', m.name);
        emit('team', m.id);
        return ok(m);
      }),
  };
}
