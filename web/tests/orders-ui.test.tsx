import { it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { OrdersPanel } from '../components/data/orders-panel';
const renderOrders = () =>
  render(
    <div style={{ width: 390, maxWidth: '100%' }}>
      <DataProvider mode="mock">
        <OrdersPanel />
      </DataProvider>
    </div>,
  );
it('runs a draft through verified payment to delivered and issues a read-only receipt on a phone-width screen', async () => {
  const user = userEvent.setup();
  renderOrders();
  await screen.findByText('21 orders');
  await user.click(screen.getByRole('button', { name: /^Open order-1\s/ }));
  expect(
    await screen.findByText('Screenshots can be faked. Check your bank before confirming.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Not paid · awaiting verification')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Payment received$/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Mark awaiting payment' }));
  await screen.findByRole('button', { name: 'Payment received' });
  expect(screen.getByRole('region', { name: 'Payment link' })).toHaveTextContent(
    'not a live payment checkout',
  );
  await user.click(screen.getByRole('button', { name: 'Payment received' }));
  expect(screen.getByRole('button', { name: 'Confirm payment received' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel confirmation' }));
  expect(screen.getByText('Not paid · awaiting verification')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Payment received' }));
  await user.click(screen.getByLabelText('I checked my bank and received the full amount.'));
  await user.click(screen.getByRole('button', { name: 'Confirm payment received' }));
  expect(await screen.findByText('Payment verified · Vendor bank check')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Stock after payment' })).toHaveTextContent(
      'Low stock · 4 total',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Issue receipt' }));
  const receipt = await screen.findByRole('region', { name: 'Digital receipt' });
  expect(receipt).toHaveTextContent('Adire by Tola');
  expect(receipt).toHaveTextContent('Receipt #0013');
  expect(receipt).toHaveTextContent('₦102,500');
  expect(within(receipt).getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  expect(within(receipt).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  for (const step of ['preparing', 'out for delivery', 'delivered']) {
    await user.click(screen.getByRole('button', { name: `Mark ${step}` }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: `Mark ${step}` })).not.toBeInTheDocument(),
    );
  }
  expect(screen.getByText('No further delivery updates available.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Digital receipt' })).toHaveTextContent(
    'Receipt #0013',
  );
});
it('filters/searches all states and opens immutable historic receipts', async () => {
  const user = userEvent.setup();
  renderOrders();
  await screen.findByText('21 orders');
  await user.click(screen.getByRole('button', { name: /^Draft$/ }));
  await screen.findByText('3 orders');
  await user.type(screen.getByPlaceholderText('Search order, customer or item'), 'nothing matches');
  expect(
    await screen.findByText('No orders match. Try another filter or search.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  await screen.findByText('21 orders');
  await user.click(screen.getByRole('button', { name: 'View receipts' }));
  await screen.findByText('12 receipts');
  await user.click(screen.getByRole('button', { name: /^Open Receipt #0001/ }));
  expect(await screen.findByRole('region', { name: 'Digital receipt' })).toHaveTextContent(
    'Receipt #0001',
  );
});
it('restocks a selected variant only after explicit review and confirmation', async () => {
  const user = userEvent.setup();
  renderOrders();
  await screen.findByText('21 orders');
  await user.click(screen.getByRole('button', { name: /^Open order-1\s/ }));
  await screen.findByRole('button', { name: 'Mark awaiting payment' });
  await user.click(screen.getByRole('button', { name: 'Mark awaiting payment' }));
  await user.click(await screen.findByRole('button', { name: 'Payment received' }));
  await user.click(screen.getByLabelText('I checked my bank and received the full amount.'));
  await user.click(screen.getByRole('button', { name: 'Confirm payment received' }));
  await user.click(await screen.findByRole('button', { name: 'Restock' }));
  await user.type(screen.getByLabelText('Units to add'), '5');
  await user.click(screen.getByRole('button', { name: 'Review restock' }));
  expect(screen.getByText(/Stock will change from 1 to 6/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Confirm restock' }));
  await screen.findByText('Restock saved.');
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Stock after payment' })).toHaveTextContent(
      '9 total',
    ),
  );
  expect(screen.getByRole('region', { name: 'Stock after payment' })).toHaveTextContent(
    'Medium / Indigo: 6',
  );
});
it('cancels only with confirmation and does not mistake a new screenshot for payment', async () => {
  const user = userEvent.setup();
  renderOrders();
  await screen.findByText('21 orders');
  await user.click(screen.getByRole('button', { name: /^Open order-2\s/ }));
  await user.click(await screen.findByRole('button', { name: 'Simulate payment screenshot' }));
  await screen.findByText('Screenshots can be faked. Check your bank before confirming.');
  expect(screen.getByText('Not paid · awaiting verification')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel order' }));
  expect(screen.getByText(/Cancellation does not refund a payment/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep order' }));
  expect(screen.getByRole('button', { name: 'Payment received' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel order' }));
  await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByText('No further delivery updates available.');
  expect(screen.queryByRole('button', { name: 'Payment received' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Issue receipt' })).not.toBeInTheDocument();
});
