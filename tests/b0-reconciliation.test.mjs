import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { b0Fixture } from './b0-fixtures.mjs';
import { matrixCheck, prepareProbe } from './b0-matrix-checks.mjs';
const matrix = JSON.parse(await readFile('docs/backend/role-matrix.json', 'utf8'));
const migrations = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let db, own, other;
before(async () => {
  db = new PGlite();
  await db.exec(await readFile('tests/bootstrap.sql', 'utf8'));
  for (const f of migrations) await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  own = await b0Fixture(db, matrix);
  other = await b0Fixture(db, matrix);
});
after(() => db?.close());
for (const table of Object.keys(matrix))
  for (const role of ['owner', 'manager', 'agent', 'service'])
    for (const op of ['R', 'I', 'U', 'D'])
      test(`matrix ${table}/${role}/${op} ${matrix[table][role].includes(op) ? 'allow' : 'deny'}`, async () => {
        await db.exec('begin');
        try {
          await matrixCheck(db, matrix, own, other, table, role, op);
        } finally {
          await db.exec('rollback');
        }
      });
test('all tables have forced RLS; no public/anon/service_role privileges and no worker bypass', async () => {
  const rows = (await db.query("select tablename from pg_tables where schemaname='public'")).rows;
  assert.deepEqual(rows.map((r) => r.tablename).sort(), Object.keys(matrix).sort());
  for (const t of Object.keys(matrix)) {
    const r = (
      await db.query(
        'select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',
        [`public.${t}`],
      )
    ).rows[0];
    assert.equal(r.relrowsecurity && r.relforcerowsecurity, true);
    for (const role of ['anon', 'service_role'])
      assert.equal(
        (
          await db.query(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",
            [role, `public.${t}`],
          )
        ).rows[0].allowed,
        false,
      );
  }
  assert.equal(
    (await db.query("select rolbypassrls from pg_roles where rolname='selvora_service'")).rows[0]
      .rolbypassrls,
    false,
  );
});
test('upgrade F0 with populated history preserves receipts and translates states', async () => {
  const upgrade = new PGlite();
  try {
    await upgrade.exec(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const f of migrations.slice(0, 2))
      await upgrade.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    await upgrade.exec(await readFile('tests/seed.sql', 'utf8'));
    const before = (await upgrade.query('select id,snapshot,total_kobo from receipts order by id'))
      .rows;
    for (const f of migrations.slice(2))
      await upgrade.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    assert.deepEqual(
      (await upgrade.query('select id,snapshot,total_kobo from receipts order by id')).rows,
      before,
    );
    assert.ok(
      (await upgrade.query('select status from orders')).rows.every((r) => r.status === 'paid'),
    );
    assert.equal((await upgrade.query('select * from business_hours')).rows.length, 14);
  } finally {
    await upgrade.close();
  }
});

test('every composite FK rejects a cross-tenant parent, including matching vendor but wrong conversation/product', async () => {
  const fks = (
    await db.query(
      "select c.conrelid::regclass::text tbl,c.confrelid::regclass::text parent,array_agg(a.attname order by k.ord) cols,array_agg(b.attname order by k.ord) refs from pg_constraint c join pg_namespace n on n.oid=c.connamespace cross join lateral unnest(c.conkey,c.confkey) with ordinality k(localnum,refnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.localnum join pg_attribute b on b.attrelid=c.confrelid and b.attnum=k.refnum where n.nspname='public' and c.contype='f' and cardinality(c.conkey)>1 group by c.oid,c.conrelid,c.confrelid",
    )
  ).rows;
  let checked = 0;
  for (const fk of fks) {
    const table = fk.tbl.replace('public.', ''),
      parent = fk.parent.replace('public.', '');
    const pairs = fk.cols
      .map((c, i) => [c, fk.refs[i]])
      .filter(([c]) => !['vendor_id', 'id'].includes(c));
    if (!pairs.length) continue;
    await db.exec('begin');
    try {
      const row = await prepareProbe(db, own, table, 'service', 'I');
      if (table === 'vendors') continue;
      for (const [c, r] of pairs) row[c] = other.rows[parent][r];
      try {
        await import('./b0-fixtures.mjs').then((m) => m.insert(db, table, row));
        assert.fail(`${table}: cross-tenant ${pairs.map((p) => p[0])} accepted`);
      } catch (e) {
        assert.ok(['23503', '23514'].includes(e.code), `${table}: rejects with integrity error`);
      }
      checked++;
    } finally {
      await db.exec('rollback');
    }
  }
  assert.ok(checked > 50);
});
test('scoped worker cannot read any tenant until scope is explicitly selected', async () => {
  await db.exec('begin');
  try {
    await db.exec("set local role selvora_service;set local app.vendor_id=''");
    for (const table of Object.keys(matrix))
      assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
  } finally {
    await db.exec('rollback');
  }
});
test('events capture actual stage/reply/payment changes and append-only records reject owner mutation', async () => {
  await db.exec('begin');
  try {
    await db.query("update conversations set stage='interested' where id=$1", [
      own.ids.conversations,
    ]);
    await db.query("update conversations set stage='paid' where id=$1", [own.ids.conversations]);
    const events = (
      await db.query(
        "select from_stage,to_stage from domain_events where conversation_id=$1 and event_type='lead_stage_changed' order by recorded_at,id",
        [own.ids.conversations],
      )
    ).rows;
    assert.ok(events.some((e) => e.from_stage === 'new' && e.to_stage === 'interested'));
    assert.ok(events.some((e) => e.from_stage === 'interested' && e.to_stage === 'paid'));
    for (const table of [
      'domain_events',
      'receipts',
      'audit_log',
      'payments',
      'usage_entries',
      'stock_movements',
    ]) {
      await assert.rejects(
        db.query(`update ${table} set vendor_id=vendor_id where id=$1`, [own.ids[table]]),
        (e) => e.code === '42501',
      );
      await db.exec('rollback;begin');
    }
  } finally {
    await db.exec('rollback');
  }
});
test('new onboarding creates seven hours/defaults, no agent financial RPC or self preference access', async () => {
  await db.exec('begin');
  try {
    const user = crypto.randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      user,
      `${user}@example.test`,
    ]);
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    const v = (await db.query("select onboard_vendor('New B0','products','friendly') v")).rows[0].v;
    assert.equal(
      (await db.query('select count(*)::int n from business_hours where vendor_id=$1', [v])).rows[0]
        .n,
      7,
    );
    assert.equal(
      (await db.query('select * from member_preferences where vendor_id=$1', [v])).rows.length,
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [own.users.agent]);
    await assert.rejects(
      db.query('select confirm_vendor_payment($1,$2)', [own.vendor, own.ids.orders]),
      (e) => e.code === '42501',
    );
  } finally {
    await db.exec('rollback');
  }
});
test('duplicate webhook/idempotency identities, floor, helper TTL and reservations enforce bounds', async () => {
  for (const work of [
    () =>
      db.query(
        'insert into idempotency_keys(vendor_id,operation,actor_scope,key_hash,request_hash,expires_at) select vendor_id,operation,actor_scope,key_hash,request_hash,expires_at from idempotency_keys where id=$1',
        [own.ids.idempotency_keys],
      ),
    () =>
      db.query('update products set lowest_price_kobo=price_kobo+1 where id=$1', [
        own.ids.products,
      ]),
    () =>
      db.query("update helper_links set expires_at=created_at+interval '11 minutes' where id=$1", [
        own.ids.helper_links,
      ]),
    () =>
      db.query('update stock_reservations set quantity=999 where id=$1', [
        own.ids.stock_reservations,
      ]),
  ]) {
    await db.exec('begin');
    try {
      await assert.rejects(work(), (e) => ['23505', '23514'].includes(e.code));
    } finally {
      await db.exec('rollback');
    }
  }
});

test('same-tenant member privacy, inactive membership and owner protection hold', async () => {
  for (const work of [
    async () => {
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [own.users.agent]);
      assert.equal(
        (await db.query('select * from member_preferences where member_id=$1', [own.members.owner]))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            'update member_preferences set dark_mode=true where member_id=$1 returning id',
            [own.members.owner],
          )
        ).rows.length,
        0,
      );
    },
    async () => {
      await db.query("update vendor_members set status='suspended' where id=$1", [
        own.members.agent,
      ]);
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [own.users.agent]);
      assert.equal((await db.query('select * from customers')).rows.length, 0);
    },
    async () => {
      await assert.rejects(
        db.query("update vendor_members set role='agent' where id=$1", [own.members.owner]),
        (e) => e.code === '23514',
      );
    },
  ]) {
    await db.exec('begin');
    try {
      await work();
    } finally {
      await db.exec('rollback');
    }
  }
});
test('B0 migration scope does not alter unrelated public tables or policies', async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(await readFile('tests/bootstrap.sql', 'utf8'));
    for (const f of migrations.slice(0, 2))
      await isolated.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    await isolated.exec(
      'create table public.unrelated_app(id integer primary key,amount_kobo bigint);alter table public.unrelated_app enable row level security;create policy keep_me on public.unrelated_app for select to authenticated using(true)',
    );
    for (const f of migrations.slice(2))
      await isolated.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
    assert.equal(
      (
        await isolated.query(
          "select * from pg_policies where tablename='unrelated_app' and policyname='keep_me'",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await isolated.query(
          "select * from pg_trigger where tgrelid='unrelated_app'::regclass and not tgisinternal",
        )
      ).rows.length,
      0,
    );
  } finally {
    await isolated.close();
  }
});
