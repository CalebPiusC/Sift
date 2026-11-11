import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/chromium.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (250 * 1024) / 8,
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const assets = new Map();
  const pending = [];
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.endsWith('.js'))
      pending.push(
        r
          .body()
          .then((b) =>
            assets.set(new URL(r.url()).pathname, { raw: b.length, gzip: gzipSync(b).length }),
          )
          .catch(() => {}),
      );
  });
  const start = Date.now();
  await page.goto(process.env.SELVORA_TEST_URL ?? 'http://localhost:3001/');
  await page.getByText('40 conversations', { exact: true }).waitFor({ timeout: 60000 });
  await Promise.all(pending);
  const initial = [...assets.values()].reduce(
    (a, b) => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip }),
    { raw: 0, gzip: 0 },
  );
  const report = {
    connection: '500 kbps down / 250 kbps up, 400ms latency, 4× CPU slowdown, cold cache',
    initialReadyMs: Date.now() - start,
    initialJS: initial,
    initialAssets: Object.fromEntries(assets),
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.PERF_REPORT)
    await writeFile(process.env.PERF_REPORT, JSON.stringify(report, null, 2));
  if (!process.env.PERF_BASELINE) {
    assert.ok(initial.gzip < 280 * 1024, 'initial JS gzip budget <280 KiB');
    assert.ok(report.initialReadyMs < 45000, 'usable inbox under 45s on synthetic slow connection');
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await page
      .getByRole('region', { name: 'Leads by channel', exact: true })
      .waitFor({ timeout: 60000 });
    assert.ok(
      assets.size > Object.keys(report.initialAssets).length,
      'secondary screen loads a separate JS chunk',
    );
    await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
    await page.getByText('Indigo Adire Set', { exact: true }).first().waitFor({ timeout: 60000 });
    console.log('PASS: slow-connection inbox, Insights and Catalogue; lazy screen chunk fetched.');
  }
} finally {
  await browser.close();
}
