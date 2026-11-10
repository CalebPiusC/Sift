import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Workspace } from '../components/workspace';
import { validName } from '../lib/onboarding';
vi.mock('../lib/supabase', () => ({
  authConfigured: () => false,
  supabase: () => {
    throw new Error('Unconfigured');
  },
}));
async function onboard() {
  const user = userEvent.setup();
  render(<Workspace />);
  await user.click(await screen.findByRole('button', { name: /Explore the workspace/ }));
  await user.type(screen.getByRole('textbox', { name: 'Business name' }), 'Adire by Tola');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: /Made-to-order/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: /Pidgin-friendly/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getAllByText('Connect later')).toHaveLength(5);
  await user.click(screen.getByRole('button', { name: /Let’s get you settled/ }));
  return user;
}
describe('foundation', () => {
  it('validates short business names', () => {
    expect(validName(' ')).toBe(false);
    expect(validName(' A ')).toBe(false);
    expect(validName(' Adire by Tola ')).toBe(true);
    expect(validName('a'.repeat(81))).toBe(false);
  });
  it('does not pretend authentication works without configuration', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Authentication needs Supabase configuration',
    );
  });
  it('finishes exactly four screens and exposes five destinations', async () => {
    const user = await onboard();
    expect(screen.getByText(/No account created/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Your next “hello” belongs here.' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    for (const name of ['Orders', 'Catalogue', 'Insights', 'Settings', 'Inbox']) {
      await user.click(within(nav).getByRole('button', { name }));
      expect(within(nav).getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
    }
    expect(screen.getByText('₦0')).toBeInTheDocument();
  });
  it('requires a business name before proceeding', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole('button', { name: /Explore the workspace/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
  it('toggles theme and exits the non-persistent preview', async () => {
    const user = await onboard();
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement).toHaveClass('dark');
    await user.click(screen.getByRole('button', { name: 'Exit preview' }));
    expect(await screen.findByRole('button', { name: 'Create your account' })).toBeInTheDocument();
  });
  it('offers install when the browser makes it available', async () => {
    const user = await onboard();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    const { act } = await import('@testing-library/react');
    act(() => window.dispatchEvent(event));
    await user.click(await screen.findByRole('button', { name: 'Install app' }));
    expect(prompt).toHaveBeenCalledOnce();
  });
});
