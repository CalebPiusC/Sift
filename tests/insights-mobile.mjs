import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  page.on('dialog', (d) => d.accept());
  await mkdir('/tmp/selvora-f6', { recursive: true });
  const fits = async (label) =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${label}: no horizontal overflow`,
    );
  await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3001/');
  await page.getByText('40 conversations', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  for (const name of [
    'Leads by channel',
    'Response time',
    'Conversion by stage',
    'Top products',
    'Revenue over time',
    'Busiest hours',
    'AI versus vendor',
  ])
    await page.getByRole('region', { name, exact: true }).waitFor();
  await fits('insights');
  await page.screenshot({ path: '/tmp/selvora-f6/insights.png', fullPage: true });
  await page.getByLabel('From', { exact: true }).fill('2000-01-01');
  await page.getByLabel('To', { exact: true }).fill('2000-01-02');
  await page
    .getByRole('region', { name: 'Top products', exact: true })
    .getByText('No activity in this range.', { exact: true })
    .waitFor();
  await page.getByLabel('To', { exact: true }).fill('1999-01-01');
  await page
    .getByRole('alert')
    .getByText('Choose valid dates with the start on or before the end.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Follow-ups', exact: true }).click();
  await page.getByLabel('Enable cold-lead follow-ups', { exact: true }).check();
  await page.getByLabel('Hours after inactivity', { exact: true }).fill('72');
  await page.getByRole('combobox', { name: /^Message style/ }).selectOption('professional');
  await page.getByRole('button', { name: 'Save follow-ups', exact: true }).click();
  await page.getByText('Follow-up settings saved for this session.', { exact: true }).waitFor();
  const sends = page.getByRole('button', { name: 'Simulate send now', exact: true });
  await sends.first().click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Simulate send now')
        .length === 2,
  );
  await fits('followups');
  await page.screenshot({ path: '/tmp/selvora-f6/followups.png', fullPage: true });
  await page.getByRole('button', { name: 'Spam & scam', exact: true }).click();
  await page
    .getByRole('article', { name: 'Flag flag-1', exact: true })
    .getByRole('button', { name: 'Not spam', exact: true })
    .click();
  await page
    .getByRole('article', { name: 'Flag flag-1', exact: true })
    .getByText(/cleared/)
    .waitFor();
  await page
    .getByRole('article', { name: 'Flag flag-2', exact: true })
    .getByRole('button', { name: 'Block', exact: true })
    .click();
  await page
    .getByRole('article', { name: 'Flag flag-2', exact: true })
    .getByText(/blocked/)
    .waitFor();
  await fits('spam');
  await page.getByRole('button', { name: 'Restock', exact: true }).click();
  await page.getByText('Low-stock list', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Simulate restock alert', exact: true }).first().click();
  await page.getByText('Chidinma Okafor · notified', { exact: true }).waitFor();
  await fits('restock');
  await page.screenshot({ path: '/tmp/selvora-f6/restock.png', fullPage: true });
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByLabel('Search customers', { exact: true }).fill('Chidinma');
  await page.getByRole('button', { name: /Chidinma Okafor/ }).click();
  await page.getByText('Order history', { exact: true }).waitFor();
  await page
    .getByLabel('Customer notes', { exact: true })
    .fill('Prefers indigo. Deliver after 5pm.');
  await page.getByRole('button', { name: 'Save customer memory', exact: true }).click();
  await page.getByText('Customer memory saved.', { exact: true }).waitFor();
  await fits('customer detail');
  await page.screenshot({ path: '/tmp/selvora-f6/customer.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to customers', exact: true }).click();
  await page.getByLabel('Search customers', { exact: true }).fill('Deliver after 5pm');
  await page.getByRole('button', { name: /Chidinma Okafor/ }).click();
  await page.waitForFunction(
    () => document.querySelector('textarea')?.value === 'Prefers indigo. Deliver after 5pm.',
  );
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  await page.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }).click();
  await page.getByRole('region', { name: 'Language summary', exact: true }).last().waitFor();
  assert.ok((await page.getByText('English summary', { exact: true }).count()) > 0);
  await fits('language summary');
  await page
    .getByRole('region', { name: 'Language summary', exact: true })
    .last()
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/selvora-f6/language.png', fullPage: true });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 320, height: 740 });
  await fits('language summary narrow phone');
  await page.getByRole('button', { name: 'Back to inbox', exact: true }).click();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await fits('insights narrow phone');
  for (const name of ['Follow-ups', 'Spam & scam', 'Restock', 'Customers']) {
    await page.getByRole('button', { name, exact: true }).click();
    await fits(`${name} narrow phone`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('2020-01-01');
  await page.getByLabel('To', { exact: true }).fill('2030-01-01');
  await page.getByRole('region', { name: 'Leads by channel', exact: true }).waitFor();
  await fits('dark insights');
  await page.screenshot({ path: '/tmp/selvora-f6/insights-dark.png', fullPage: true });
  console.log(
    'PASS: F6 390×844 touch workflows and 320px width: seven charts/date states, followups, moderation, restock, customer search/history/notes, original + English summaries; no browser exceptions.',
  );
} finally {
  await browser.close();
}
