import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/chromium.mjs';
const require = createRequire(import.meta.url);
const browser = await launchBrowser();
const reports = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3001/');
  await page.getByText('40 conversations', { exact: true }).waitFor();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const scan = async (label) => {
    await page.getByRole('status', { name: 'Loading screen' }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    const r = await page.evaluate(() =>
      axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }),
    );
    reports.push({
      label,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
      })),
      incomplete: r.incomplete.map((v) => v.id),
    });
    console.log(
      label,
      reports
        .at(-1)
        .violations.map((v) => `${v.id} (${v.nodes.length})`)
        .join(', ') || 'PASS',
    );
  };
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
      await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    }
    for (const tab of ['Inbox', 'Catalogue', 'Orders', 'Insights', 'Settings']) {
      await page
        .getByRole('navigation', { name: 'Mobile navigation' })
        .getByRole('button', { name: tab, exact: true })
        .click();
      await scan(`${theme} ${tab}`);
      if (tab === 'Insights')
        for (const area of ['Follow-ups', 'Spam & scam', 'Restock', 'Customers']) {
          await page.getByRole('button', { name: area, exact: true }).click();
          await scan(`${theme} ${area}`);
        }
      if (tab === 'Settings')
        for (const area of [
          'channels',
          'replies',
          'negotiation',
          'team',
          'billing',
          'preferences',
        ]) {
          await page.getByRole('button', { name: area, exact: true }).click();
          await scan(`${theme} ${area}`);
        }
    }
  }
  await writeFile('/tmp/f7-a11y.json', JSON.stringify(reports, null, 2));
  assert.deepEqual(
    reports.filter((r) => r.violations.length),
    [],
    'no WCAG A/AA axe violations',
  );
  console.log(
    'PASS: automated light/dark phone accessibility scans. Manual keyboard checks are separate.',
  );
} finally {
  await browser.close();
}
