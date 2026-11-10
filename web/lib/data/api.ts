import type { DataClient } from './contract';
import type { Result, DataEvent } from './types';
import { authConfigured, supabase } from '../supabase';
export function createApiClient(options: {
  vendorId: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}): DataClient {
  const listeners = new Set<(event: DataEvent) => void>();
  const subscriptions = new Set<() => void>();
  const notify = () =>
    listeners.forEach((fn) =>
      fn({
        area: 'messages',
        vendorId: options.vendorId,
        entityId: options.vendorId,
        type: 'updated',
      }),
    );
  const request = async <T>(
    path: string,
    input?: unknown,
    method = 'GET',
    idempotencyKey?: string,
  ): Promise<Result<T>> => {
    if (!options.vendorId)
      return {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Sign in and select a business first.',
          retryable: false,
        },
      };
    try {
      const token = await options.getToken();
      if (!token)
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Please sign in again.', retryable: false },
        };
      const response = await (options.fetcher ?? fetch)(`/api/v1/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Vendor-Id': options.vendorId,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => null)) as Result<T> | null;
      if (response.status === 409 && method !== 'GET') notify();
      if (
        result?.ok === false &&
        result.error &&
        [
          'VALIDATION',
          'NOT_FOUND',
          'CONFLICT',
          'FORBIDDEN',
          'UNAVAILABLE',
          'NOT_IMPLEMENTED',
        ].includes(result.error.code) &&
        typeof result.error.message === 'string' &&
        typeof result.error.retryable === 'boolean'
      )
        return result;
      if (!response.ok)
        return {
          ok: false,
          error: {
            code:
              response.status === 404
                ? 'NOT_IMPLEMENTED'
                : response.status === 401 || response.status === 403
                  ? 'FORBIDDEN'
                  : response.status === 409
                    ? 'CONFLICT'
                    : response.status === 400 || response.status === 422
                      ? 'VALIDATION'
                      : 'UNAVAILABLE',
            message:
              response.status === 404
                ? 'This API is not connected yet. No sample data is used.'
                : 'The request could not be completed. Please retry.',
            retryable: response.status >= 500,
          },
        };
      if (typeof result?.ok !== 'boolean' || (result?.ok ? !('data' in result) : true))
        throw new Error('Invalid envelope');
      if (method !== 'GET') notify();
      return result as Result<T>;
    } catch {
      return {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          message: 'Unable to reach the data service. Please retry.',
          retryable: true,
        },
      };
    }
  };
  const query = (input: object = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) params.set(key, String(value));
    return params.size ? `?${params}` : '';
  };
  const key = encodeURIComponent;
  return {
    mode: 'api',
    vendorId: options.vendorId,
    catalogue: {
      list: (i) => request(`catalogue${query(i)}`),
      get: (id) => request(`catalogue/${key(id)}`),
      extract: (i) => request('catalogue/extractions', i, 'POST'),
      createMany: (i) => request('catalogue/batches', i, 'POST'),
      update: (i) =>
        request(
          `catalogue/${key(i.id)}`,
          { expectedRevision: i.expectedRevision, product: i.product },
          'PATCH',
        ),
      archive: (i) =>
        request(
          `catalogue/${key(i.id)}/archive`,
          { expectedRevision: i.expectedRevision, archived: i.archived },
          'PATCH',
        ),
      proposeText: (i) => request('catalogue/text-proposals', i, 'POST'),
      confirmText: (i) =>
        request(
          `catalogue/text-proposals/${key(i.proposalId)}/confirm`,
          { productId: i.productId },
          'POST',
        ),
    },
    conversations: {
      list: (i) => request(`conversations${query(i)}`),
      get: (id) => request(`conversations/${key(id)}`),
      markRead: (id) => request(`conversations/${key(id)}/read`, {}, 'POST'),
      setHumanMode: (i) =>
        request(`conversations/${key(i.id)}/human-mode`, { until: i.until }, 'PATCH'),
    },
    messages: {
      list: (i) => request(`messages${query(i)}`),
      send: (i) =>
        request(
          'messages',
          { conversationId: i.conversationId, text: i.text },
          'POST',
          i.idempotencyKey ?? crypto.randomUUID(),
        ),
      retry: (id) => request(`messages/${key(id)}/retry`, {}, 'POST'),
    },
    approvals: {
      list: (i) => request(`approvals${query(i)}`),
      decide: (i) =>
        request(
          `approvals/${key(i.id)}/decision`,
          { action: i.action, editedReply: i.editedReply },
          'POST',
        ),
    },
    orders: {
      list: (i) => request(`orders${query(i)}`),
      get: (id) => request(`orders/${key(id)}`),
      setStatus: (i) =>
        request(
          `orders/${key(i.id)}/status`,
          { status: i.status, expectedRevision: i.expectedRevision },
          'PATCH',
        ),
      confirmPayment: (i) =>
        request(
          `orders/${key(i.id)}/payment`,
          { source: i.source, expectedRevision: i.expectedRevision },
          'POST',
        ),
    },
    receipts: {
      list: (i) => request(`receipts${query(i)}`),
      get: (id) => request(`receipts/${key(id)}`),
      issue: (i) => request('receipts', i, 'POST'),
    },
    customers: {
      list: (i) => request(`customers${query(i)}`),
      get: (id) => request(`customers/${key(id)}`),
      update: (i) =>
        request(
          `customers/${key(i.id)}`,
          { notes: i.notes, tags: i.tags, flagged: i.flagged },
          'PATCH',
        ),
    },
    channels: {
      list: () => request('channels'),
      begin: (i) => request('channels/connections', i, 'POST'),
      complete: (i) => request(`channels/connections/${key(i.attemptId)}/complete`, {}, 'POST'),
      helper: () => request('channels/whatsapp/helper'),
      newHelperCode: () => request('channels/whatsapp/helper/codes', {}, 'POST'),
      confirmHelper: (i) =>
        request(`channels/whatsapp/helper/codes/${key(i.id)}/confirm`, {}, 'POST'),
    },
    settings: {
      get: () => request('settings'),
      update: (i) => request('settings', i, 'PATCH'),
      getReplyPolicy: () => request('settings/reply-engine'),
      updateReplyPolicy: (i) => request('settings/reply-engine', i, 'PATCH'),
    },
    insights: {
      get: (range) => request(`insights${range ? `?${new URLSearchParams({ ...range })}` : ''}`),
    },
    extras: {
      get: () => request('extras'),
      configure: (i) => request('extras/followups/settings', i, 'PATCH'),
      followup: (i) => request(`extras/followups/${key(i.id)}`, { action: i.action }, 'PATCH'),
      moderate: (i) => request(`extras/flags/${key(i.id)}`, { action: i.action }, 'PATCH'),
      notifyRestock: (i) => request(`extras/restock/${key(i.id)}`, {}, 'POST'),
    },
    team: {
      list: () => request('team'),
      invite: (i) => request('team/invitations', i, 'POST'),
      setRole: (i) => request(`team/${key(i.id)}/role`, { role: i.role }, 'PATCH'),
      assign: (i) =>
        request(
          `conversations/${key(i.conversationId)}/assignment`,
          { memberId: i.memberId },
          'PATCH',
        ),
      audit: () => request('team/audit'),
    },
    billing: {
      get: () => request('billing'),
      selectOffer: (i) => request('billing/selection', i, 'PATCH'),
    },
    realtime: {
      subscribe: async (listener) => {
        listeners.add(listener);
        if (!options.vendorId || !authConfigured())
          return {
            ok: false,
            error: {
              code: 'NOT_IMPLEMENTED',
              message: 'Configure Supabase realtime for live inbox updates.',
              retryable: false,
            },
          };
        const db = supabase();
        const token = await options.getToken();
        if (!token)
          return {
            ok: false,
            error: { code: 'FORBIDDEN', message: 'Sign in for live updates.', retryable: false },
          };
        await db.realtime.setAuth(token);
        const channel = db.channel(`inbox:${options.vendorId}:${crypto.randomUUID()}`);
        for (const table of [
          'messages',
          'conversations',
          'channel_accounts',
          'customers',
          'approvals',
        ]) {
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter: `vendor_id=eq.${options.vendorId}` },
            () => notify(),
          );
        }
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') notify();
        });
        const unsubscribe = () => {
          listeners.delete(listener);
          void db.removeChannel(channel);
          subscriptions.delete(unsubscribe);
        };
        subscriptions.add(unsubscribe);
        return { ok: true, data: unsubscribe };
      },
    },
    developer: null,
    dispose: async () => {
      subscriptions.forEach((stop) => stop());
      listeners.clear();
    },
  };
}
