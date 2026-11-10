import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { endpointTable } from '../scripts/write-backend-roadmap.mjs';
import { matrixDoc } from '../scripts/write-role-matrix.mjs';
import { schemaReport } from '../scripts/write-b0-schema-report.mjs';
const endpoints = JSON.parse(await readFile('docs/backend/endpoints.json', 'utf8'));
test('every frontend contract method including inherited catalogue mutations has exactly one endpoint decision', async () => {
  const sources = await Promise.all(
    ['contract', 'catalogue-types', 'extras-types'].map((n) =>
      readFile(`web/lib/data/${n}.ts`, 'utf8'),
    ),
  );
  const interfaces = new Map();
  for (const source of sources) {
    const root = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true);
    for (const node of root.statements)
      if (ts.isInterfaceDeclaration(node)) interfaces.set(node.name.text, node);
  }
  const names = [
    'CatalogueData',
    'ConversationsData',
    'MessagesData',
    'ApprovalsData',
    'OrdersData',
    'ReceiptsData',
    'CustomersData',
    'ChannelsData',
    'SettingsData',
    'InsightsData',
    'TeamData',
    'BillingData',
    'ExtrasData',
    'RealtimeData',
    'MockControls',
  ];
  const methods = (n) => {
    const node = interfaces.get(n);
    return [
      ...node.members.filter(ts.isMethodSignature).map((m) => m.name.getText()),
      ...(node.heritageClauses ?? []).flatMap((h) =>
        h.types.flatMap((t) => methods(t.expression.getText())),
      ),
    ];
  };
  for (const name of names)
    for (const method of methods(name))
      assert.equal(
        endpoints.filter((e) => e.function === `${name}.${method}`).length,
        1,
        `${name}.${method} mapped once`,
      );
  assert.equal(endpoints.filter((e) => e.function === 'DataClient.dispose').length, 1);
  assert.equal(new Set(endpoints.map((e) => e.function)).size, endpoints.length);
  for (const e of endpoints) {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(e.method))
      assert.equal(e.idempotency, 'required');
    if (e.function.startsWith('MockControls.')) assert.equal(e.status, 'local-only');
  }
});
test('endpoint and matrix docs match their machine-readable inventory', async () => {
  const doc = await readFile('docs/backend-roadmap.md', 'utf8');
  assert.equal(
    doc.match(/<!-- endpoints:start -->[\s\S]*?<!-- endpoints:end -->/)[0],
    await endpointTable(),
  );
  assert.equal(await readFile('docs/backend/role-matrix.md', 'utf8'), await matrixDoc());
});
test('exact schema gap inventory is generated from the entire migration chain', async () => {
  assert.equal(await readFile('docs/backend/schema-delta.md', 'utf8'), await schemaReport());
});
