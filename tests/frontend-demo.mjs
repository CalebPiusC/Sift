import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const scan = async (label) => {
    for (const dark of [false, true]) {
      const r = await page.evaluate(async (dark) => {
        const root = document.documentElement;
        const old = root.classList.contains('dark');
        root.classList.toggle('dark', dark);
        const r = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        root.classList.toggle('dark', old);
        return r.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
        }));
      }, dark);
      assert.deepEqual(r, [], `${label} ${dark ? 'dark' : 'light'} accessibility`);
    }
  };
  // Keyboard access to skip link, navigation and onboarding is tested in a touch-sized viewport.
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').innerText(), 'Skip to workspace');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'workspace-main');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Try sample onboarding', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Business name', { exact: true }).fill('Adire Demo Lagos');
  await scan('Onboarding');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Products Ready-to-sell/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Pidgin-friendly/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s get you settled', exact: true }).click();
  await page.getByText('40 conversations', { exact: true }).waitFor();
  // Low-data preference also bounds local photo processing to 640px.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'preferences', exact: true }).click();
  await page.getByLabel('Low-data mode', { exact: true }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.lowData === 'true');
  assert.equal(
    await page.evaluate(() => {
      const node = document.createElement('div');
      node.className = 'animate-pulse transition';
      document.body.append(node);
      const style = getComputedStyle(node);
      const ok = style.animationName === 'none' && style.transitionProperty === 'none';
      node.remove();
      return ok;
    }),
    true,
    'low-data suppresses motion',
  );
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4338CA';
    ctx.fillRect(0, 0, 1600, 1200);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Choose product photos', { exact: true }).setInputFiles({
    name: 'adire-demo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByRole('img', { name: 'Product photo 1', exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.images].some((i) => i.alt === 'Product photo 1' && i.naturalWidth === 640),
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Fashion', exact: true }).click();
  await page.getByRole('button', { name: 'Get suggestions', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Phone demo Adire');
  await scan('Product details');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Price (₦)', { exact: true }).fill('20000');
  await page.getByLabel('Lowest price (₦)', { exact: true }).fill('15000');
  await scan('Product prices');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm item', exact: true }).click();
  await page.getByText('Phone demo Adire', { exact: true }).waitFor();
  assert.equal(await page.locator('img').count(), 0, 'low-data list has no image requests');
  await page.getByRole('button', { name: /Phone demo Adire/ }).click();
  assert.equal(
    await page.locator('img').count(),
    0,
    'low-data detail waits for explicit photo request',
  );
  await page.getByRole('button', { name: 'Load product photos', exact: true }).click();
  await page.getByRole('img', { name: 'adire-demo.png', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  await page.getByRole('button', { name: /^Open chat with Chidinma Okafor/ }).click();
  await page.getByRole('button', { name: 'Customer details', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Private notes', { exact: true }).waitFor();
  await scan('Customer drawer');
  await page.keyboard.press('Tab');
  assert.ok(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)));
  await page.getByRole('dialog').getByRole('button').first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.ok(
    await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
    'reverse tab stays in dialog',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator(':focus').innerText(), /Customer details/);
  await scan('Chat and approval');
  const approval = page.getByRole('article', { name: 'Approval approval-1', exact: true });
  await approval.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Take Over', exact: true }).click();
  await page.getByRole('button', { name: 'Hand Back', exact: true }).click();
  await page.getByText('WhatsApp · AI assistant active', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to inbox', exact: true }).click();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await page.getByRole('button', { name: /^Open order-1\s/ }).click();
  await page.getByRole('button', { name: 'Mark awaiting payment', exact: true }).click();
  await page.getByRole('button', { name: 'Payment received', exact: true }).click();
  await page.getByLabel('I checked my bank and received the full amount.', { exact: true }).check();
  await scan('Payment confirmation');
  await page.getByRole('button', { name: 'Confirm payment received', exact: true }).click();
  await page.getByRole('button', { name: 'Issue receipt', exact: true }).click();
  await page.getByText('Receipt #0013', { exact: true }).waitFor();
  await scan('Receipt');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: phone demo onboarding → photo product → approve → takeover/handback → explicit payment → receipt; keyboard skip link/drawer focus; 640px local preview and text-first low-data list.',
  );
} finally {
  await browser.close();
}
