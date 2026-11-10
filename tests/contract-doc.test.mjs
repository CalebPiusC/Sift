import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contractDeclarations } from '../scripts/write-api-contract.mjs';
test('API contract document includes every current exported entity and interface exactly', async () => {
  const doc = await readFile('docs/api-contract.md', 'utf8');
  assert.ok(
    doc.includes(await contractDeclarations()),
    'Run npm run docs:contract after changing the contract.',
  );
});
