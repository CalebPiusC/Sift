import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
test('manifest has standalone mode and installable icon sizes', async () => {
  const manifest = JSON.parse(await readFile('web/public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}`);
    assert.ok(icon);
    assert.ok((await stat(`web/public${icon.src}`)).size > 0);
  }
});
test('service worker never caches authenticated pages; navigation has offline fallback', async () => {
  const handlers = {};
  const cached = [];
  const calls = [];
  const context = {
    self: {
      addEventListener: (name, fn) => (handlers[name] = fn),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async () => ({ addAll: async (urls) => cached.push(...urls) }),
      match: async (url) => `cached:${url}`,
    },
    fetch: async (req) => {
      calls.push(req);
      throw new Error('offline');
    },
  };
  vm.runInNewContext(await readFile('web/public/sw.js', 'utf8'), context);
  await new Promise((resolve, reject) =>
    handlers.install({ waitUntil: (p) => p.then(resolve, reject) }),
  );
  assert.deepEqual(cached, ['/offline.html', '/icon-192.png']);
  let response;
  handlers.fetch({
    request: { mode: 'navigate', url: '/private' },
    respondWith: (p) => (response = p),
  });
  assert.equal(await response, 'cached:/offline.html');
  let intercepted = false;
  handlers.fetch({
    request: { mode: 'cors', url: '/api/messages' },
    respondWith: () => (intercepted = true),
  });
  assert.equal(intercepted, false);
});
