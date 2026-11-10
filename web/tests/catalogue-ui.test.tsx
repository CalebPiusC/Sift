import { it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../components/data/provider';
import { CataloguePanel } from '../components/data/catalogue-panel';
import { useDataClient } from '../components/data/provider';
function ErrorControl() {
  const { client } = useDataClient();
  return (
    <button onClick={() => void client.developer!.failNext('catalogue')}>
      Fail next catalogue request
    </button>
  );
}
const renderCatalogue = () =>
  render(
    <div style={{ width: 390, maxWidth: '100%' }}>
      <DataProvider mode="mock">
        <ErrorControl />
        <CataloguePanel />
      </DataProvider>
    </div>,
  );
it('adds 10 photo cards on a phone-width flow, confirms all, then updates stock by typing', async () => {
  const user = userEvent.setup();
  renderCatalogue();
  await screen.findByText('25 items');
  await user.click(screen.getByRole('button', { name: 'Add products' }));
  await user.upload(
    screen.getByLabelText('Choose product photos'),
    Array.from(
      { length: 10 },
      (_, i) => new File(['photo'], `item${i}.jpg`, { type: 'image/jpeg' }),
    ),
  );
  await screen.findByText('10 photo(s) · 10 item(s)');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Accessories' }));
  await user.click(screen.getByRole('button', { name: 'Get suggestions' }));
  expect(await screen.findByText(/Sample AI extraction/)).toBeInTheDocument();
  expect(screen.getAllByRole('article', { name: /^Item \d+$/ })).toHaveLength(10);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  for (let i = 1; i <= 10; i++) {
    const card = within(screen.getByRole('article', { name: `Price for item ${i}` }));
    await user.type(card.getByLabelText('Price (₦)'), '15k');
    await user.type(card.getByLabelText('Lowest price (₦)'), 'N1.5k');
    await user.tab();
  }
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  const confirm = screen.getByRole('button', { name: 'Confirm all 10 items' });
  expect(confirm).toBeInTheDocument();
  await user.click(confirm);
  expect(await screen.findByText('35 items')).toBeInTheDocument();
  await user.type(screen.getByLabelText('What changed?'), 'black sneakers finished');
  await user.click(screen.getByRole('button', { name: 'Review update' }));
  expect(await screen.findByText('Set Black Sneakers stock to 0.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Confirm update' }));
  expect(await screen.findByText('Updated Black Sneakers.')).toBeInTheDocument();
  await user.click(
    within(screen.getByRole('group', { name: 'Filter by stock' })).getByRole('button', {
      name: 'Out of stock',
    }),
  );
  expect(await screen.findByText('2 items')).toBeInTheDocument();
}, 20000);
it('detail edits remain unsaved until confirmation, including per-variant stock and threshold', async () => {
  const user = userEvent.setup();
  renderCatalogue();
  await screen.findByText('25 items');
  await user.click(screen.getByRole('button', { name: /Indigo Adire Set/ }));
  await screen.findByRole('button', { name: 'Edit item' });
  await user.click(screen.getByRole('button', { name: 'Edit item' }));
  const stocks = screen.getAllByLabelText('Variant stock');
  await user.clear(stocks[0]);
  await user.type(stocks[0], '2');
  await user.clear(stocks[1]);
  await user.type(stocks[1], '0');
  const threshold = screen.getByLabelText('Low-stock alert at');
  await user.clear(threshold);
  await user.type(threshold, '4');
  await user.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('button', { name: 'Confirm changes' })).toBeInTheDocument();
  expect(screen.getByText('2 in stock · Low-stock alert at 4')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Confirm changes' }));
  expect(await screen.findByText('Low', { exact: true })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Archive item' }));
  await user.click(screen.getByRole('button', { name: 'Confirm archive' }));
  expect(await screen.findByText('24 items')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Show archived' }));
  expect(await screen.findByText('1 items · Archived')).toBeInTheDocument();
});
it('requires a product picker for ambiguous updates and can cancel without saving', async () => {
  const user = userEvent.setup();
  renderCatalogue();
  await screen.findByText('25 items');
  await user.type(screen.getByLabelText('What changed?'), 'raise adire price to 30k');
  await user.click(screen.getByRole('button', { name: 'Review update' }));
  expect(await screen.findByText('Which item did you mean?')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm update' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Indigo Adire Set' }));
  expect(
    screen.getByText(/Set Indigo Adire Set price and every variant price to ₦30,000/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel update' }));
  expect(screen.queryByRole('button', { name: 'Confirm update' })).not.toBeInTheDocument();
});
it('shows category questions for Shoes without a category text input', async () => {
  const user = userEvent.setup();
  renderCatalogue();
  await screen.findByText('25 items');
  await user.click(screen.getByRole('button', { name: 'Add products' }));
  await user.upload(
    screen.getByLabelText('Choose product photos'),
    new File(['x'], 'shoe.png', { type: 'image/png' }),
  );
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Shoes' }));
  await user.click(screen.getByRole('button', { name: 'Get suggestions' }));
  expect(await screen.findByText('Which sizes do you sell?')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Tap at least one shoe size');
  await user.click(screen.getByRole('button', { name: 'Size 42' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByLabelText('Price (₦)')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Category' })).not.toBeInTheDocument();
});
it('shows skeletons, retryable errors, empty filters and rejects non-photo uploads', async () => {
  const user = userEvent.setup();
  renderCatalogue();
  await screen.findByText('25 items');
  await user.click(screen.getByRole('button', { name: 'Fail next catalogue request' }));
  await user.click(
    within(screen.getByRole('group', { name: 'Filter by stock' })).getByRole('button', {
      name: 'Out of stock',
    }),
  );
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('1 items');
  await user.type(screen.getByPlaceholderText('Search catalogue'), 'none');
  expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add products' }));
  const input = screen.getByLabelText('Choose product photos');
  await userEvent
    .setup({ applyAccept: false })
    .upload(input, new File(['bad'], 'sound.mp3', { type: 'audio/mpeg' }));
  expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG or WebP');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

it.each(['Food & drink', 'Services'] as const)(
  'requires category-specific facts for %s',
  async (category) => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByText('25 items');
    await user.click(screen.getByRole('button', { name: 'Add products' }));
    await user.upload(
      screen.getByLabelText('Choose product photos'),
      new File(['x'], 'item.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: category }));
    await user.click(screen.getByRole('button', { name: 'Get suggestions' }));
    const field = await screen.findByLabelText(
      category === 'Services' ? 'Duration (minutes)' : 'Prep time (minutes)',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    if (category === 'Food & drink')
      await user.type(screen.getByLabelText('Portion'), '750 ml bowl');
    await user.type(field, '30');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Price (₦)')).toBeInTheDocument();
  },
);
