import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash, insert } from './b0-fixtures.mjs';
export async function matrixCheck(db, matrix, fixture, other, table, role, op) {
  const allowed = matrix[table][role].includes(op);
  const row = await prepareProbe(db, fixture, table, role, op);
  await db.query(
    role === 'service' ? 'set local role selvora_service' : 'set local role authenticated',
  );
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('app.vendor_id',$3,true)",
    [
      role === 'service' ? '' : fixture.users[role],
      role === 'service'
        ? '{}'
        : JSON.stringify({ sub: fixture.users[role], role: 'authenticated' }),
      fixture.vendor,
    ],
  );
  const run = () =>
    op === 'R'
      ? db.query(`select id,vendor_id from public.${table}`)
      : op === 'I'
        ? insert(db, table, row)
        : op === 'U'
          ? db.query(
              `update public.${table} set ${table === 'receipts' ? 'issued_at=issued_at' : 'created_at=created_at'} where id=$1 returning id`,
              [row.id],
            )
          : db.query(`delete from public.${table} where id=$1 returning id`, [row.id]);
  if (allowed) {
    const result = await run();
    if (op === 'R') {
      assert.ok(
        result.rows.some((r) => r.id === row.id),
        `${table}/${role}: own row readable`,
      );
      assert.ok(
        result.rows.every((r) => r.vendor_id === fixture.vendor),
        `${table}/${role}: other tenant invisible`,
      );
    } else assert.equal(result.rows.length, 1, `${table}/${role}/${op}: mutation happened`);
  } else {
    try {
      const result = await run();
      assert.equal(result.rows.length, 0, `${table}/${role}/${op}: denied`);
    } catch (e) {
      if (e.code !== '42501') throw e;
    }
  }
  // Cross-tenant reads are covered above; cross-tenant inserts exercise WITH CHECK as well.
  if (op === 'I' && allowed) {
    await assert.rejects(
      insert(db, table, { ...row, id: randomUUID(), vendor_id: other.vendor }),
      (e) => ['42501', '23503', '23514'].includes(e.code),
    );
  }
}

export async function prepareProbe(db, fixture, table, role, op) {
  const row = { ...fixture.rows[table] };
  const self = ['member_preferences', 'conversation_reads', 'notifications'].includes(table);
  if (self && role !== 'service') {
    row.member_id = fixture.members[role];
    await db.query(`update public.${table} set member_id=$1 where id=$2`, [row.member_id, row.id]);
  }
  if (op === 'I') {
    // Singleton tables must be tested with a real insert, not an ON CONFLICT no-op.
    if (
      [
        'business_settings',
        'business_hours',
        'delivery_fees',
        'member_preferences',
        'conversation_reads',
        'followup_settings',
        'billing_accounts',
        'billing_selections',
      ].includes(table)
    )
      await db.query(`delete from public.${table} where id=$1`, [row.id]);
    row.id = randomUUID();
    for (const k of [
      'request_key',
      'dedupe_key',
      'reference',
      'offer_key',
      'external_account_id',
      'provider_event_id',
      'provider_transaction',
    ])
      if (k in row) row[k] = randomUUID();
    for (const k of ['token_hash', 'key_hash', 'external_identity_hash', 'state_hash'])
      if (k in row) row[k] = hash();
    if (table === 'vendor_members') {
      row.role = 'agent';
      row.user_id = randomUUID();
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        row.user_id,
        `${row.user_id}@example.test`,
      ]);
    }
    if (table === 'receipts') {
      row.order_id = fixture.ids.orders;
      row.receipt_number = 2;
      /* direct insert should fail unique order? use new bare order */ const o = await insert(
        db,
        'orders',
        { vendor_id: fixture.vendor, customer_id: fixture.ids.customers, total_kobo: 100 },
      );
      row.order_id = o.rows[0].id;
    }
    if (table === 'channel_tokens') {
      const c = await insert(db, 'channel_accounts', {
        vendor_id: fixture.vendor,
        channel: 'email',
        external_account_id: randomUUID(),
        display_name: 'Probe',
      });
      row.channel_account_id = c.rows[0].id;
    }
    if (table === 'channel_attempts') row.status = 'expired';
    if (table === 'helper_links') row.status = 'invalidated';
    if (table === 'invitation_secrets') {
      const i = await insert(db, 'team_invitations', {
        vendor_id: fixture.vendor,
        email: `${randomUUID()}@example.test`,
        name: 'Probe',
        role: 'agent',
        invited_by: fixture.members.owner,
        expires_at: '2030-01-01',
      });
      row.invitation_id = i.rows[0].id;
    }
    if (table === 'blocked_identities') {
      row.identity_id = fixture.ids.customer_identities;
      await db.query('delete from public.blocked_identities where id=$1', [
        fixture.ids.blocked_identities,
      ]);
    }
    if (table === 'restock_requests') row.status = 'cancelled';
    if (table === 'stock_reservations') row.status = 'released';
    if (table === 'usage_meters') {
      row.period_start = '2027-01-01';
      row.period_end = '2027-02-01';
    }
    if (table === 'product_photos') row.position = 1;
    if (table === 'team_invitations') row.email = `${randomUUID()}@example.test`;
  }

  return row;
}
