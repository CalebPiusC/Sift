import assert from 'node:assert/strict';
import { join } from 'node:path';
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3000/');
  await page.getByText('40 conversations', { exact: true }).waitFor();
  const fits = async (label) =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${label}: no horizontal overflow`,
    );
  await fits('inbox');
  await page.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }).click();
  await page
    .getByText('Original language: Nigerian Pidgin · transcript, not a translation', {
      exact: true,
    })
    .waitFor();
  await page.getByRole('article', { name: 'Shared product', exact: true }).waitFor();
  await page.getByRole('article', { name: 'Order summary', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Simulate incoming message', exact: true }).click();
  await page
    .getByLabel('Chat messages')
    .getByText('Hello! Welcome to Adire by Tola. How can we help you today?', { exact: true })
    .waitFor();
  const approval = page.getByRole('article', { name: 'Approval approval-1', exact: true });
  await approval.getByRole('button', { name: 'Send', exact: true }).click();
  await approval.waitFor({ state: 'detached' });
  await page
    .getByLabel('Chat messages')
    .getByText(
      'Thank you for reaching out. Let me check this with our team and get back to you shortly.',
      { exact: true },
    )
    .waitFor();
  await page.getByRole('button', { name: 'Take Over', exact: true }).click();
  await page.getByText('You’re in charge. AI is paused for this chat.', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('link', { name: 'Open in WhatsApp', exact: true }).getAttribute('href'),
    'https://web.whatsapp.com/',
  );
  const aiBefore = await page
    .getByLabel('Chat messages')
    .getByText('Hello! Welcome to Adire by Tola. How can we help you today?', { exact: true })
    .count();
  await page.getByRole('button', { name: 'Simulate incoming message', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(
    await page
      .getByLabel('Chat messages')
      .getByText('Hello! Welcome to Adire by Tola. How can we help you today?', { exact: true })
      .count(),
    aiBefore,
    'AI remains paused',
  );
  await page.getByRole('button', { name: 'Let me check that for you.', exact: true }).click();
  assert.equal(
    await page.getByLabel('Your reply', { exact: true }).inputValue(),
    'Let me check that for you.',
  );
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await page
    .getByLabel('Chat messages')
    .getByText('Let me check that for you.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Hand Back', exact: true }).click();
  await page.getByText('AI assistant active', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Simulate incoming message', exact: true }).click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[aria-label="Chat messages"] p')).filter(
        (p) => p.textContent === 'Hello! Welcome to Adire by Tola. How can we help you today?',
      ).length === 2,
  );
  await page.getByRole('button', { name: 'Customer details', exact: true }).click();
  await page.getByLabel('Private notes', { exact: true }).fill('Prefers afternoon delivery.');
  await page.getByLabel('Tags (comma separated)', { exact: true }).fill('Returning customer, VIP');
  await page.getByLabel('Flag possible spam / scam', { exact: true }).check();
  await page.getByRole('button', { name: 'Save customer details', exact: true }).click();
  await page.getByText('Customer details saved.', { exact: true }).waitFor();
  await fits('customer drawer');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await fits('conversation');
  if (process.env.SELVORA_SCREENSHOT_DIR) {
    await mkdir(process.env.SELVORA_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: join(process.env.SELVORA_SCREENSHOT_DIR, 'inbox-phone.png'),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Back to inbox', exact: true }).click();
  await page.getByRole('tab', { name: /^Needs you/ }).click();
  const second = page.getByRole('article', { name: 'Approval approval-2', exact: true });
  await second.getByRole('button', { name: 'Edit', exact: true }).click();
  await second
    .getByLabel('Edit proposed reply', { exact: true })
    .fill('I will check the quantity with our team.');
  await second.getByRole('button', { name: 'Send edited reply', exact: true }).click();
  await second.waitFor({ state: 'detached' });
  await page
    .getByRole('article', { name: 'Approval approval-3', exact: true })
    .getByRole('button', { name: 'Reject', exact: true })
    .click();
  await page
    .getByRole('article', { name: 'Approval approval-3', exact: true })
    .waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: 'Notifications', exact: true }).click();
  assert.ok(await page.getByLabel('Ready to pay', { exact: true }).isChecked());
  assert.ok(await page.getByLabel('Needs you', { exact: true }).isChecked());
  await fits('notifications');
  for (const width of [320, 360, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('tab', { name: 'Inbox', exact: true }).click();
    if (width === 1280)
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }).click();
    await page.getByText('AI assistant active', { exact: true }).waitFor();
    await fits(`${width}px conversation`);
    if (width < 1024) {
      const box = await page.getByLabel('Your reply', { exact: true }).boundingBox();
      assert.ok(box && box.y + box.height <= 844 - 72, 'mobile composer stays above navigation');
      await page.getByRole('button', { name: 'Back to inbox', exact: true }).click();
    }
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log(
    'PASS: Chromium 390×844 touch viewport: live chat, product/order/voice bubbles, approve/edit/reject, Take Over pauses AI, vendor quick reply, Hand Back resumes AI, customer drawer, default notifications, no horizontal overflow or browser exceptions.',
  );
} finally {
  await browser.close();
}
