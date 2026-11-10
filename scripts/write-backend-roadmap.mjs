import { readFile, writeFile } from 'node:fs/promises';
export async function endpointTable() {
  const rows = JSON.parse(await readFile('docs/backend/endpoints.json', 'utf8'));
  return (
    '<!-- endpoints:start -->\n\n| Function | FastAPI target | Auth/role | Idempotency | Pagination | Storage | Status / notes |\n|---|---|---|---|---|---|---|\n' +
    rows
      .map(
        (r) =>
          `| ${r.function} | ${r.method} \`${r.path === '—' ? '—' : r.path === '/health' ? r.path : '/v1' + r.path}\` | ${r.roles} | ${r.idempotency} | ${r.pagination} | ${r.tables} | **${r.status}**. ${r.notes} |`,
      )
      .join('\n') +
    '\n\n<!-- endpoints:end -->'
  );
}
if (process.argv[1]?.endsWith('write-backend-roadmap.mjs')) {
  const p = 'docs/backend-roadmap.md';
  await writeFile(
    p,
    (await readFile(p, 'utf8')).replace(
      /<!-- endpoints:start -->[\s\S]*?<!-- endpoints:end -->/,
      await endpointTable(),
    ),
  );
}
