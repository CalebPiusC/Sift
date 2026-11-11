import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Workspace } from '../components/workspace';
const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  vendor: null as null | object,
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  authConfigured: () => true,
  supabase: () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: mocks.signInWithOAuth,
    },
    from: () => ({
      select: () => ({
        limit: () => ({ maybeSingle: async () => ({ data: mocks.vendor, error: null }) }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.vendor = null;
});
it('email signup requests confirmation without fake success', async () => {
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  const user = userEvent.setup();
  render(<Workspace />);
  await user.type(await screen.findByLabelText('Email address'), 'tola@example.test');
  await user.type(screen.getByLabelText('Password'), 'a-safe-test-password');
  await user.click(screen.getByRole('button', { name: 'Create your account' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Check your email');
  expect(mocks.signUp).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'tola@example.test' }),
  );
});
it('supports password sign-in and Google OAuth', async () => {
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<Workspace />);
  await user.click(await screen.findByRole('button', { name: 'Sign in' }));
  await user.type(screen.getByLabelText('Email address'), 'tola@example.test');
  await user.type(screen.getByLabelText('Password'), 'a-safe-test-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'google' }),
  );
});
it('saves confirmed onboarding with the authenticated database RPC', async () => {
  mocks.user = { id: 'user-a' };
  mocks.rpc.mockResolvedValue({ data: 'vendor-a', error: null });
  const user = userEvent.setup();
  render(<Workspace />);
  await user.type(await screen.findByRole('textbox', { name: 'Business name' }), 'Ada Bakes');
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: /Let’s get you settled/ }));
  expect(
    await screen.findByRole('heading', { name: 'Your next “hello” belongs here.' }),
  ).toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith('onboard_vendor', {
    p_name: 'Ada Bakes',
    p_type: 'products',
    p_tone: 'friendly',
  });
});
it('loads the persisted vendor for a returning authenticated user', async () => {
  mocks.user = { id: 'user-a' };
  mocks.vendor = {
    id: 'vendor-a',
    business_name: 'Ada Bakes',
    business_type: 'made-to-order',
    tone: 'friendly',
  };
  render(<Workspace />);
  expect(
    await screen.findByText('Welcome, Ada Bakes. Let’s get your business connected.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/PREVIEW/)).not.toBeInTheDocument();
});
