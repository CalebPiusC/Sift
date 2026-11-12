import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '../lib/data/api';
import type { DataClient, Preferences, BusinessSettings } from '../lib/data';
import { PreferencesSettings } from '../components/settings/preferences';

let client: DataClient;
vi.mock('../components/data/provider', () => ({ useDataClient: () => ({ client }) }));
const value: Preferences = {
  lowData: false,
  darkMode: false,
  language: 'en',
  notifications: { readyToPay: true, needsYou: true },
};
const revision = 'a'.repeat(64);

it('uses API persistence wording and retains the request key across an uncertain save', async () => {
  const calls: { body: Record<string, unknown>; headers: Headers }[] = [];
  const fetcher = vi.fn(async (_url, init) => {
    calls.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    if (calls.length === 1) throw new Error('Network response lost');
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          preferences: { ...value, darkMode: true },
          preferencesRevision: 'b'.repeat(64),
        } as BusinessSettings,
      }),
    );
  }) as typeof fetch;
  client = createApiClient({
    vendorId: 'vendor-a',
    getToken: async () => 'fixture-token',
    fetcher,
  });
  const user = userEvent.setup();
  render(<PreferencesSettings value={value} revision={revision} />);
  expect(screen.getByText(/persist after reload/)).toBeInTheDocument();
  await user.click(screen.getByLabelText('Dark mode'));
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Preferences saved.');
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toEqual(calls[1].body);
  expect(calls[0].body.expectedPreferencesRevision).toBe(revision);
  expect(calls[0].body).not.toHaveProperty('idempotencyKey');
  expect(calls[0].headers.get('Idempotency-Key')).toBeTruthy();
  expect(calls[0].headers.get('Idempotency-Key')).toBe(calls[1].headers.get('Idempotency-Key'));
  expect(calls[0].headers.get('X-Vendor-Id')).toBe('vendor-a');
});

it('does not silently rebase a dirty editor onto a newer server revision', async () => {
  const requests: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (_url, init) => {
    if (init?.method === 'GET')
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            preferences: { ...value, lowData: true },
            preferencesRevision: 'b'.repeat(64),
          },
        }),
      );
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Reload saved preferences before saving.',
          retryable: false,
        },
      }),
      { status: 409 },
    );
  }) as typeof fetch;
  client = createApiClient({
    vendorId: 'vendor-a',
    getToken: async () => 'fixture-token',
    fetcher,
  });
  const user = userEvent.setup();
  const view = render(<PreferencesSettings value={value} revision={revision} />);
  await user.click(screen.getByLabelText('Dark mode'));
  view.rerender(
    <PreferencesSettings value={{ ...value, lowData: true }} revision={'b'.repeat(64)} />,
  );
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByRole('alert');
  expect(requests[0].expectedPreferencesRevision).toBe(revision);
  expect(screen.getByLabelText('Dark mode')).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Reload saved preferences' }));
  await waitFor(() => expect(screen.getByLabelText('Dark mode')).not.toBeChecked());
  expect(screen.getByLabelText('Low-data mode')).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(requests[1].expectedPreferencesRevision).toBe('b'.repeat(64));
});
