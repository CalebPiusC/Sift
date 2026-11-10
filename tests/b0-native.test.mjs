import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { nativeDatabase, recovering, migrationBody } from './helpers/native-database.mjs';
import { b0Fixture } from './b0-fixtures.mjs';
import { matrixCheck } from './b0-matrix-checks.mjs';
test('native PostgreSQL: populated upgrade and all 768 permission cells', async () => {
  const server = await nativeDatabase();
  const c = await server.pool.connect();
  try {
    await c.query(await readFile('tests/bootstrap.sql', 'utf8'));
    const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.slice(0, 2))
      await c.query(await readFile(`supabase/migrations/${f}`, 'utf8'));
    await c.query(await readFile('tests/seed.sql', 'utf8'));
    const snapshots = (await c.query('select id,snapshot from receipts order by id')).rows;
    for (const f of files.slice(2))
      await c.query(await readFile(`supabase/migrations/${f}`, 'utf8'));
    assert.deepEqual(
      (await c.query('select id,snapshot from receipts order by id')).rows,
      snapshots,
    );
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    await c.query('begin');
    const db = recovering(c);
    const own = await b0Fixture(db, matrix),
      other = await b0Fixture(db, matrix);
    for (const t of Object.keys(matrix))
      for (const role of ['owner', 'manager', 'agent', 'service'])
        for (const op of ['R', 'I', 'U', 'D']) {
          await c.query('savepoint matrix_cell');
          try {
            await matrixCheck(db, matrix, own, other, t, role, op);
          } finally {
            await c.query('rollback to savepoint matrix_cell');
            await c.query('release savepoint matrix_cell');
          }
        }
    await c.query('rollback');
    const beforeCount = (await c.query('select count(*)::int n from auth.users')).rows[0].n;
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const opts = server.pool.options;
    let runner;
    try {
      runner = await promisify(execFile)(process.execPath, ['scripts/test-supabase-rls.mjs'], {
        env: {
          ...process.env,
          SUPABASE_TEST_DATABASE_URL: `postgresql://postgres@127.0.0.1:${opts.port}/postgres`,
        },
      });
    } catch {
      throw new Error('Hosted runner failed on already-reconciled native cluster');
    }
    assert.match(runner.stdout, /768 permission cells/);
    assert.equal((await c.query('select count(*)::int n from auth.users')).rows[0].n, beforeCount);
  } finally {
    c.release();
    await server.close();
  }
});
test('native PostgreSQL: blank full chain applies transactionally and rolls back DDL', async () => {
  const server = await nativeDatabase();
  try {
    await server.pool.query(await readFile('tests/bootstrap.sql', 'utf8'));
    const c = await server.pool.connect();
    try {
      await c.query('begin');
      for (const f of (await readdir('supabase/migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort())
        await c.query(migrationBody(await readFile(`supabase/migrations/${f}`, 'utf8')));
      assert.equal(
        (await c.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0]
          .n,
        48,
      );
      await c.query('rollback');
      assert.equal((await c.query("select to_regclass('public.domain_events') t")).rows[0].t, null);
    } finally {
      c.release();
    }
  } finally {
    await server.close();
  }
});

test('concurrent native reservations cannot oversubscribe variant inventory', async () => {
  const server = await nativeDatabase();
  try {
    await server.pool.query(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
      await server.pool.query(await readFile(`supabase/migrations/${f}`, 'utf8'));
    const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
    const f = await b0Fixture(server.pool, matrix);
    const items = [];
    for (let n = 0; n < 12; n++)
      items.push(
        (
          await server.pool.query(
            'insert into order_items(vendor_id,order_id,product_id,variant_id,quantity,unit_price_kobo) values($1,$2,$3,$4,1,2000000) returning id',
            [f.vendor, f.ids.orders, f.ids.products, f.ids.product_variants],
          )
        ).rows[0].id,
      );
    const results = await Promise.all(
      items.map(async (item) => {
        const c = await server.pool.connect();
        try {
          await c.query('begin');
          await c.query('set local role selvora_service');
          await c.query("select set_config('app.vendor_id',$1,true)", [f.vendor]);
          await c.query(
            "insert into stock_reservations(vendor_id,order_id,order_item_id,product_id,variant_id,quantity,expires_at) values($1,$2,$3,$4,$5,1,now()+interval '10 minutes')",
            [f.vendor, f.ids.orders, item, f.ids.products, f.ids.product_variants],
          );
          await c.query('commit');
          return true;
        } catch (e) {
          await c.query('rollback');
          if (e.code !== '23514') throw e;
          return false;
        } finally {
          c.release();
        }
      }),
    );
    assert.equal(results.filter(Boolean).length, 9);
    assert.equal(
      (
        await server.pool.query(
          'select sum(quantity)::int n from stock_reservations where vendor_id=$1',
          [f.vendor],
        )
      ).rows[0].n,
      10,
    );
  } finally {
    await server.close();
  }
});
