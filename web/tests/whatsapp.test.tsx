import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelsSettings } from '../components/settings/channels';
import { WhatsAppSignup } from '../components/settings/whatsapp-signup';
import { defaultPreferences } from '../lib/data/preferences';

const channels = vi.hoisted(() => ({
  list: vi.fn(),
  begin: vi.fn(),
  completeWhatsApp: vi.fn(),
  helper: vi.fn(),
  newHelperCode: vi.fn(),
  confirmHelper: vi.fn(),
}));
const apiClient = vi.hoisted(() => ({ mode: 'api', channels }));
vi.mock('../components/data/provider', () => ({
  useDataClient: () => ({
    client: apiClient,
    revision: 0,
    preferences: defaultPreferences,
  }),
}));
const success = (data: unknown) => ({ ok: true, data });
const attempt = {
  id: 'wa-attempt',
  channel: 'whatsapp' as const,
  status: 'pending' as const,
  expiresAt: '2030-01-01T00:00:00Z',
  sandbox: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  channels.list.mockResolvedValue(
    success([
      {
        id: 'whatsapp',
        vendorId: 'vendor',
        channel: 'whatsapp',
        displayName: 'WhatsApp Business',
        status: 'disconnected',
        ownAccount: true,
      },
    ]),
  );
  channels.begin.mockResolvedValue(success(attempt));
  channels.completeWhatsApp.mockResolvedValue(
    success({ id: 'whatsapp', channel: 'whatsapp', status: 'connected' }),
  );
});
it('API-mode WhatsApp card uses the server sandbox signup endpoint, never mock authorization', async () => {
  const user = userEvent.setup();
  render(<ChannelsSettings />);
  await user.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
  expect(await screen.findByText(/Sandbox: no Meta account/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Simulate authorisation' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Connect sandbox WhatsApp' }));
  await screen.findByText('Sandbox WhatsApp connected. No real account was connected.');
  expect(channels.completeWhatsApp).toHaveBeenCalledWith({ attemptId: 'wa-attempt' });
});
it('API helper only checks a signed webhook-established association; browser cannot simulate confirmation', async () => {
  const user = userEvent.setup();
  const pending = {
    id: 'link',
    code: '0123',
    expiresAt: '2030-01-01T00:00:00Z',
    status: 'pending',
    helperNumber: '2348000000000',
    sandbox: true,
  };
  channels.helper.mockResolvedValue(success(pending));
  render(<ChannelsSettings />);
  await user.click(screen.getByRole('button', { name: 'Link WhatsApp helper' }));
  expect(await screen.findByLabelText('WhatsApp link code')).toHaveTextContent('0123');
  expect(screen.queryByRole('button', { name: 'Simulate sent code' })).not.toBeInTheDocument();
  channels.helper.mockResolvedValue(success({ ...pending, status: 'linked', code: '' }));
  await user.click(screen.getByRole('button', { name: 'Check link status' }));
  await screen.findByText('Helper linked successfully');
  expect(channels.confirmHelper).not.toHaveBeenCalled();
});
it('live Embedded Signup ignores foreign origins and requires both Meta code and phone/business session data', async () => {
  const user = userEvent.setup();
  const connected = vi.fn();
  const init = vi.fn();
  const login = vi.fn((callback) => callback({ authResponse: { code: 'fixture-meta-code' } }));
  Object.assign(window, { FB: { init, login } });
  render(
    <WhatsAppSignup
      attempt={{
        ...attempt,
        sandbox: false,
        embeddedSignup: { appId: '123', configId: '456', version: 'v23.0' },
      }}
      onConnected={connected}
    />,
  );
  await user.click(await screen.findByRole('button', { name: 'Continue with Meta' }));
  expect(login).toHaveBeenCalled();
  const data = {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH',
    data: { phone_number_id: '111', waba_id: '222' },
  };
  window.dispatchEvent(
    new MessageEvent('message', { origin: 'https://attacker.example', data: JSON.stringify(data) }),
  );
  expect(channels.completeWhatsApp).not.toHaveBeenCalled();
  window.dispatchEvent(
    new MessageEvent('message', { origin: 'https://www.facebook.com', data: JSON.stringify(data) }),
  );
  await waitFor(() =>
    expect(channels.completeWhatsApp).toHaveBeenCalledWith({
      attemptId: 'wa-attempt',
      code: 'fixture-meta-code',
      phoneNumberId: '111',
      wabaId: '222',
    }),
  );
  await waitFor(() => expect(connected).toHaveBeenCalledOnce());
});
