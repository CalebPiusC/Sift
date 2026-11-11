import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import pg from 'pg';
import { isolationChecks } from './isolation-checks.mjs';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
let server, dir, pool, config;
before(async () => {
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  dir = await mkdtemp(path.join(tmpdir(), 'selvora-pg-'));
  const password = randomUUID();
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const bin = await import(`@embedded-postgres/${platform}-${process.arch}`);
  const data = path.join(dir, 'data');
  // Use the packaged binaries directly: the wrapper's global exit hook conflicts with node:test.
  execFileSync(
    bin.initdb,
    ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C'],
    { stdio: 'pipe' },
  );
  execFileSync(
    bin.pg_ctl,
    [
      '-D',
      data,
      '-l',
      path.join(dir, 'server.log'),
      '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0`,
      '-w',
      'start',
    ],
    { stdio: 'pipe' },
  );
  server = {
    stop: async () =>
      execFileSync(bin.pg_ctl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' }),
  };
  config = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres' };
  pool = new pg.Pool({ ...config, max: 30 });
  for (const file of [
    'tests/bootstrap.sql',
    'supabase/migrations/202611100001_foundation.sql',
    'supabase/migrations/202611100002_receipt_privileges.sql',
    'tests/seed.sql',
  ])
    await pool.query(await readFile(file, 'utf8'));
});
after(async () => {
  await pool?.end();
  await server?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test('24 independent PostgreSQL sessions issue gap-free receipts under real lock contention', async () => {
  const customer = (await pool.query('select id from public.customers where vendor_id=$1', [A]))
    .rows[0].id;
  const orders = [];
  for (let i = 0; i < 24; i++)
    orders.push(
      (
        await pool.query(
          "insert into public.orders(vendor_id,customer_id,total_kobo,payment_status,payment_source) values($1,$2,2500000,'paid','vendor') returning id",
          [A, customer],
        )
      ).rows[0].id,
    );
  const clients = await Promise.all(orders.map(() => pool.connect()));
  const blocker = await pool.connect();
  let pending = [];
  try {
    await blocker.query('begin');
    await blocker.query('select id from public.vendors where id=$1 for update', [A]);
    await Promise.all(
      clients.map(async (client) => {
        await client.query('begin');
        await client.query("set local role authenticated;set local statement_timeout='20s'");
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [USER]);
      }),
    );
    const before = Number(
      (
        await blocker.query(
          'select max(receipt_number) as n from public.receipts where vendor_id=$1',
          [A],
        )
      ).rows[0].n,
    );
    pending = clients.map(async (client, i) => {
      try {
        const result = await client.query('select public.issue_receipt($1,$2) as id', [
          A,
          orders[i],
        ]);
        await client.query('commit');
        return result.rows[0].id;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
    // All 24 backends must actually be blocked, not merely queued on one JS connection.
    const deadline = Date.now() + 10000;
    let waiting = 0;
    do {
      waiting = Number(
        (
          await pool.query(
            "select count(*) as n from pg_stat_activity where wait_event_type='Lock' and pid<>pg_backend_pid() and datname=current_database()",
          )
        ).rows[0].n,
      );
      if (waiting < 24) await new Promise((resolve) => setTimeout(resolve, 20));
    } while (waiting < 24 && Date.now() < deadline);
    assert.equal(waiting, 24, 'all receipt sessions contend on the vendor lock');
    await blocker.query('commit');
    const ids = await Promise.all(pending);
    assert.equal(new Set(ids).size, 24);
    const numbers = (
      await pool.query(
        'select receipt_number from public.receipts where id=any($1::uuid[]) order by receipt_number',
        [ids],
      )
    ).rows.map((r) => Number(r.receipt_number));
    assert.deepEqual(
      numbers,
      Array.from({ length: 24 }, (_, i) => before + i + 1),
    );
    // Assignment/commit order is monotonic; Promise resolution/input order is not guaranteed.
    const client = await pool.connect();
    try {
      await client.query('begin;set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [USER]);
      const id = (await client.query('select public.issue_receipt($1,$2) as id', [A, orders[0]]))
        .rows[0].id;
      assert.equal(id, ids[0]);
      await client.query('commit');
    } finally {
      client.release();
    }
  } finally {
    await blocker.query('rollback');
    await Promise.allSettled(pending);
    blocker.release();
    for (const client of clients) client.release();
  }
});
test('shared isolation checks pass against native PostgreSQL and real-project runner rolls back', async () => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const db = {
      query: async (sql, params) => {
        await client.query('savepoint check_stmt');
        try {
          const r = await client.query(sql, params);
          await client.query('release savepoint check_stmt');
          return r;
        } catch (error) {
          await client.query('rollback to savepoint check_stmt;release savepoint check_stmt');
          throw error;
        }
      },
    };
    await isolationChecks(db, { A, B, USER, OTHER_USER });
  } finally {
    await client.query('rollback');
    client.release();
  }
  const before = Number((await pool.query('select count(*) as n from auth.users')).rows[0].n);
  // Exercise the exact later-use Supabase script; the cluster's auth shim is local only.
  // Async child permits the PostgreSQL server to keep running during the check.
  const { execFile } = await import('node:child_process');
  await new Promise((resolve, reject) =>
    execFile(
      process.execPath,
      ['scripts/test-supabase-rls.mjs'],
      {
        env: {
          ...process.env,
          SUPABASE_TEST_DATABASE_URL: `postgresql://postgres:${config.password}@127.0.0.1:${config.port}/postgres`,
        },
      },
      (error, stdout) =>
        error
          ? reject(new Error('Real-project runner failed on native fixture cluster'))
          : resolve(stdout),
    ),
  );
  assert.equal(
    Number((await pool.query('select count(*) as n from auth.users')).rows[0].n),
    before,
  );
});
