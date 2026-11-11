// @vitest-environment node
import { it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { createMockClient, type DataClient, type Result, type OrderStatus } from '../lib/data';
import {
  sampleReceiptLink,
  readSampleReceipt,
  safePaymentLink,
  safeReceiptLink,
} from '../lib/data/receipt-share';
import { receiptPdf } from '../lib/receipts/pdf';
const clients: DataClient[] = [];
const mock = () => {
  const c = createMockClient({ latencyMs: 0 });
  clients.push(c);
  return c;
};
function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.dispose();
});
async function awaiting(c: DataClient, id = 'order-1') {
  const o = data(await c.orders.get(id));
  return data(
    await c.orders.setStatus({ id, status: 'awaiting_payment', expectedRevision: o.revision }),
  );
}
async function pay(c: DataClient, id = 'order-1') {
  const o = await awaiting(c, id);
  return data(
    await c.orders.confirmPayment({ id, source: 'vendor', expectedRevision: o.revision }),
  );
}
it('filters all seven states and searches customers, IDs and items', async () => {
  const c = mock();
  expect(data(await c.orders.list()).total).toBe(21);
  for (const status of [
    'draft',
    'awaiting_payment',
    'paid',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ] as OrderStatus[])
    expect(data(await c.orders.list({ status })).total).toBe(3);
  expect(data(await c.orders.list({ search: 'Chidinma' })).items.map((o) => o.id)).toEqual([
    'order-1',
  ]);
  expect(
    data(await c.orders.list({ status: 'draft', search: 'indigo adire' })).items.some(
      (o) => o.id === 'order-1',
    ),
  ).toBe(true);
  expect(data(await c.orders.list({ limit: 1, offset: 1 })).items).toHaveLength(1);
});
it('moves draft → awaiting payment → paid → delivered, emitting exactly the previewed customer messages', async () => {
  const c = mock();
  let o = data(await c.orders.get('order-1'));
  expect(
    (await c.orders.setStatus({ id: o.id, status: 'paid', expectedRevision: o.revision })).ok,
  ).toBe(false);
  expect(
    (await c.orders.confirmPayment({ id: o.id, source: 'vendor', expectedRevision: o.revision }))
      .ok,
  ).toBe(false);
  o = await pay(c);
  for (const status of ['preparing', 'out_for_delivery', 'delivered'] as const)
    o = data(await c.orders.setStatus({ id: o.id, status, expectedRevision: o.revision }));
  expect(o.status).toBe('delivered');
  expect(o.paymentStatus).toBe('paid');
  const messages = data(
    await c.messages.list({ conversationId: 'conversation-1', limit: 100 }),
  ).items.map((m) => m.text);
  for (const event of o.timeline.filter((t) => t.customerMessage))
    expect(messages).toContain(event.customerMessage);
  expect(
    (await c.orders.setStatus({ id: o.id, status: 'draft', expectedRevision: o.revision })).ok,
  ).toBe(false);
  expect(data(await c.conversations.get('conversation-1')).stage).toBe('paid');
});
it('never treats screenshots, forged sources or stale confirmations as verified payment', async () => {
  const c = mock();
  let o = await awaiting(c, 'order-8');
  expect(o.paymentScreenshotReceived).toBe(false);
  const stale = o.revision;
  o = data(await c.developer!.simulatePaymentScreenshot({ orderId: o.id }));
  expect(o.paymentStatus).toBe('unpaid');
  expect(o.paymentScreenshotReceived).toBe(true);
  expect(
    (await c.orders.confirmPayment({ id: o.id, source: 'vendor', expectedRevision: stale })).ok,
  ).toBe(false);
  for (const source of ['screenshot', 'paystack', 'customer'])
    expect(
      (
        await c.orders.confirmPayment({
          id: o.id,
          source: source as 'vendor',
          expectedRevision: o.revision,
        })
      ).ok,
    ).toBe(false);
  expect((await c.receipts.issue({ orderId: o.id })).ok).toBe(false);
  expect(data(await c.orders.get(o.id)).paymentStatus).toBe('unpaid');
  expect((await c.developer!.simulatePaymentScreenshot({ orderId: 'other-tenant-order' })).ok).toBe(
    false,
  );
});
it('deducts tracked variant stock only once and records low stock and payment timeline', async () => {
  const c = mock();
  const before = data(await c.catalogue.get('product-1'));
  const o = await pay(c);
  const after = data(await c.catalogue.get('product-1'));
  expect(after.stock).toBe(before.stock! - 4);
  expect(after.variants[0].stock).toBe(before.variants[0].stock! - 4);
  expect(after.variants[1].stock).toBe(before.variants[1].stock);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.stock).toBeLessThanOrEqual(after.lowStockThreshold);
  expect(o.stockMovements[0]).toMatchObject({ requested: 4, deducted: 4, shortfall: 0 });
  await Promise.all([
    c.orders.confirmPayment({ id: o.id, source: 'vendor', expectedRevision: 1 }),
    c.orders.confirmPayment({ id: o.id, source: 'vendor', expectedRevision: 1 }),
  ]);
  expect(data(await c.catalogue.get('product-1')).stock).toBe(after.stock);
  expect(
    data(await c.orders.get(o.id)).timeline.filter((e) => e.label === 'Payment verified by vendor'),
  ).toHaveLength(1);
});
it('records a real payment even with shortages without negative stock or guessed variants', async () => {
  const c = mock();
  const p = data(await c.catalogue.get('product-1'));
  const { id, vendorId, revision, archived, ...input } = p;
  const variants = p.variants.map((v, i) => ({ ...v, stock: i === 0 ? 1 : 0 }));
  data(
    await c.catalogue.update({
      id,
      expectedRevision: revision,
      product: { ...input, stock: 1, variants },
    }),
  );
  const o = await pay(c);
  expect(o.paymentStatus).toBe('paid');
  expect(o.stockMovements[0]).toMatchObject({ requested: 4, deducted: 1, shortfall: 3 });
  expect(data(await c.catalogue.get('product-1')).stock).toBe(0);
});
it('does not decrement untracked services or choose a missing variant', async () => {
  const c = mock();
  const p = data(await c.catalogue.get('product-1'));
  const { id, vendorId, revision, archived, ...input } = p;
  data(
    await c.catalogue.update({
      id,
      expectedRevision: revision,
      product: { ...input, stock: null, variants: p.variants.map((v) => ({ ...v, stock: null })) },
    }),
  );
  const o = await pay(c);
  expect(o.stockMovements[0]).toMatchObject({ deducted: 0, shortfall: 0 });
  expect(data(await c.catalogue.get('product-1')).stock).toBeNull();
  const other = mock();
  const item = data(await other.catalogue.get('product-1'));
  const { id: i, vendorId: v, revision: r, archived: a, ...body } = item;
  data(
    await other.catalogue.update({
      id: i,
      expectedRevision: r,
      product: { ...body, variants: [] },
    }),
  );
  const missing = await pay(other);
  expect(missing.stockMovements[0].shortfall).toBe(4);
  expect(data(await other.catalogue.get(i)).stock).toBe(item.stock);
});
it('makes cancellation explicit and never implies automatic refund/restock or rewrites a receipt', async () => {
  const c = mock();
  let o = await pay(c);
  const receipt = data(await c.receipts.issue({ orderId: o.id }));
  const stock = data(await c.catalogue.get('product-1')).stock;
  o = data(await c.orders.get(o.id));
  const cancelled = data(
    await c.orders.setStatus({ id: o.id, status: 'cancelled', expectedRevision: o.revision }),
  );
  expect(cancelled.paymentStatus).toBe('paid');
  expect(data(await c.catalogue.get('product-1')).stock).toBe(stock);
  expect(data(await c.receipts.get(receipt.id))).toEqual(receipt);
  expect(
    (
      await c.orders.setStatus({
        id: o.id,
        status: 'preparing',
        expectedRevision: cancelled.revision,
      })
    ).ok,
  ).toBe(false);
});
it('issues monotonic tenant-scoped immutable receipts idempotently, freezing vendor name and totals', async () => {
  const c = mock();
  const before = data(await c.receipts.list());
  await pay(c);
  const [a, b] = await Promise.all([
    c.receipts.issue({ orderId: 'order-1' }),
    c.receipts.issue({ orderId: 'order-1' }),
  ]);
  const r = data(a);
  expect(r).toEqual(data(b));
  expect(r.number).toBe(Math.max(...before.items.map((r) => r.number)) + 1);
  expect(r.subtotalKobo + r.deliveryFeeKobo).toBe(r.totalKobo);
  expect(r.vendorName).toBe('Adire by Tola');
  await c.settings.update({ businessName: 'A new business name' });
  r.items[0].name = 'Tampered';
  expect(data(await c.receipts.get(r.id)).vendorName).toBe('Adire by Tola');
  expect(data(await c.receipts.get(r.id)).items[0].name).not.toBe('Tampered');
  expect(data(await c.receipts.list()).total).toBe(before.total + 1);
  expect((await c.receipts.get('foreign-receipt')).ok).toBe(false);
});
it('round-trips sample share snapshots across sessions, marks them unsigned and rejects invalid totals/URLs', async () => {
  const c = mock();
  const r = data(await c.receipts.list()).items[0];
  const link = sampleReceiptLink(r, 'https://vendor.example');
  expect(readSampleReceipt(new URL(link).hash)).toEqual(r);
  expect(readSampleReceipt('#sample=garbage')).toBeNull();
  expect(
    readSampleReceipt(
      new URL(sampleReceiptLink({ ...r, totalKobo: r.totalKobo + 1 }, 'https://vendor.example'))
        .hash,
    ),
  ).toBeNull();
  expect(safePaymentLink('javascript:alert(1)')).toBeNull();
  expect(safePaymentLink('https://paystack.com.evil.test/pay')).toBeNull();
  expect(safePaymentLink('https://paystack.com/pay/sample')).toBe(
    'https://paystack.com/pay/sample',
  );
  expect(safeReceiptLink('javascript:alert(1)')).toBeNull();
});
it('generates an actual multi-page PDF with an embedded naira-capable font and frozen receipt metadata', async () => {
  const c = mock();
  const r = data(await c.receipts.list()).items[0];
  const bytes = await readFile('public/fonts/receipt-inter.ttf');
  const items = Array.from({ length: 60 }, () => ({ ...r.items[0] }));
  const subtotalKobo = items.reduce((n, i) => n + i.quantity * i.unitPriceKobo, 0);
  const pdf = await receiptPdf(
    { ...r, items, subtotalKobo, totalKobo: subtotalKobo + r.deliveryFeeKobo },
    bytes,
    true,
  );
  if (process.env.RECEIPT_PDF_OUTPUT) await writeFile(process.env.RECEIPT_PDF_OUTPUT, pdf);
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  await expect(receiptPdf({ ...r, totalKobo: r.totalKobo + 1 }, bytes, true)).rejects.toThrow(
    'Invalid receipt',
  );
  const doc = await PDFDocument.load(pdf);
  expect(doc.getPageCount()).toBeGreaterThan(1);
  // Guard the actual font program, not just extractable text: glyph subsetting
  // produced PDFs whose text extracted correctly but rendered missing letters.
  const fonts = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const embedded = fonts.lookup(fonts.keys()[0], PDFDict);
  const descendant = embedded.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
  const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
  const fontStream = descriptor.lookup(PDFName.of('FontFile2'));
  expect(fontStream).toBeInstanceOf(PDFRawStream);
  expect(Buffer.from(decodePDFRawStream(fontStream as PDFRawStream).decode())).toEqual(
    Buffer.from(bytes),
  );
  expect(doc.getTitle()).toContain(r.vendorName);
  expect(doc.getSubject()).toContain('Not proof of payment');
  expect(Math.floor(doc.getCreationDate()!.getTime() / 1000)).toBe(
    Math.floor(Date.parse(r.issuedAt) / 1000),
  );
});

it('publishes payment invalidations only after stock, order and revision are committed', async () => {
  const c = mock();
  const o = await awaiting(c);
  const reads: Promise<Result<import('../lib/data').Order>>[] = [];
  const subscription = await c.realtime.subscribe((event) => {
    if (event.area === 'catalogue' || event.area === 'orders') reads.push(c.orders.get(o.id));
  });
  await c.orders.confirmPayment({ id: o.id, source: 'vendor', expectedRevision: o.revision });
  expect(reads.length).toBeGreaterThan(0);
  for (const result of await Promise.all(reads)) {
    const committed = data(result);
    expect(committed.paymentStatus).toBe('paid');
    expect(committed.status).toBe('paid');
    expect(committed.revision).toBe(o.revision + 1);
    expect(committed.stockMovements[0].deducted).toBe(4);
  }
  if (subscription.ok) subscription.data();
});
