import assert from 'node:assert/strict';
import { launchBrowser } from './helpers/chromium.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3001/');
  await page.getByText('40 conversations', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Your business', { exact: true }).waitFor();
  const section = async (name) => {
    await page.getByRole('button', { name, exact: true }).click();
  };
  const fits = async () =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no phone overflow',
    );
  await section('channels');
  await page.getByRole('button', { name: 'Connect Facebook', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate authorisation', exact: true }).click();
  await page.getByText('Facebook sample connection complete.', { exact: true }).waitFor();
  await fits();
  await page.getByRole('button', { name: 'Link WhatsApp helper', exact: true }).click();
  await page.getByLabel('WhatsApp link code').waitFor();
  assert.match(await page.getByLabel('WhatsApp link code').innerText(), /^\d{4}$/);
  await page.getByRole('button', { name: 'Simulate sent code', exact: true }).click();
  await page.getByText('Helper linked successfully', { exact: true }).waitFor();
  await fits();
  await page.getByRole('button', { name: 'Back to channels', exact: true }).click();
  await section('replies');
  await page.getByLabel('Auto-negotiate', { exact: true }).check();
  await page.getByRole('button', { name: 'Save reply settings', exact: true }).click();
  await page.getByText('Reply settings saved for this session.', { exact: true }).waitFor();
  await fits();
  await section('negotiation');
  await page.getByLabel('Customer offer (₦)', { exact: true }).fill('10000');
  await fits();
  await section('team');
  await page.getByLabel('Name', { exact: true }).fill('Bisi Cole');
  await page.getByLabel('Email', { exact: true }).fill('bisi@example.test');
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await page
    .getByRole('article', { name: 'Teammate Bisi Cole', exact: true })
    .getByRole('button', { name: 'Simulate acceptance', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Bisi Cole · agent', exact: true })
    .waitFor({ state: 'attached' });
  await page
    .getByRole('combobox', { name: /^Assign to/ })
    .selectOption({ label: 'Bisi Cole · agent' });
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await page.getByText('Assigned Chidinma Okafor to Bisi Cole.', { exact: true }).waitFor();
  await fits();
  await section('billing');
  await page.getByRole('button', { name: 'Paystack · select Growth yearly', exact: true }).click();
  await page.getByText('Selected · no purchase made', { exact: true }).waitFor();
  await fits();
  await section('preferences');
  await page.getByLabel('Low-data mode', { exact: true }).check();
  await page.getByLabel('Dark mode', { exact: true }).check();
  await page.getByLabel('Ready to pay alerts', { exact: true }).uncheck();
  await page.getByRole('combobox', { name: /^App language/ }).selectOption('pcm');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByText('Preferences saved for this session.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.documentElement.lang === 'pcm');
  assert.equal(await page.locator('html').getAttribute('lang'), 'pcm');
  assert.match(await page.locator('html').getAttribute('class'), /dark/);
  await fits();
  await page.getByRole('button', { name: 'Wetin you sell', exact: true }).click();
  await page.getByText('Indigo Adire Set', { exact: true }).first().waitFor();
  assert.equal(await page.locator('img').count(), 0, 'low-data catalogue skips thumbnails');
  await fits();
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  await page.getByText('Assigned to Bisi Cole', { exact: true }).waitFor();
  await fits();
  assert.deepEqual(errors, []);
  console.log(
    'Settings phone acceptance passed: channels/helper/replies/negotiation/team/billing/preferences/cross-screen effects.',
  );
} finally {
  await browser.close();
}
