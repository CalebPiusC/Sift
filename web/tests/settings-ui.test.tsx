import { it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { SettingsPanel } from '../components/data/settings-panel';
function setup() {
  render(
    <div style={{ width: 390, maxWidth: '100%' }}>
      <DataProvider mode="mock">
        <SettingsPanel />
      </DataProvider>
    </div>,
  );
  return userEvent.setup();
}
it('connects/reconnects channels, explains TikTok, replaces helper codes and saves simulated helper success', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'channels' }));
  await user.click(await screen.findByRole('button', { name: 'Connect Facebook' }));
  const flow = await screen.findByRole('region', { name: 'Connection flow' });
  expect(flow).toHaveTextContent('no provider login');
  await user.click(within(flow).getByRole('button', { name: 'Simulate authorisation' }));
  await screen.findByText('Facebook sample connection complete.');
  await waitFor(() =>
    expect(screen.getByRole('article', { name: 'Facebook channel' })).toHaveTextContent(
      'Sample Connected',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Reconnect Instagram' }));
  await user.click(await screen.findByRole('button', { name: 'Simulate authorisation' }));
  await screen.findByText('Instagram sample connection complete.');
  await user.click(screen.getByRole('button', { name: 'Connect TikTok' }));
  expect(
    await screen.findByText(
      'TikTok availability is being confirmed. We cannot promise access or connect an account yet.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Simulate authorisation' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Got it' }));
  await user.click(screen.getByRole('button', { name: 'Link WhatsApp helper' }));
  const code = await screen.findByLabelText('WhatsApp link code');
  expect(code.textContent).toMatch(/^\d{4}$/);
  expect(screen.getByRole('timer')).toHaveTextContent('Expires in');
  const old = code.textContent;
  await user.click(screen.getByRole('button', { name: 'New code' }));
  await waitFor(() =>
    expect(screen.getByLabelText('WhatsApp link code').textContent).not.toBe(old),
  );
  expect(screen.getByText(/No live helper number is configured/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Simulate sent code' }));
  await screen.findByText('Helper linked successfully');
  await user.click(screen.getByRole('button', { name: 'Back to channels' }));
  await user.click(screen.getByRole('button', { name: 'Link WhatsApp helper' }));
  expect(await screen.findByText('Helper linked successfully')).toBeInTheDocument();
});
it('saves per-intent lanes, negotiation, tone, languages and hours, rejecting an invalid schedule', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'replies' }));
  await user.click(await screen.findByLabelText('Price'));
  await user.click(screen.getByLabelText('Auto-negotiate'));
  await user.click(screen.getByRole('button', { name: 'professional' }));
  await user.click(screen.getByLabelText('English'));
  await user.click(screen.getByLabelText('Use business hours'));
  await user.clear(screen.getByLabelText('Away message'));
  await user.type(screen.getByLabelText('Away message'), 'We are away. Please leave a message.');
  await user.clear(screen.getByLabelText('Monday closes'));
  await user.type(screen.getByLabelText('Monday closes'), '08:00');
  await user.click(screen.getByRole('button', { name: 'Save reply settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('valid same-day');
  await user.clear(screen.getByLabelText('Monday closes'));
  await user.type(screen.getByLabelText('Monday closes'), '18:00');
  await user.click(screen.getByRole('button', { name: 'Save reply settings' }));
  await screen.findByText('Reply settings saved for this session.');
  await user.click(screen.getByRole('button', { name: 'business' }));
  await user.click(screen.getByRole('button', { name: 'replies' }));
  await waitFor(() => expect(screen.getByLabelText('Price')).not.toBeChecked());
  expect(screen.getByLabelText('Auto-negotiate')).toBeChecked();
  expect(screen.getByRole('button', { name: 'professional' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('English')).not.toBeChecked();
  expect(screen.getByLabelText('Nigerian Pidgin')).toBeChecked();
  expect(screen.getByLabelText('Away message')).toHaveValue('We are away. Please leave a message.');
  expect(screen.getByText(/There is no “approve everything” mode/)).toBeInTheDocument();
});
it('previews hard-floor counters from actual products without sending or changing prices', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'negotiation' }));
  expect(await screen.findByText(/Customer offers ₦10,000 · list ₦20,000/)).toBeInTheDocument();
  await screen.findByLabelText('Customer offer (₦)');
  expect(screen.getByRole('status', { name: 'Counter-offer preview' })).toHaveTextContent(
    'AI would counter ₦22,500',
  );
  expect(screen.getByText('Every product’s floor')).toBeInTheDocument();
  await user.clear(screen.getByLabelText('Customer offer (₦)'));
  await user.type(screen.getByLabelText('Customer offer (₦)'), 'N23k');
  expect(screen.getByRole('status', { name: 'Counter-offer preview' })).toHaveTextContent(
    'AI would counter ₦24,000',
  );
  await user.clear(screen.getByLabelText('Customer offer (₦)'));
  await user.type(screen.getByLabelText('Customer offer (₦)'), '-1');
  expect(screen.getByRole('alert')).toHaveTextContent('valid non-negative');
});
it('invites a teammate, simulates acceptance, changes role, assigns a chat and retains audit history', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'team' }));
  await user.type(await screen.findByLabelText('Name'), 'Bisi Cole');
  await user.type(screen.getByLabelText('Email'), 'bisi@example.test');
  await user.click(screen.getByRole('button', { name: 'Send invitation' }));
  await screen.findByText('Invitation saved for Bisi Cole. No real email was sent.');
  const card = await screen.findByRole('article', { name: 'Teammate Bisi Cole' });
  await user.click(within(card).getByRole('button', { name: 'Simulate acceptance' }));
  await waitFor(() => expect(card).toHaveTextContent('agent · active'));
  await user.selectOptions(screen.getByLabelText('Role for Bisi Cole'), 'manager');
  await waitFor(() => expect(card).toHaveTextContent('manager · active'));
  await user.selectOptions(
    screen.getByLabelText('Assign to'),
    screen.getByRole('option', { name: 'Bisi Cole · manager' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save assignment' }));
  await screen.findByText('Assigned Chidinma Okafor to Bisi Cole.');
  expect(screen.getByText('Owner role is protected.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'business' }));
  await user.click(screen.getByRole('button', { name: 'team' }));
  await screen.findByText('Currently assigned: Bisi Cole');
  expect(screen.getByText('Assigned chat')).toBeInTheDocument();
  expect(screen.getByText('Invited teammate')).toBeInTheDocument();
});
it('saves a placeholder billing selection without changing trial, plan or bundle balance', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'billing' }));
  expect(await screen.findByText(/Trial · 14 days remaining/)).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Conversation usage' })).toHaveAttribute(
    'value',
    '40',
  );
  await user.click(screen.getByRole('button', { name: 'Paystack · select Growth yearly' }));
  await screen.findByText(
    'Growth yearly selected. Paystack checkout is a placeholder. No payment or entitlement change was made.',
  );
  await user.click(screen.getByRole('button', { name: 'business' }));
  await user.click(screen.getByRole('button', { name: 'billing' }));
  const card = await screen.findByRole('article', { name: 'Growth yearly' });
  expect(card).toHaveTextContent('Selected · no purchase made');
  expect(screen.getByText('Current plan: growth')).toBeInTheDocument();
  expect(screen.getByText('40 of 1000 conversations used · 0 bundle credits')).toBeInTheDocument();
});
it('persists preferences across screens and applies dark mode/page language in memory', async () => {
  const user = setup();
  await screen.findByText('Your business');
  await user.click(screen.getByRole('button', { name: 'preferences' }));
  await user.click(await screen.findByLabelText('Low-data mode'));
  await user.click(screen.getByLabelText('Dark mode'));
  await user.click(screen.getByLabelText('Ready to pay alerts'));
  await user.selectOptions(screen.getByLabelText('App language'), 'pcm');
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Preferences saved for this session.');
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(document.documentElement.lang).toBe('pcm');
  expect(document.documentElement.dataset.lowData).toBe('true');
  await user.click(screen.getByRole('button', { name: 'business' }));
  await user.click(screen.getByRole('button', { name: 'preferences' }));
  expect(await screen.findByLabelText('Low-data mode')).toBeChecked();
  expect(screen.getByLabelText('Dark mode')).toBeChecked();
  expect(screen.getByLabelText('Ready to pay alerts')).not.toBeChecked();
  expect(screen.getByLabelText('App language')).toHaveValue('pcm');
});
