import { it, expect, afterEach, vi } from 'vitest';
import {
  createMockClient,
  type Result,
  type DataClient,
  type ProductInput,
  type ProductPhoto,
} from '../lib/data';
import { money, stockBadge, parseUpdate } from '../lib/data/catalogue-logic';
const photo: ProductPhoto = { id: 'photo', url: 'data:image/jpeg;base64,eA==', name: 'item.jpg' };
const clients: DataClient[] = [];
const mock = () => {
  const c = createMockClient({ latencyMs: 0 });
  clients.push(c);
  return c;
};
function value<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.dispose();
});
it.each([
  ['15k', 1500000],
  ['N1.5k', 150000],
  ['₦15,000', 1500000],
  ['15000.50', 1500050],
  ['-1', null],
  ['15,00', null],
  ['abc', null],
])('parses naira %s', (text, amount) => expect(money(text as string)).toBe(amount));
it('extracts category drafts without prices or mutations, with one card per photo', async () => {
  const c = mock();
  const photos = Array.from({ length: 10 }, (_, i) => ({ ...photo, id: `p${i}` }));
  const drafts = value(await c.catalogue.extract({ photos, category: 'Shoes', bulk: true }));
  expect(drafts).toHaveLength(10);
  expect(
    drafts.every(
      (d) =>
        d.product.photos.length === 1 &&
        d.product.priceKobo === 0 &&
        d.product.details.sizes.length === 0,
    ),
  ).toBe(true);
  expect(value(await c.catalogue.list()).total).toBe(25);
  expect(
    value(await c.catalogue.extract({ photos, category: 'Fashion', bulk: false })),
  ).toHaveLength(1);
});
it('creates ten items atomically, retries idempotently and enforces category-specific facts', async () => {
  const c = mock();
  const drafts = value(
    await c.catalogue.extract({
      photos: Array.from({ length: 10 }, (_, i) => ({ ...photo, id: `p${i}` })),
      category: 'Accessories',
      bulk: true,
    }),
  );
  const products = drafts.map((d) => ({
    ...d.product,
    priceKobo: 1500000,
    lowestPriceKobo: 1200000,
  }));
  expect(
    (
      await c.catalogue.createMany({
        requestId: 'batch',
        products: [...products.slice(0, 9), { ...products[9], lowestPriceKobo: 2000000 }],
      })
    ).ok,
  ).toBe(false);
  expect(value(await c.catalogue.list()).total).toBe(25);
  const first = value(await c.catalogue.createMany({ requestId: 'batch', products }));
  expect(first).toHaveLength(10);
  expect(
    value(await c.catalogue.createMany({ requestId: 'batch', products })).map((p) => p.id),
  ).toEqual(first.map((p) => p.id));
  expect(value(await c.catalogue.list()).total).toBe(35);
  for (const category of ['Shoes', 'Food & drink', 'Services'] as const) {
    const draft = value(await c.catalogue.extract({ photos: [photo], category, bulk: false }))[0]
      .product;
    const p = { ...draft, priceKobo: 1500000, lowestPriceKobo: 1000000 };
    expect((await c.catalogue.createMany({ requestId: category, products: [p] })).ok).toBe(false);
  }
});
it('stock filters include all four badges; archive is reversible and keeps historical orders', async () => {
  const c = mock();
  for (const stock of ['in_stock', 'low', 'out', 'not_tracked'] as const) {
    const page = value(await c.catalogue.list({ stock }));
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((p) => stockBadge(p) === stock)).toBe(true);
  }
  const p = value(await c.catalogue.get('product-1'));
  expect(
    value(await c.catalogue.archive({ id: p.id, expectedRevision: p.revision, archived: true }))
      .archived,
  ).toBe(true);
  expect(value(await c.catalogue.list()).total).toBe(24);
  expect(value(await c.catalogue.list({ archived: true })).total).toBe(1);
  expect(value(await c.orders.get('order-1')).items[0].name).toBe(p.name);
  expect((await c.catalogue.archive({ id: p.id, expectedRevision: 1, archived: false })).ok).toBe(
    false,
  );
});
it('typed updates are proposals only, require a picker and reject stale confirmations', async () => {
  const c = mock();
  const draft = value(
    await c.catalogue.extract({
      photos: [photo, { ...photo, id: 'p2' }],
      category: 'Accessories',
      bulk: true,
    }),
  );
  await c.catalogue.createMany({
    requestId: 'bags',
    products: draft.map((d) => ({ ...d.product, priceKobo: 1500000, lowestPriceKobo: 1000000 })),
  });
  const proposal = value(await c.catalogue.proposeText({ text: 'raise bag price to 20k' }));
  expect(proposal.candidates.length).toBeGreaterThan(1);
  const chosen = proposal.candidates[0];
  expect(value(await c.catalogue.get(chosen.id)).priceKobo).not.toBe(2000000);
  expect(
    (await c.catalogue.confirmText({ proposalId: proposal.id, productId: 'not-a-match' })).ok,
  ).toBe(false);
  expect(
    value(await c.catalogue.confirmText({ proposalId: proposal.id, productId: chosen.id }))
      .priceKobo,
  ).toBe(2000000);
  expect(
    (await c.catalogue.confirmText({ proposalId: proposal.id, productId: chosen.id })).ok,
  ).toBe(false);
  const stale = value(await c.catalogue.proposeText({ text: 'black sneakers finished' }));
  const p = value(await c.catalogue.get(stale.candidates[0].id));
  await c.catalogue.update({
    id: p.id,
    expectedRevision: p.revision,
    product: { ...p, name: 'Black Sneakers New' },
  });
  expect((await c.catalogue.confirmText({ proposalId: stale.id, productId: p.id })).ok).toBe(false);
});
it('typed stock and price confirmations enforce floors, variants and untracked items', async () => {
  const c = mock();
  const p = value(await c.catalogue.get('product-1'));
  const proposal = value(await c.catalogue.proposeText({ text: 'indigo adire set finished' }));
  const result = value(await c.catalogue.confirmText({ proposalId: proposal.id, productId: p.id }));
  expect(result.stock).toBe(0);
  expect(result.variants.every((v) => v.stock === 0)).toBe(true);
  const low = value(await c.catalogue.proposeText({ text: 'raise bag price to N1.5k' }));
  expect(
    (await c.catalogue.confirmText({ proposalId: low.id, productId: low.candidates[0].id })).ok,
  ).toBe(false);
  const notTracked = value(
    await c.catalogue.proposeText({ text: 'personal styling session finished' }),
  );
  expect(
    (
      await c.catalogue.confirmText({
        proposalId: notTracked.id,
        productId: notTracked.candidates[0].id,
      })
    ).ok,
  ).toBe(false);
  expect(parseUpdate('delete all prices').ok).toBe(false);
});
it('detail edits validate variant sums and emit a catalogue event', async () => {
  const c = mock();
  const events: string[] = [];
  const unsub = value(await c.realtime.subscribe((e) => events.push(e.area)));
  const p = value(await c.catalogue.get('product-1'));
  expect(
    (
      await c.catalogue.update({
        id: p.id,
        expectedRevision: p.revision,
        product: { ...p, stock: 999 },
      })
    ).ok,
  ).toBe(false);
  const updated = value(
    await c.catalogue.update({
      id: p.id,
      expectedRevision: p.revision,
      product: {
        ...p,
        variants: p.variants.map((v, i) => ({ ...v, stock: i === 0 ? 2 : 0 })),
        stock: 2,
        lowStockThreshold: 4,
      },
    }),
  );
  expect(stockBadge(updated)).toBe('low');
  expect(events).toContain('catalogue');
  unsub();
});
