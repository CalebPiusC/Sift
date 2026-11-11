import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
export async function schemaReport() {
  const db = new PGlite();
  try {
    await db.exec(await readFile('tests/bootstrap.sql', 'utf8'));
    const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    const snapshot = async () => ({
      columns: (
        await db.query(
          "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
        )
      ).rows,
      constraints: (
        await db.query(
          "select c.conrelid::regclass::text as table_name,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by 1,2",
        )
      ).rows,
      indexes: (
        await db.query(
          "select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname",
        )
      ).rows,
    });
    for (const f of files.slice(0, 2))
      await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    const before = await snapshot();
    for (const f of files.slice(2))
      await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    const after = await snapshot();
    const tables = [...new Set(after.columns.map((c) => c.table_name))];
    let out =
      '# B0 exact schema delta\n\nGenerated from actual F0 and B0 migration execution, not hand-counted. Run `npm run docs:backend`.\n\n';
    for (const t of tables) {
      const prior = before.columns.filter((c) => c.table_name === t);
      out += `## ${t} — ${prior.length ? 'extended existing table' : 'NEW table'}\n\n`;
      const added = after.columns.filter(
        (c) => c.table_name === t && !prior.some((p) => p.column_name === c.column_name),
      );
      out +=
        'Added columns:\n\n' +
        added
          .map(
            (c) =>
              `- \`${c.column_name}\` ${c.data_type}; ${c.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'}${c.column_default ? `; default \`${c.column_default}\`` : ''}`,
          )
          .join('\n') +
        '\n\n';
      out +=
        'New/changed constraints:\n\n' +
        after.constraints
          .filter(
            (c) =>
              c.table_name === t &&
              !before.constraints.some(
                (b) =>
                  b.table_name === t && b.conname === c.conname && b.definition === c.definition,
              ),
          )
          .map((c) => `- \`${c.conname}\`: \`${c.definition}\``)
          .join('\n') +
        '\n\n';
      out +=
        'Added indexes (including constraint-backed and FK lookup indexes):\n\n' +
        after.indexes
          .filter(
            (c) => c.tablename === t && !before.indexes.some((b) => b.indexname === c.indexname),
          )
          .map((c) => `- \`${c.indexname}\`: \`${c.indexdef}\``)
          .join('\n') +
        '\n\n';
    }
    out +=
      '## Removed/replaced F0 constraints\n\n' +
      before.constraints
        .filter(
          (c) =>
            !after.constraints.some(
              (a) =>
                a.table_name === c.table_name &&
                a.conname === c.conname &&
                a.definition === c.definition,
            ),
        )
        .map((c) => `- ${c.table_name}.\`${c.conname}\`: old \`${c.definition}\``)
        .join('\n') +
      '\n';
    return out;
  } finally {
    await db.close();
  }
}
if (process.argv[1]?.endsWith('write-b0-schema-report.mjs'))
  await writeFile('docs/backend/schema-delta.md', await schemaReport());
