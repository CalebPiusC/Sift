import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createApiClient } from '../lib/data/api';
import { PublicReceipt } from '../components/receipts/public-receipt';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});
it('does not confirm a screenshot or skip the explicit bank confirm step', async () => {
  const fetcher = vi.fn();
  const client = createApiClient({ vendorId: 'vendor', getToken: async () => 'token', fetcher });
  expect(
    (await client.orders.confirmPayment({ id: 'order', source: 'vendor', expectedRevision: 1 })).ok,
  ).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it('obtains a bound confirmation challenge before recording a checked bank payment', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { confirmationToken: 'signed-bank-token' } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { id: 'order', paymentStatus: 'paid' } }),
    });
  const client = createApiClient({ vendorId: 'vendor', getToken: async () => 'token', fetcher });
  await client.orders.confirmPayment({
    id: 'order',
    source: 'vendor',
    expectedRevision: 2,
    confirmed: true,
  });
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/orders/order/payment-confirmation');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
    confirmed: true,
    confirmationToken: 'signed-bank-token',
    expectedRevision: 2,
  });
});
it('API receipt page rejects unsigned sample snapshots without a fallback', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  window.location.hash = '#sample=forged';
  render(<PublicReceipt allowSample={false} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid|revoked/);
  expect(fetcher).not.toHaveBeenCalled();
});
it('sends the signed token in a POST body, not a URL or query string', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
  vi.stubGlobal('fetch', fetcher);
  window.location.hash = '#token=private-signed-token';
  render(<PublicReceipt allowSample={false} />);
  await screen.findByRole('alert');
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/public/receipts');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ token: 'private-signed-token' });
});
