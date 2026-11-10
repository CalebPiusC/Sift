import type { DataClient } from './contract';
import type { Result } from './types';
export function createApiClient(options: {
  vendorId: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}): DataClient {
  const request = async <T>(path: string, input?: unknown, method = 'GET'): Promise<Result<T>> => {
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
          ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => null)) as Result<T> | null;
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
      send: (i) => request('messages', i, 'POST'),
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
      setStatus: (i) => request(`orders/${key(i.id)}/status`, { status: i.status }, 'PATCH'),
      confirmPayment: (i) => request(`orders/${key(i.id)}/payment`, { source: i.source }, 'POST'),
    },
    receipts: {
      list: (i) => request(`receipts${query(i)}`),
      get: (id) => request(`receipts/${key(id)}`),
      issue: (i) => request('receipts', i, 'POST'),
    },
    customers: {
      list: (i) => request(`customers${query(i)}`),
      get: (id) => request(`customers/${key(id)}`),
    },
    channels: { list: () => request('channels') },
    settings: { get: () => request('settings'), update: (i) => request('settings', i, 'PATCH') },
    insights: { get: () => request('insights') },
    team: { list: () => request('team'), invite: (i) => request('team/invitations', i, 'POST') },
    billing: { get: () => request('billing') },
    realtime: {
      subscribe: async () => ({
        ok: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Realtime API transport is not connected yet.',
          retryable: false,
        },
      }),
    },
    developer: null,
    dispose: async () => {},
  };
}
