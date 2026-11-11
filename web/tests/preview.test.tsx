import { it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { previewAllowed } from '../lib/preview';
import { Workspace } from '../components/workspace';
const state = vi.hoisted(() => ({ configured: false }));
vi.mock('../lib/supabase', () => ({
  authConfigured: () => state.configured,
  supabase: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  state.configured = false;
});
it.each(['development', 'test', 'production'])(
  'preview is gated in %s with and without Supabase',
  (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    state.configured = false;
    expect(previewAllowed()).toBe(mode !== 'production');
    state.configured = true;
    expect(previewAllowed()).toBe(false);
  },
);
it('production cannot display the preview entry point even without Supabase', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  render(<Workspace />);
  await screen.findByRole('button', { name: 'Create your account' });
  expect(screen.queryByRole('button', { name: /Explore the workspace/ })).not.toBeInTheDocument();
});
it('configured Supabase disables the preview in development', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  state.configured = true;
  render(<Workspace />);
  await screen.findByRole('button', { name: 'Create your account' });
  expect(screen.queryByRole('button', { name: /Explore the workspace/ })).not.toBeInTheDocument();
});
