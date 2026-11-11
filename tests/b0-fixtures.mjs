import { randomUUID, randomBytes } from 'node:crypto';
export const hash = () => randomBytes(32).toString('hex');
export async function b0Fixture(db, matrix) {
  const vendor = randomUUID(),
    users = { owner: randomUUID(), manager: randomUUID(), agent: randomUUID() },
    members = { owner: randomUUID(), manager: randomUUID(), agent: randomUUID() };
  for (const u of Object.values(users))
    await db.query('insert into auth.users(id,email) values($1,$2)', [u, `${u}@example.test`]);
  const ids = Object.fromEntries(Object.keys(matrix).map((t) => [t, randomUUID()]));
  ids.vendors = vendor;
  ids.vendor_members = members.owner;
  const rows = {};
  const put = async (t, fields) => {
    const r = { id: ids[t], vendor_id: vendor, ...fields };
    rows[t] = r;
    await insert(db, t, r);
  };
  const expires = '2030-01-01T00:00:00Z',
    cipher = randomBytes(24);
  await put('vendors', {
    business_name: 'B0 fixture',
    business_type: 'products',
    tone: 'friendly',
  });
  for (const role of ['owner', 'manager', 'agent'])
    await db.query(
      'insert into public.vendor_members(id,vendor_id,user_id,role) values($1,$2,$3,$4)',
      [members[role], vendor, users[role], role],
    );
  rows.vendor_members = {
    id: members.owner,
    vendor_id: vendor,
    user_id: users.owner,
    role: 'owner',
  };
  await put('customers', { display_name: 'Fixture customer' });
  await put('channel_accounts', {
    channel: 'whatsapp',
    external_account_id: randomUUID(),
    display_name: 'Fixture channel',
  });
  await put('conversations', {
    customer_id: ids.customers,
    channel_account_id: ids.channel_accounts,
  });
  await put('messages', {
    conversation_id: ids.conversations,
    sender: 'customer',
    content: 'Fixture',
  });
  await put('products', {
    name: 'Fixture product',
    price_kobo: 2000000,
    lowest_price_kobo: 1500000,
    stock_count: 10,
  });
  await put('product_variants', {
    product_id: ids.products,
    name: 'Medium',
    price_kobo: 2000000,
    stock_count: 10,
  });
  await put('orders', { customer_id: ids.customers, total_kobo: 2000000 });
  await put('order_items', {
    order_id: ids.orders,
    product_id: ids.products,
    variant_id: ids.product_variants,
    quantity: 1,
    unit_price_kobo: 2000000,
  });
  await put('receipts', {
    order_id: ids.orders,
    receipt_number: 1,
    snapshot: { fixture: true },
    total_kobo: 2000000,
  });
  await put('approvals', {
    conversation_id: ids.conversations,
    message_id: ids.messages,
    customer_message: 'Fixture',
    facts: { fixture: true },
    proposed_reply: 'Fixture',
    reason: 'unknown_intent',
  });
  await put('audit_log', { action: 'fixture', entity_type: 'vendor' });
  await put('business_settings', {});
  await put('business_hours', { day: 1 });
  await put('delivery_fees', { city: 'Lagos', fee_kobo: 10000 });
  await put('member_preferences', { member_id: members.owner });
  await put('conversation_reads', { member_id: members.owner, conversation_id: ids.conversations });
  await put('product_photos', {
    product_id: ids.products,
    storage_key: 'private/fixture.jpg',
    name: 'Fixture',
    position: 0,
  });
  await put('catalogue_drafts', {
    member_id: members.owner,
    request_key: randomUUID(),
    drafts: [],
    expires_at: expires,
  });
  await put('typed_proposals', {
    member_id: members.owner,
    input_text: 'Fixture',
    candidates: [],
    expires_at: expires,
  });
  await put('team_invitations', {
    email: `${randomUUID()}@example.test`,
    name: 'Invite',
    role: 'agent',
    invited_by: members.owner,
    expires_at: expires,
  });
  await put('invitation_secrets', { invitation_id: ids.team_invitations, token_hash: hash() });
  await put('customer_identities', {
    customer_id: ids.customers,
    channel_account_id: ids.channel_accounts,
    external_identity_hash: hash(),
    external_identity_ciphertext: cipher,
    key_version: 'test-key-v1',
  });
  await put('followup_settings', {});
  await put('followups', {
    conversation_id: ids.conversations,
    customer_id: ids.customers,
    scheduled_at: expires,
    message_style: 'friendly',
    content: 'Fixture',
    dedupe_key: randomUUID(),
  });
  await put('moderation_flags', { message_id: ids.messages, reason: 'Fixture' });
  await put('blocked_identities', {
    identity_id: ids.customer_identities,
    flag_id: ids.moderation_flags,
  });
  await put('restock_requests', {
    product_id: ids.products,
    variant_id: ids.product_variants,
    customer_id: ids.customers,
  });
  await put('notifications', {
    member_id: members.owner,
    kind: 'needs_you',
    dedupe_key: randomUUID(),
  });
  await put('channel_tokens', {
    channel_account_id: ids.channel_accounts,
    ciphertext: cipher,
    key_version: 'test-key-v1',
  });
  await put('channel_attempts', {
    channel_account_id: ids.channel_accounts,
    state_hash: hash(),
    expires_at: new Date(Date.now() + 599000).toISOString(),
  });
  await put('helper_links', {
    code_hash: hash(),
    expires_at: new Date(Date.now() + 599000).toISOString(),
  });
  await put('billing_accounts', {});
  await put('billing_offers', {
    offer_key: randomUUID(),
    name: 'Fixture offer',
    kind: 'monthly',
    price_kobo: 10000,
    conversations: 100,
  });
  await put('billing_selections', { offer_id: ids.billing_offers });
  await put('billing_checkouts', {
    offer_id: ids.billing_offers,
    reference: randomUUID(),
    amount_kobo: 10000,
    conversations: 100,
    kind: 'bundle',
    interval_months: 1,
    email: 'fixture@example.test',
  });
  await put('billing_payments', {
    checkout_id: ids.billing_checkouts,
    provider_transaction: randomUUID(),
    reference: randomUUID(),
    amount_kobo: 10000,
    paid_at: new Date().toISOString(),
  });
  await put('ai_cost_entries', {
    dedupe_key: randomUUID(),
    model: 'fixture',
    operation: 'test',
    pricing_version: 'fixture',
  });
  await put('usage_meters', {
    period_start: '2026-11-01',
    period_end: '2026-12-01',
    conversation_limit: 100,
  });
  await put('usage_entries', {
    meter_id: ids.usage_meters,
    conversation_id: ids.conversations,
    quantity: 1,
    dedupe_key: randomUUID(),
  });
  await put('payments', {
    order_id: ids.orders,
    source: 'vendor',
    amount_kobo: 2000000,
    reference: randomUUID(),
    verified_at: '2026-11-10',
  });
  await put('stock_reservations', {
    order_id: ids.orders,
    order_item_id: ids.order_items,
    product_id: ids.products,
    variant_id: ids.product_variants,
    quantity: 1,
    expires_at: expires,
  });
  await put('stock_movements', {
    product_id: ids.products,
    variant_id: ids.product_variants,
    requested: 1,
    delta: 1,
    reason: 'restock',
    dedupe_key: randomUUID(),
  });
  await put('order_timeline', { order_id: ids.orders, label: 'Fixture' });
  await put('message_deliveries', {
    message_id: ids.messages,
    channel_account_id: ids.channel_accounts,
    dedupe_key: randomUUID(),
  });
  await put('webhook_events', {
    provider: 'whatsapp',
    provider_event_id: randomUUID(),
    payload_ciphertext: cipher,
    key_version: 'test-key-v1',
    payload_hash: hash(),
    signature_verified: true,
    expires_at: expires,
  });
  await put('jobs', { kind: 'ingest', dedupe_key: randomUUID() });
  await put('idempotency_keys', {
    operation: 'fixture',
    actor_scope: 'fixture',
    key_hash: hash(),
    request_hash: hash(),
    expires_at: expires,
  });
  await put('receipt_shares', {
    receipt_id: ids.receipts,
    token_hash: hash(),
    expires_at: expires,
  });
  await put('domain_events', {
    event_type: 'order_created',
    order_id: ids.orders,
    dedupe_key: randomUUID(),
  });
  return { vendor, users, members, ids, rows };
}
export async function insert(db, table, row) {
  const keys = Object.keys(row);
  return db.query(
    `insert into public.${table}(${keys.join(',')}) values(${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
    Object.entries(row).map(([k, v]) =>
      v instanceof Uint8Array
        ? v
        : ['drafts', 'candidates', 'snapshot', 'facts'].includes(k)
          ? JSON.stringify(v)
          : Array.isArray(v)
            ? v
            : v && typeof v === 'object'
              ? JSON.stringify(v)
              : v,
    ),
  );
}
