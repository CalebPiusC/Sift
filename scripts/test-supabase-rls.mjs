// Uses your project's actual auth.uid(), roles and deployed policies, not the local shim.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isolationChecks } from '../tests/isolation-checks.mjs';
if (!process.env.SUPABASE_TEST_DATABASE_URL)
  throw new Error(
    'Set SUPABASE_TEST_DATABASE_URL to a direct/session database connection (postgres role).',
  );
const client = new pg.Client({
  connectionString: process.env.SUPABASE_TEST_DATABASE_URL,
  application_name: 'selvora-rls-rollback-test',
});
let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query('begin');
  await client.query("set local statement_timeout='30s';set local lock_timeout='5s'");
  const [A, B, USER, OTHER_USER] = Array.from({ length: 4 }, () => randomUUID());
  let seed = await readFile('tests/seed.sql', 'utf8');
  for (const [old, value] of Object.entries({
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': A,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': B,
    '11111111-1111-4111-8111-111111111111': USER,
    '22222222-2222-4222-8222-222222222222': OTHER_USER,
    'tola@example.test': `${USER}@example.test`,
    'amina@example.test': `${OTHER_USER}@example.test`,
    'local-fixture-': `rls-${randomUUID()}-`,
  }))
    seed = seed.replaceAll(old, value);
  await client.query(seed);
  const db = {
    query: async (sql, params) => {
      await client.query('savepoint isolation_statement');
      try {
        const result = await client.query(sql, params);
        await client.query('release savepoint isolation_statement');
        return result;
      } catch (error) {
        await client.query('rollback to savepoint isolation_statement');
        await client.query('release savepoint isolation_statement');
        throw error;
      }
    },
  };
  await isolationChecks(db, { A, B, USER, OTHER_USER });
  console.log(
    'PASS: both tenant directions, all 13 tables, cross-tenant writes/membership and anon denial.',
  );
} catch (error) {
  // Avoid printing database error detail, connection strings, SQL or parameters.
  console.error(
    `FAIL: Supabase RLS check (${error.code || 'assertion'}). Check deployed migrations and database privileges.`,
  );
  process.exitCode = 1;
} finally {
  try {
    if (connected) await client.query('rollback');
  } finally {
    await client.end();
  }
}
