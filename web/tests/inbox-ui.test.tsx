import { it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { InboxPanel } from '../components/data/inbox';
// UI integration exercises domain logic/subscriptions, not the sample network delay.
// Keep all async calls, real mutations and assertions; production latency is unchanged.
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    createMockClient: (options: Parameters<typeof actual.createMockClient>[0]) =>
      actual.createMockClient({ ...options, latencyMs: 0 }),
  };
});
const renderInbox = () =>
  render(
    <div style={{ width: 390, maxWidth: '100%' }}>
      <DataProvider mode="mock">
        <InboxPanel />
      </DataProvider>
    </div>,
  );
it('filters by channel, stage, needs me and text; resets an empty result', async () => {
  const user = userEvent.setup();
  renderInbox();
  await screen.findByText('40 conversations');
  expect(screen.queryByLabelText('Chat messages')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Channel'), 'whatsapp');
  await screen.findByText('8 conversations');
  await user.click(screen.getByLabelText('Needs me only'));
  await screen.findByText('1 conversations');
  expect(screen.getByTestId('conversation-row')).toHaveTextContent('New');
  await user.selectOptions(screen.getByLabelText('Lead stage'), 'ready_to_pay');
  await screen.findByText('No conversations match. Try a different filter.');
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  await screen.findByText('40 conversations');
  await user.type(screen.getByPlaceholderText('Search customers or messages'), 'Chidinma');
  await screen.findByText('1 conversations');
  expect(screen.getByTestId('conversation-row')).toHaveTextContent('Needs you');
});
it('shows approval facts/countdown in chat and makes edit and reject actionable in Needs you', async () => {
  const user = userEvent.setup();
  renderInbox();
  await screen.findByText('40 conversations');
  await user.click(screen.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }));
  const card = await screen.findByRole('article', { name: 'Approval approval-1' });
  expect(within(card).getByText('Indigo Adire Set')).toBeInTheDocument();
  expect(within(card).getByText('Stock')).toBeInTheDocument();
  expect(within(card).getByRole('timer')).toHaveTextContent(/Holding reply in/);
  expect(within(card).getByText(/Why this needs you/)).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: /^Needs you/ }));
  const editCard = await screen.findByRole('article', { name: 'Approval approval-1' });
  await user.click(within(editCard).getByRole('button', { name: /^Edit$/ }));
  await user.clear(screen.getByLabelText('Edit proposed reply'));
  await user.type(screen.getByLabelText('Edit proposed reply'), 'I will check this personally.');
  await user.click(screen.getByRole('button', { name: 'Send edited reply' }));
  await waitFor(() =>
    expect(screen.queryByRole('article', { name: 'Approval approval-1' })).not.toBeInTheDocument(),
  );
  const reject = screen.getByRole('article', { name: 'Approval approval-2' });
  await user.click(within(reject).getByRole('button', { name: 'Reject' }));
  await waitFor(() =>
    expect(screen.queryByRole('article', { name: 'Approval approval-2' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('tab', { name: /^Needs you/ })).toHaveTextContent('(3)');
});
it('persists customer notes, tags and flag, closes with Escape and restores focus', async () => {
  const user = userEvent.setup();
  renderInbox();
  await screen.findByText('40 conversations');
  await user.click(screen.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }));
  await user.click(await screen.findByRole('button', { name: 'Customer details' }));
  const dialog = await screen.findByRole('dialog', { name: 'Customer details' });
  expect(await within(dialog).findByText('Past orders')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Private notes'), 'Prefers afternoon delivery');
  await user.clear(screen.getByLabelText('Tags (comma separated)'));
  await user.type(screen.getByLabelText('Tags (comma separated)'), 'VIP, Returning');
  await user.click(screen.getByLabelText('Flag possible spam / scam'));
  await user.click(screen.getByRole('button', { name: 'Save customer details' }));
  await screen.findByText('Customer details saved.');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Customer details' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Customer details' }));
  expect(await screen.findByLabelText('Private notes')).toHaveValue('Prefers afternoon delivery');
  expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('VIP, Returning');
  expect(screen.getByLabelText('Flag possible spam / scam')).toBeChecked();
});
it('defaults notifications to ready-to-pay and needs-you only and remembers read/preferences across inbox tabs', async () => {
  const user = userEvent.setup();
  renderInbox();
  await screen.findByText('40 conversations');
  await user.click(screen.getByRole('tab', { name: 'Notifications' }));
  const centre = await screen.findByRole('region', { name: 'Notification centre' });
  expect(within(centre).getByLabelText('Ready to pay')).toBeChecked();
  expect(within(centre).getByLabelText('Needs you')).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Mark all read' }));
  expect(within(centre).queryByText('Unread')).not.toBeInTheDocument();
  await user.click(within(centre).getByLabelText('Ready to pay'));
  await user.click(screen.getByRole('tab', { name: 'Inbox' }));
  await user.keyboard('{End}');
  expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByLabelText('Ready to pay')).not.toBeChecked();
  expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Needs you'));
  expect(screen.getByText('You’re all caught up. No matching notifications.')).toBeInTheDocument();
});
it('keeps an unsent reply through realtime updates and shows clear take-over and hand-back states', async () => {
  const user = userEvent.setup();
  renderInbox();
  await screen.findByText('40 conversations');
  await user.click(screen.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }));
  await user.click(await screen.findByRole('button', { name: 'Let me check that for you.' }));
  expect(screen.getByLabelText('Your reply')).toHaveValue('Let me check that for you.');
  await user.click(screen.getByRole('button', { name: 'Back to inbox' }));
  await user.click(screen.getByRole('button', { name: /^Open chat with Musa Bello/ }));
  await screen.findByText('AI assistant active');
  expect(screen.getByLabelText('Your reply')).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Back to inbox' }));
  await user.click(screen.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }));
  await screen.findByText('AI assistant active');
  expect(screen.getByLabelText('Your reply')).toHaveValue('Let me check that for you.');
  await user.click(screen.getByRole('button', { name: 'Take Over' }));
  await screen.findByText('You’re in charge. AI is paused for this chat.');
  expect(screen.getByRole('link', { name: 'Open in WhatsApp' })).toHaveAttribute(
    'href',
    'https://web.whatsapp.com/',
  );
  expect(screen.getByLabelText('Your reply')).toHaveValue('Let me check that for you.');
  await user.click(screen.getByRole('button', { name: 'Hand Back' }));
  await screen.findByText('AI assistant active');
  expect(screen.getByLabelText('Your reply')).toHaveValue('Let me check that for you.');
  await user.click(screen.getByRole('button', { name: 'Send reply' }));
  await within(screen.getByLabelText('Chat messages')).findByText('Let me check that for you.');
  expect(screen.getByLabelText('Your reply')).toHaveValue('');
});
