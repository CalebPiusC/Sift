import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/chromium.mjs';
const require = createRequire(import.meta.url);
const browser = await launchBrowser();
const reports = [];
try {
  const page = await browser.newPage();
  for (const width of [390, 768, 820, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3010/');
    await page.getByText('40 conversations', { exact: true }).waitFor();
    const mobile = page.getByRole('navigation', { name: 'Mobile navigation', includeHidden: true });
    const sidebar = page.getByRole('complementary', {
      name: 'Workspace sidebar',
      includeHidden: true,
    });
    assert.equal(await mobile.isVisible(), width < 768, `${width}: phone-only bottom navigation`);
    assert.equal(await sidebar.isVisible(), width >= 768, `${width}: sidebar`);
    const nav = width < 768 ? mobile : page.getByRole('navigation', { name: 'Main navigation' });
    const fits = async () =>
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}: no horizontal overflow`,
      );
    await fits();
    const row = page.getByTestId('conversation-row').first();
    await row.click();
    await page.getByRole('region', { name: 'Conversation', exact: true }).waitFor();
    const list = page.getByRole('region', { name: 'Conversation list', exact: true });
    assert.equal(await list.isVisible(), width >= 1024, `${width}: simultaneous inbox panes`);
    const details = page.getByRole('region', { name: 'Customer details', exact: true });
    if (width >= 1280) await details.waitFor();
    assert.equal(await details.isVisible(), width >= 1280, `${width}: customer third pane`);
    if (width >= 1024) {
      const l = await list.boundingBox(),
        r = await page.getByRole('region', { name: 'Conversation', exact: true }).boundingBox();
      assert.ok(l.x + l.width <= r.x, `${width}: panes are side by side`);
      await row.focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(
        await page
          .getByTestId('conversation-row')
          .nth(1)
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page
        .getByRole('region', { name: 'Conversation', exact: true })
        .waitFor({ state: 'detached' });
      await row.click();
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const scan = async (label, dark = false) => {
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await page.waitForTimeout(350);
      const result = await page.evaluate(() =>
        axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        }),
      );
      reports.push({
        width,
        label: `${dark ? 'dark' : 'light'} ${label}`,
        violations: result.violations,
      });
      assert.deepEqual(
        result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
        [],
        `${width} ${label}: axe`,
      );
      if (!dark) {
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await scan(label, true);
        await page.evaluate(() => document.documentElement.classList.remove('dark'));
      }
    };
    if ([390, 820, 1440].includes(width)) {
      await scan('open inbox');
      if (width < 1024)
        await page.getByRole('button', { name: 'Back to inbox', exact: true }).click();
      for (const tab of ['Catalogue', 'Orders', 'Insights', 'Settings']) {
        await nav.getByRole('button', { name: tab, exact: true }).click();
        await page.getByRole('region', { name: `${tab} screen`, exact: true }).waitFor();
        await page.getByRole('status', { name: 'Loading screen' }).waitFor({ state: 'hidden' });
        await scan(tab);
        await fits();
        if (tab === 'Catalogue') {
          const product = page.getByRole('button', { name: /Indigo Adire Set/ });
          await product.click();
          const sheet = page.getByRole('dialog', { name: 'Product details and editing' });
          await sheet.getByRole('button', { name: 'Edit item', exact: true }).click();
          await scan('product edit side panel');
          await page.keyboard.press('Tab');
          assert.equal(
            await sheet.evaluate((el) => el.contains(document.activeElement)),
            true,
            'panel retains keyboard focus',
          );
          await page.keyboard.press('Escape');
          await sheet.waitFor({ state: 'detached' });
        }
        if (tab === 'Orders') {
          if (width >= 768) await page.getByRole('table').waitFor();
          await page
            .getByRole('button', { name: /^Open / })
            .first()
            .click();
          await page.getByRole('dialog', { name: 'Order details' }).waitFor();
          await scan('order side panel');
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('dialog').count(), 0);
        }
      }
      if (width >= 768) {
        await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
        assert.equal((await sidebar.boundingBox()).width, 80);
        await scan('collapsed sidebar');
        await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
      }
    }

    console.log(`PASS responsive layout ${width}px`);
  }
} finally {
  await writeFile('/tmp/responsive-a11y.json', JSON.stringify(reports, null, 2));
  await browser.close();
}
