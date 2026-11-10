import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = '11111111-1111-4111-8111-111111111111';
const tables = [
  'vendors',
  'vendor_members',
  'customers',
  'conversations',
  'messages',
  'products',
  'product_variants',
  'orders',
  'order_items',
  'receipts',
  'channel_accounts',
  'approvals',
  'audit_log',
];
async function asUser(user = USER) {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`);
}
before(async () => {
  for (const file of [
    'tests/bootstrap.sql',
    'supabase/migrations/202611100001_foundation.sql',
    'supabase/migrations/202611100002_receipt_privileges.sql',
    'tests/seed.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
});
after(() => db.close());
for (const table of tables) {
  test(`${table}: vendor A cannot read, update or delete vendor B rows`, async () => {
    await asUser();
    const own = await db.query(`select * from public.${table}`);
    assert.ok(own.rows.length > 0);
    assert.ok(own.rows.every((row) => row.vendor_id === A));
    assert.equal(
      (await db.query(`select * from public.${table} where vendor_id=$1`, [B])).rows.length,
      0,
    );
    if (!['receipts', 'audit_log', 'orders'].includes(table)) {
      assert.equal(
        (
          await db.query(
            `update public.${table} set vendor_id=vendor_id where vendor_id=$1 returning id`,
            [B],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query(`delete from public.${table} where vendor_id=$1 returning id`, [B])).rows
          .length,
        0,
      );
    } else {
      await assert.rejects(
        db.query(`update public.${table} set vendor_id=vendor_id where vendor_id=$1`, [B]),
        /permission denied/,
      );
    }
  });
}
test('all tables have forced RLS and non-null vendor_id', async () => {
  await db.exec('reset role');
  const rows = (
    await db.query(
      `select c.relname,c.relrowsecurity,c.relforcerowsecurity,a.attnotnull from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attname='vendor_id' where n.nspname='public' and c.relkind='r'`,
    )
  ).rows;
  assert.equal(rows.length, tables.length);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity && r.attnotnull));
});
test('cross-tenant inserts and tenant reassignment are rejected', async () => {
  await asUser();
  await assert.rejects(
    db.query('insert into public.customers(vendor_id,display_name) values($1,$2)', [B, 'Intruder']),
    /row-level security/,
  );
  await assert.rejects(
    db.query('update public.customers set vendor_id=$1 where vendor_id=$2', [B, A]),
    /row-level security/,
  );
});
test('composite foreign keys reject cross-vendor references', async () => {
  await db.exec('reset role');
  const other = (await db.query('select id from public.customers where vendor_id=$1', [B])).rows[0]
    .id;
  await asUser();
  await assert.rejects(
    db.query('insert into public.orders(vendor_id,customer_id) values($1,$2)', [A, other]),
    /foreign key/,
  );
});
test('membership escalation into another vendor is blocked', async () => {
  await asUser();
  await assert.rejects(
    db.query("insert into public.vendor_members(vendor_id,user_id,role) values($1,$2,'owner')", [
      B,
      USER,
    ]),
    /row-level security/,
  );
});
test('onboarding is atomic, validates input, and is idempotent', async () => {
  const user = '33333333-3333-4333-8333-333333333333';
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1)', [user]);
  await asUser(user);
  await assert.rejects(
    db.query("select public.onboard_vendor('X','products','friendly')"),
    /check constraint/,
  );
  assert.equal((await db.query('select * from public.vendors')).rows.length, 0);
  const first = (
    await db.query("select public.onboard_vendor('Ada Bakes','made-to-order','friendly') as id")
  ).rows[0].id;
  const second = (
    await db.query("select public.onboard_vendor('Ada Bakes','made-to-order','friendly') as id")
  ).rows[0].id;
  assert.equal(first, second);
  assert.equal((await db.query('select role from public.vendor_members')).rows[0].role, 'owner');
});
test('anonymous identity cannot onboard or see tenants', async () => {
  await asUser('');
  assert.equal((await db.query('select * from public.vendors')).rows.length, 0);
  await assert.rejects(
    db.query("select public.onboard_vendor('Intruder','products','friendly')"),
    /Authentication required/,
  );
});
test('receipt issuance requires payment, numbers sequentially and is retry-safe', async () => {
  await asUser();
  const customer = (await db.query('select id from public.customers')).rows[0].id;
  const order = (
    await db.query(
      'insert into public.orders(vendor_id,customer_id,total_kobo) values($1,$2,2500000) returning id',
      [A, customer],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query('select public.issue_receipt($1,$2)', [A, order]),
    /Confirmed payment/,
  );
  await db.query('select public.confirm_vendor_payment($2,$1)', [order, A]);
  const receipt = (await db.query('select public.issue_receipt($1,$2) as id', [A, order])).rows[0]
    .id;
  assert.equal(
    (await db.query('select receipt_number from public.receipts where id=$1', [receipt])).rows[0]
      .receipt_number,
    2,
  );
  assert.equal(
    (await db.query('select public.issue_receipt($1,$2) as id', [A, order])).rows[0].id,
    receipt,
  );
  await assert.rejects(db.query('select public.issue_receipt($1,$2)', [B, order]), /Forbidden/);
  await assert.rejects(
    db.query('delete from public.receipts where id=$1', [receipt]),
    /permission denied/,
  );
  await db.exec('reset role');
  await assert.rejects(
    db.query('update public.receipts set total_kobo=0 where id=$1', [receipt]),
    /immutable/,
  );
});
test('agents cannot change catalogue or invite members', async () => {
  const agent = '44444444-4444-4444-8444-444444444444';
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1)', [agent]);
  await db.query(
    "insert into public.vendor_members(vendor_id,user_id,role) values($1,$2,'agent')",
    [A, agent],
  );
  await asUser(agent);
  assert.ok((await db.query('select * from public.products')).rows.length);
  assert.equal(
    (await db.query("update public.products set name='Changed' returning id")).rows.length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into public.products(vendor_id,name,price_kobo,lowest_price_kobo) values($1,'Bad',100,100)",
      [A],
    ),
    /row-level security/,
  );
  await assert.rejects(
    db.query("insert into public.vendor_members(vendor_id,user_id,role) values($1,$2,'owner')", [
      A,
      '22222222-2222-4222-8222-222222222222',
    ]),
    /row-level security/,
  );
});
test('authenticated cannot bypass RLS using TRUNCATE and anon cannot read', async () => {
  await asUser();
  for (const table of tables)
    await assert.rejects(db.exec(`truncate public.${table} cascade`), /permission denied/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.vendors'), /permission denied/);
});
test('clients cannot fake Paystack confirmations or bypass vendor payment RPC', async () => {
  await asUser();
  await assert.rejects(
    db.query("update public.orders set payment_status='paid',payment_source='paystack'"),
    /permission denied/,
  );
  const customer = (await db.query('select id from public.customers')).rows[0].id;
  await assert.rejects(
    db.query(
      "insert into public.orders(vendor_id,customer_id,payment_status,payment_source) values($1,$2,'paid','paystack')",
      [A, customer],
    ),
    /permission denied/,
  );
  const other = (await db.query('select id from public.orders')).rows[0].id;
  await assert.rejects(
    db.query('select public.confirm_vendor_payment($1,$2)', [B, other]),
    /Forbidden/,
  );
});
test('owner membership failure rolls back vendor creation and audit entry', async () => {
  const user = '55555555-5555-4555-8555-555555555555';
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1)', [user]);
  const before = (await db.query('select count(*)::int as n from public.vendors')).rows[0].n;
  await db.exec(`create function public.test_fail_membership() returns trigger language plpgsql as $$
 begin if new.user_id='${user}'::uuid then raise exception 'Injected membership failure';end if;return new;end $$;
 create trigger test_fail_membership before insert on public.vendor_members for each row execute function public.test_fail_membership();`);
  try {
    await asUser(user);
    await assert.rejects(
      db.query("select public.onboard_vendor('Rollback Bakes','products','friendly')"),
      /Injected membership failure/,
    );
    await db.exec('reset role');
    assert.equal(
      (await db.query('select count(*)::int as n from public.vendors')).rows[0].n,
      before,
    );
    assert.equal(
      (await db.query('select * from public.vendor_members where user_id=$1', [user])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('select * from public.audit_log where actor_id=$1', [user])).rows.length,
      0,
    );
  } finally {
    await db.exec(
      'reset role;drop trigger test_fail_membership on public.vendor_members;drop function public.test_fail_membership()',
    );
  }
});
test('receipts resist UPDATE and DELETE by app owner, manager, agent, service role and database owner', async () => {
  await db.exec('reset role');
  const receipt = (await db.query('select id from public.receipts where vendor_id=$1 limit 1', [A]))
    .rows[0].id;
  for (const [index, role] of ['manager', 'agent'].entries()) {
    const user = `66666666-6666-4666-8666-66666666666${index}`;
    await db.query('insert into auth.users(id) values($1)', [user]);
    await db.query('insert into public.vendor_members(vendor_id,user_id,role) values($1,$2,$3)', [
      A,
      user,
      role,
    ]);
  }
  for (const user of [
    USER,
    '66666666-6666-4666-8666-666666666660',
    '66666666-6666-4666-8666-666666666661',
  ]) {
    await asUser(user);
    for (const sql of [
      'update public.receipts set total_kobo=0 where id=$1',
      'delete from public.receipts where id=$1',
    ])
      await assert.rejects(db.query(sql, [receipt]), /permission denied/);
  }
  await db.exec('set role service_role');
  // A genuine BYPASSRLS role can read both vendors, but cannot mutate receipts.
  assert.ok((await db.query('select distinct vendor_id from public.receipts')).rows.length >= 2);
  for (const sql of [
    'update public.receipts set total_kobo=0 where id=$1',
    'delete from public.receipts where id=$1',
  ])
    await assert.rejects(db.query(sql, [receipt]), /permission denied/);
  await assert.rejects(db.exec('truncate public.receipts'), /permission denied/);
  await db.exec('reset role');
  for (const sql of [
    'update public.receipts set total_kobo=0 where id=$1',
    'delete from public.receipts where id=$1',
  ])
    await assert.rejects(db.query(sql, [receipt]), /immutable/);
});
