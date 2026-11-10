import assert from 'node:assert/strict';
export const tenantTables = [
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
// Adapter query() must recover a failed statement using a savepoint if inside a transaction.
export async function isolationChecks(db, { A, B, USER, OTHER_USER }) {
  for (const [own, other, user] of [
    [A, B, USER],
    [B, A, OTHER_USER],
  ]) {
    await db.query('set local role authenticated');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [user, JSON.stringify({ sub: user, role: 'authenticated' })],
    );
    for (const table of tenantTables) {
      const rows = (await db.query(`select vendor_id from public.${table}`)).rows;
      assert.ok(
        rows.some((row) => row.vendor_id === own),
        `${table}: own fixture visible`,
      );
      assert.ok(
        rows.every((row) => row.vendor_id === own),
        `${table}: isolation`,
      );
      assert.equal(
        (await db.query(`select id from public.${table} where vendor_id=$1`, [other])).rows.length,
        0,
      );
      const update = table === 'orders' ? 'total_kobo=total_kobo' : 'vendor_id=vendor_id';
      for (const sql of [
        `update public.${table} set ${update} where vendor_id=$1 returning id`,
        `delete from public.${table} where vendor_id=$1 returning id`,
      ]) {
        try {
          assert.equal((await db.query(sql, [other])).rows.length, 0);
        } catch (error) {
          if (error.code !== '42501') throw error;
        }
      }
    }
    for (const sql of [
      [
        'insert into public.customers(vendor_id,display_name) values($1,$2)',
        [other, 'Forbidden fixture'],
      ],
      ['update public.customers set vendor_id=$1 where vendor_id=$2', [other, own]],
      [
        "insert into public.vendor_members(vendor_id,user_id,role) values($1,$2,'owner')",
        [other, user],
      ],
    ])
      await assert.rejects(db.query(...sql), (error) => error.code === '42501');
  }
  await db.query('set local role anon');
  await db.query(
    "select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)",
  );
  for (const table of tenantTables)
    await assert.rejects(
      db.query(`select * from public.${table}`),
      (error) => error.code === '42501',
    );
  await db.query('reset role');
}
