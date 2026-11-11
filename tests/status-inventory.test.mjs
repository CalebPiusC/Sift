import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('S0 matrix and registered route inventory are reproducible from inspected sources', () => {
  execFileSync('python3', ['scripts/audit-status.py', '--check'], { stdio: 'pipe' });
});
test('every contract decision and additional route is represented in status matrix', async () => {
  const matrix = await readFile('docs/status-matrix.md', 'utf8');
  const endpoints = JSON.parse(await readFile('docs/backend/endpoints.json', 'utf8'));
  const routes = JSON.parse(await readFile('docs/backend/route-inventory.json', 'utf8'));
  for (const e of endpoints) assert.ok(matrix.includes(e.function), e.function);
  for (const r of routes)
    assert.ok(matrix.includes(r.file + '::' + r.handler), r.method + ' ' + r.path);
  for (const r of routes) await access(r.file);
});
test('capability status is evidence-qualified with no implied live acceptance', async () => {
  const capabilities = JSON.parse(await readFile('docs/capability-evidence.json', 'utf8'));
  for (const c of capabilities) {
    for (const field of ['implemented', 'frontend', 'local'])
      assert.ok(['yes', 'partial', 'no'].includes(c[field]));
    assert.ok(c.proof.length > 20, c.name);
  }
  const matrix = await readFile('docs/status-matrix.md', 'utf8');
  for (const line of matrix
    .split('\n')
    .filter((l) => /^\| [^ -].*\| (yes|no|partial) \|/.test(l))) {
    const cells = line.split('|').map((s) => s.trim());
    assert.equal(cells[5], 'no', 'Live provider unproven: ' + cells[1]);
    assert.equal(cells[6], 'no', 'Release unapproved: ' + cells[1]);
  }
});
test('B1 audit explicitly exposes missing catalogue/settings handlers and no Gemini writer', async () => {
  const routes = JSON.parse(await readFile('docs/backend/route-inventory.json', 'utf8'));
  for (const path of [
    '/v1/catalogue',
    '/v1/catalogue/batches',
    '/v1/catalogue/extractions',
    '/v1/settings',
  ])
    assert.equal(
      routes.some((r) => r.path === path),
      false,
      path + ' is not implemented by S0',
    );
  assert.ok(routes.some((r) => r.path === '/v1/catalogue/text-proposals'));
  const audit = await readFile('docs/backend/b1-gap-audit.md', 'utf8');
  assert.match(audit, /S2 is a separate subsequent phase/);
});
