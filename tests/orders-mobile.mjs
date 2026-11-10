import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { launchBrowser } from './helpers/chromium.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__shared = data;
      },
    }),
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = process.env.SELVORA_TEST_URL ?? 'http://localhost:3000/';
  await page.goto(base);
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Orders', exact: true })
    .click();
  await page.getByText('21 orders', { exact: true }).waitFor();
  const fits = async (label) =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${label}: no horizontal overflow`,
    );
  await fits('order list');
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await page.getByText('3 orders', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open order-1', exact: true }).click();
  await page
    .getByText('Screenshots can be faked. Check your bank before confirming.', { exact: true })
    .waitFor();
  await page.getByText('Not paid · awaiting verification', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mark awaiting payment', exact: true }).click();
  await page.getByRole('button', { name: 'Payment received', exact: true }).waitFor();
  const payment = page.getByRole('region', { name: 'Payment link', exact: true });
  assert.ok(
    (await payment.getByLabel('Payment link URL', { exact: true }).inputValue()).startsWith(
      'https://paystack.com/pay/selvora-sample-do-not-pay-',
    ),
  );
  await payment.getByRole('button', { name: 'Copy link', exact: true }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /paystack.com/);
  await payment.getByRole('button', { name: 'Share', exact: true }).click();
  assert.match(await page.evaluate(() => window.__shared.url), /paystack.com/);
  await page.getByRole('button', { name: 'Payment received', exact: true }).click();
  assert.ok(
    await page.getByRole('button', { name: 'Confirm payment received', exact: true }).isDisabled(),
  );
  await page.getByLabel('I checked my bank and received the full amount.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirm payment received', exact: true }).click();
  await page.getByText('Payment verified · Vendor bank check', { exact: true }).waitFor();
  const stock = page.getByRole('region', { name: 'Stock after payment', exact: true });
  await stock.getByText(/Low stock · 4 total/).waitFor();
  await stock.getByRole('button', { name: 'Restock', exact: true }).click();
  await stock.getByLabel('Units to add', { exact: true }).fill('5');
  await stock.getByRole('button', { name: 'Review restock', exact: true }).click();
  await stock.getByText(/Stock will change from 1 to 6/).waitFor();
  await stock.getByRole('button', { name: 'Confirm restock', exact: true }).click();
  await stock.getByText(/9 total/).waitFor();
  await page.getByRole('button', { name: 'Issue receipt', exact: true }).click();
  const receipt = page.getByRole('region', { name: 'Digital receipt', exact: true });
  await receipt.getByText('Receipt #0013', { exact: true }).waitFor();
  assert.ok((await receipt.innerText()).includes('₦102,500'));
  const downloaded = page.waitForEvent('download');
  await receipt.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pdfBytes = Buffer.concat(chunks);
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.match(pdf.getTitle(), /Receipt #0013/);
  assert.match(pdf.getSubject(), /Not proof of payment/);
  await receipt.getByRole('button', { name: 'Copy link', exact: true }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(new URL(shared).hash.startsWith('#sample='));
  await receipt.getByRole('button', { name: 'Share', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__shared.url), shared);
  for (const status of ['preparing', 'out for delivery', 'delivered']) {
    await page.getByRole('button', { name: `Mark ${status}`, exact: true }).click();
    await page
      .getByRole('button', { name: `Mark ${status}`, exact: true })
      .waitFor({ state: 'detached' });
  }
  await page.getByText('No further delivery updates available.', { exact: true }).waitFor();
  await receipt.getByText('Receipt #0013', { exact: true }).waitFor();
  assert.equal(
    await receipt.getByLabel('Sample receipt share link', { exact: true }).inputValue(),
    shared,
    'issued receipt snapshot remains unchanged after delivery',
  );
  await fits('delivered order');
  if (process.env.SELVORA_SCREENSHOT_DIR) {
    await mkdir(process.env.SELVORA_SCREENSHOT_DIR, { recursive: true });
    await receipt.screenshot({
      path: join(process.env.SELVORA_SCREENSHOT_DIR, 'receipt-phone.png'),
    });
    await download.saveAs(join(process.env.SELVORA_SCREENSHOT_DIR, 'receipt-0013.pdf'));
  }
  const reader = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await reader.goto(shared);
  await reader
    .getByRole('region', { name: 'Digital receipt', exact: true })
    .getByText('Receipt #0013', { exact: true })
    .waitFor();
  assert.ok((await reader.locator('body').innerText()).includes('unsigned sample snapshot'));
  assert.ok(
    await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'shared receipt fits phone',
  );
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Inbox', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open chat with Chidinma Okafor', exact: true }).click();
  await page
    .getByLabel('Chat messages')
    .getByText('Your order order-1 has been delivered. Thank you for shopping with us!', {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log(
    'PASS: 390×844 touch viewport: draft → awaiting payment → explicit bank confirmation → paid → delivered, screenshot safety, sample Paystack copy/share, one-time stock deduction, confirmed variant restock, immutable receipt, real PDF download, share preview in a fresh session, and delivery messages in inbox.',
  );
} finally {
  await browser.close();
}
