import { it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { InsightsPanel } from '../components/data/insights-panel';
import { MessageBubble } from '../components/inbox/message-bubble';
import { createSeed } from '../lib/data/seed';
const setup = () => {
  render(
    <DataProvider mode="mock">
      <InsightsPanel />
    </DataProvider>,
  );
  return userEvent.setup();
};
it('renders seven charts and summary text and date empty/invalid states', async () => {
  const user = setup();
  await screen.findByRole('region', { name: 'Leads by channel' });
  for (const title of [
    'Response time',
    'Conversion by stage',
    'Top products',
    'Revenue over time',
    'Busiest hours',
    'AI versus vendor',
  ])
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  await user.clear(screen.getByLabelText('From'));
  await user.type(screen.getByLabelText('From'), '2000-01-01');
  await user.clear(screen.getByLabelText('To'));
  await user.type(screen.getByLabelText('To'), '2000-01-02');
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Top products' })).toHaveTextContent('No activity'),
  );
  await user.clear(screen.getByLabelText('To'));
  await user.type(screen.getByLabelText('To'), '1999-01-01');
  expect(screen.getByRole('alert')).toHaveTextContent('start on or before');
});
it('configures follow-ups and retains changes on tab revisit', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Follow-ups' }));
  await user.click(await screen.findByLabelText('Enable cold-lead follow-ups'));
  await user.clear(screen.getByLabelText('Hours after inactivity'));
  await user.type(screen.getByLabelText('Hours after inactivity'), '72');
  await user.selectOptions(screen.getByLabelText('Message style'), 'professional');
  await user.click(screen.getByRole('button', { name: 'Save follow-ups' }));
  await screen.findByText('Follow-up settings saved for this session.');
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Simulate send now' })[0]).toBeEnabled(),
  );
  await user.click(screen.getAllByRole('button', { name: 'Simulate send now' })[0]);
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Simulate send now' })).toHaveLength(2),
  );
  await user.click(screen.getByRole('button', { name: 'Overview' }));
  await user.click(screen.getByRole('button', { name: 'Follow-ups' }));
  expect(await screen.findByLabelText('Hours after inactivity')).toHaveValue(72);
  expect(screen.getByLabelText('Enable cold-lead follow-ups')).toBeChecked();
});
it('clears flags, shows low-stock variants and simulates restock alerts', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Spam & scam' }));
  await user.click((await screen.findAllByRole('button', { name: 'Not spam' }))[0]);
  await waitFor(() =>
    expect(screen.getByRole('article', { name: 'Flag flag-1' })).toHaveTextContent('cleared'),
  );
  await user.click(screen.getByRole('button', { name: 'Restock' }));
  await screen.findByText('Low-stock list');
  await user.click((await screen.findAllByRole('button', { name: 'Simulate restock alert' }))[0]);
  await screen.findByText('Chidinma Okafor · notified');
  expect(
    screen.getByText(/Availability is checked against current catalogue stock/),
  ).toBeInTheDocument();
});
it('searches customers, opens history, saves memory and finds it by note', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Customers' }));
  await user.type(await screen.findByLabelText('Search customers'), 'Chidinma');
  await user.click(await screen.findByRole('button', { name: /Chidinma Okafor/ }));
  await screen.findByText('Order history');
  await user.clear(await screen.findByLabelText('Customer notes'));
  await user.type(screen.getByLabelText('Customer notes'), 'Prefers indigo. Deliver after 5pm.');
  await user.click(screen.getByRole('button', { name: 'Save customer memory' }));
  await screen.findByText('Customer memory saved.');
  await user.click(screen.getByRole('button', { name: 'Back to customers' }));
  await user.clear(screen.getByLabelText('Search customers'));
  await user.type(screen.getByLabelText('Search customers'), 'Deliver after 5pm');
  await user.click(await screen.findByRole('button', { name: /Chidinma Okafor/ }));
  expect(await screen.findByLabelText('Customer notes')).toHaveValue(
    'Prefers indigo. Deliver after 5pm.',
  );
});
it('shows original and sample English summary together without pretending missing summaries exist', () => {
  const m = createSeed().messages.find((m) => m.englishSummary)!;
  const { rerender } = render(<MessageBubble message={m} sample />);
  const box = screen.getByRole('region', { name: 'Language summary' });
  expect(within(box).getByText('Original · Nigerian Pidgin')).toBeInTheDocument();
  expect(within(box).getByText(m.englishSummary!)).toBeInTheDocument();
  expect(box).toHaveTextContent('not live translation');
  rerender(<MessageBubble message={{ ...m, englishSummary: null }} />);
  expect(
    screen.getByText('Summary unavailable. Review the original before replying.'),
  ).toBeInTheDocument();
});
