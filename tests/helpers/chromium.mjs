import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium as playwright } from 'playwright-core';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
export async function launchBrowser() {
  // The npm bundle provides CI's missing Linux libraries, even if /tmp/chromium
  // was cached by an earlier run which skipped extraction of those libraries.
  if (process.platform === 'linux') {
    const require = createRequire(import.meta.url);
    await inflate(join(dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br'));
    setupLambdaEnvironment(join(tmpdir(), 'al2023/lib'));
  }
  return playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}
