// Rollback-only hosted B0 validation. Never bootstrap Supabase auth or print a connection URL.
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { b0Fixture, insert } from '../tests/b0-fixtures.mjs';
import { matrixCheck } from '../tests/b0-matrix-checks.mjs';
import { recovering, migrationBody } from '../tests/helpers/native-database.mjs';
if (!process.env.SUPABASE_TEST_DATABASE_URL) {
  console.error(
    'Set SUPABASE_TEST_DATABASE_URL securely to a direct/session postgres connection. No credentials are read from files.',
  );
  process.exitCode = 1;
} else {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_TEST_DATABASE_URL,
    application_name: 'selvora-b0-rollback-check',
    connectionTimeoutMillis: 15000,
  });
  let connected = false;
  try {
    await c.connect();
    connected = true;
    await c.query('begin');
    await c.query("set local statement_timeout='30s';set local lock_timeout='5s'");
    const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    const exists = (
      await c.query(
        "select to_regclass('public.vendors') vendor,to_regclass('public.domain_events') events",
      )
    ).rows[0];
    const invariant = (await c.query("select to_regprocedure('public.b0_stable_identity()') f"))
      .rows[0].f;
    if (exists.events && !invariant)
      throw Object.assign(new Error('Partial B0 schema'), { code: 'PARTIAL_B0' });
    if (!exists.events)
      for (const f of exists.vendor ? files.slice(2) : files)
        await c.query(migrationBody(await readFile(`supabase/migrations/${f}`, 'utf8')));
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    const db = recovering(c);
    const own = await b0Fixture(db, matrix),
      other = await b0Fixture(db, matrix);
    let cells = 0;
    for (const table of Object.keys(matrix))
      for (const role of ['owner', 'manager', 'agent', 'service'])
        for (const op of ['R', 'I', 'U', 'D']) {
          await c.query('savepoint matrix_cell');
          try {
            await matrixCheck(db, matrix, own, other, table, role, op);
            cells++;
          } finally {
            await c.query('rollback to savepoint matrix_cell');
            await c.query('release savepoint matrix_cell');
          }
        }
    // Both tenant directions are exercised, not only one fixture owner.
    for (const table of Object.keys(matrix))
      for (const role of ['owner', 'manager', 'agent', 'service']) {
        await c.query('savepoint reverse_check');
        try {
          await matrixCheck(db, matrix, other, own, table, role, 'R');
        } finally {
          await c.query('rollback to savepoint reverse_check');
          await c.query('release savepoint reverse_check');
        }
      }
    for (const table of Object.keys(matrix)) {
      await c.query('set local role anon');
      await db.query(`select * from public.${table}`).then(
        () => {
          throw Object.assign(new Error('Anonymous table access'), { code: 'ANON_ACCESS' });
        },
        (e) => {
          if (e.code !== '42501') throw e;
        },
      );
      await c.query('reset role');
    }
    const bad = await db.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) and (not c.relrowsecurity or not c.relforcerowsecurity)",
      [Object.keys(matrix)],
    );
    if (bad.rows.length) throw Object.assign(new Error('RLS missing'), { code: 'RLS_MISSING' });
    for (const table of Object.keys(matrix))
      for (const role of ['anon', 'service_role']) {
        const result = await db.query(
          "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",
          [role, `public.${table}`],
        );
        if (result.rows[0].allowed)
          throw Object.assign(new Error('Unexpected table grant'), { code: 'UNSAFE_GRANT' });
      }
    const worker = await db.query(
      "select rolbypassrls,rolsuper,rolcanlogin,rolinherit from pg_roles where rolname='selvora_service'",
    );
    if (worker.rows.length !== 1 || Object.values(worker.rows[0]).some(Boolean))
      throw Object.assign(new Error('Unsafe worker role'), { code: 'UNSAFE_WORKER' });
    console.log(
      `PASS: hosted actual auth/RLS, ${cells} permission cells, reverse tenant reads and anonymous denial. All temporary schema/fixtures rolled back; no persistent migration was applied.`,
    );
  } catch (e) {
    console.error(
      `FAIL: hosted B0 verification (${e.code || 'assertion'}). No database detail, SQL or credentials logged.`,
    );
    process.exitCode = 1;
  } finally {
    try {
      if (connected) await c.query('rollback');
    } finally {
      await c.end();
    }
  }
}
