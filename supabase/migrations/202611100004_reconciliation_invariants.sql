begin;
-- Operational truth (assignment, stages, incoming messages) is service-owned.
-- Read markers remain per-member. Future API writes authorize the human then use scoped service.
drop policy b0_i on public.conversations;
drop policy b0_u on public.conversations;
revoke insert,update on public.conversations from authenticated;
-- Parent consistency beyond merely sharing a tenant.
alter table public.orders add foreign key(vendor_id,customer_id,conversation_id) references public.conversations(vendor_id,customer_id,id);
alter table public.order_items add unique(vendor_id,order_id,product_id,id);
alter table public.stock_reservations add foreign key(vendor_id,order_id,product_id,order_item_id) references public.order_items(vendor_id,order_id,product_id,id);
alter table public.customer_identities add unique(vendor_id,customer_id,id);
alter table public.restock_requests add column identity_id uuid;
alter table public.restock_requests add foreign key(vendor_id,customer_id,identity_id) references public.customer_identities(vendor_id,customer_id,id);
alter table public.messages add constraint voice_shape check(kind<>'voice' or (voice_duration_seconds is not null and voice_transcript is not null));
alter table public.messages add constraint product_snapshot_shape check(product_snapshot is null or jsonb_typeof(product_snapshot)='object'), add constraint order_snapshot_shape check(order_snapshot is null or jsonb_typeof(order_snapshot)='object');
alter table public.stock_movements drop constraint stock_movements_delta_check;
alter table public.stock_movements add constraint stock_delta_direction check((reason='sale' and delta<=0 and -delta+shortfall=requested) or (reason in ('restock','release') and delta=requested and shortfall=0) or (reason='correction' and delta<>0 and shortfall=0));
alter table public.jobs add constraint job_attempt_bounds check(attempts<=max_attempts);
alter table public.channel_attempts add constraint attempt_ttl check(expires_at>created_at and expires_at<=created_at+interval '10 minutes');
alter table public.helper_links add constraint helper_ttl check(expires_at>created_at and expires_at<=created_at+interval '10 minutes'), add constraint helper_linked_time check((status='linked')=(linked_at is not null));
alter table public.domain_events add constraint event_required_entity check(
 (event_type not in ('message_received','reply_sent') or message_id is not null) and
 (event_type not in ('order_created','order_paid','order_status_changed','payment_verified') or order_id is not null) and
 (event_type not in ('takeover_started','takeover_ended','approval_created','approval_decided','followup_sent') or conversation_id is not null) and
 (event_type<>'stock_changed' or product_id is not null));
-- Four-digit codes must use keyed HMAC with an external pepper, not unsalted SHA-256.
-- SQL stores only the digest. API must rate limit + lock row when incrementing attempts.
create function public.valid_customer_tags(tags text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(bool_and(length(btrim(t)) between 1 and 30),true) from unnest(tags) t;
$$;
alter table public.customers add constraint customer_tag_bounds check(public.valid_customer_tags(tags));
-- Do not permit delivery to a different account than the message's conversation.
create function public.b0_delivery_account_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.messages m join public.conversations c on c.vendor_id=m.vendor_id and c.id=m.conversation_id where m.vendor_id=new.vendor_id and m.id=new.message_id and c.channel_account_id=new.channel_account_id) then raise exception 'Message account mismatch' using errcode='23514'; end if;
 return new;
end $$;
create trigger delivery_account_guard before insert or update on public.message_deliveries for each row execute function public.b0_delivery_account_guard();
-- Reservations lock the inventory row before counting; no concurrent oversubscription.
create function public.b0_reservation_guard() returns trigger language plpgsql set search_path='' as $$
declare available integer; reserved bigint; variant uuid;
begin
 if new.status<>'active' then return new; end if;
 if new.expires_at<=now() then raise exception 'Active reservation already expired' using errcode='23514'; end if;
 if new.variant_id is not null then
  select stock_count into available from public.product_variants where vendor_id=new.vendor_id and product_id=new.product_id and id=new.variant_id for update;
 else
  if exists(select 1 from public.product_variants where vendor_id=new.vendor_id and product_id=new.product_id) then raise exception 'Choose a variant' using errcode='23514'; end if;
  select stock_count into available from public.products where vendor_id=new.vendor_id and id=new.product_id for update;
 end if;
 if available is null then return new; end if; -- explicitly untracked stock
 select coalesce(sum(quantity),0) into reserved from public.stock_reservations where vendor_id=new.vendor_id and product_id=new.product_id and variant_id is not distinct from new.variant_id and id<>new.id and status='active' and expires_at>now();
 if new.quantity+reserved>available then raise exception 'Insufficient unreserved stock' using errcode='23514'; end if;
 return new;
end $$;
create trigger reservation_guard before insert or update on public.stock_reservations for each row execute function public.b0_reservation_guard();
-- Prevent assigning a suspended member. Human users cannot directly change assignments.
create function public.b0_assignment_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if new.assigned_member_id is not null and not exists(select 1 from public.vendor_members where vendor_id=new.vendor_id and id=new.assigned_member_id and status='active') then raise exception 'Active assignee required' using errcode='23514'; end if;
 return new;
end $$;
create trigger assignment_guard before insert or update on public.conversations for each row execute function public.b0_assignment_guard();
-- Bump revisions for optimistic concurrency; endpoint WHERE revision must still match first.
create function public.b0_touch_revision() returns trigger language plpgsql set search_path='' as $$ begin
 new.revision:=old.revision+1;
 if to_jsonb(new)?'updated_at' then new:=jsonb_populate_record(new,jsonb_build_object('updated_at',now())); end if;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['products','product_variants','orders','conversations','messages','approvals','business_settings'] loop execute format('create trigger touch_revision before update on public.%I for each row execute function public.b0_touch_revision()',t); end loop; end $$;
-- Historical facts preserve outcomes/amounts without copying customer content.
alter table public.domain_events add column aggregate_revision bigint not null default 1 check(aggregate_revision>0), add column from_status text, add column to_status text, add column amount_kobo bigint check(amount_kobo>=0), add column payment_source text check(payment_source in ('vendor','paystack')), add column receipt_id uuid;
alter table public.domain_events add foreign key(vendor_id,receipt_id) references public.receipts(vendor_id,id);
alter table public.domain_events add constraint safe_event_status check((from_status is null or from_status in ('draft','awaiting_payment','paid','preparing','out_for_delivery','delivered','cancelled','pending','sent','edited','rejected','scheduled','failed','waiting','notified')) and (to_status is null or to_status in ('draft','awaiting_payment','paid','preparing','out_for_delivery','delivered','cancelled','pending','sent','edited','rejected','scheduled','failed','waiting','notified')));
create index event_receipt_fk on public.domain_events(vendor_id,receipt_id);
-- Transactional event producers: no messages, phone numbers, tokens or arbitrary JSON payload.
create function public.b0_capture_event() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; conv uuid; msg uuid; cust uuid; ord uuid; prod uuid; prior text; following text; rev text; actor uuid; prev_status text; next_status text; amount bigint; source text; receipt uuid; fact_time timestamptz:=now();
begin
 select id into actor from public.vendor_members where vendor_id=new.vendor_id and user_id=auth.uid() and status='active';
 rev:=coalesce(to_jsonb(new)->>'revision','1');
 if tg_table_name='messages' then
  conv:=new.conversation_id; msg:=new.id;
  if tg_op='INSERT' and new.sender='customer' then kind:='message_received';
  elsif new.sender<>'customer' and new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then kind:='reply_sent'; end if;
 elsif tg_table_name='conversations' then
  conv:=new.id;cust:=new.customer_id;
  if tg_op='INSERT' or old.stage is distinct from new.stage then kind:='lead_stage_changed';following:=new.stage;if tg_op='UPDATE' then prior:=old.stage;end if;
  elsif old.human_mode_until is distinct from new.human_mode_until then kind:=case when new.human_mode_until>now() then 'takeover_started' else 'takeover_ended' end; end if;
 elsif tg_table_name='orders' then
  ord:=new.id;conv:=new.conversation_id;cust:=new.customer_id;
  if tg_op='INSERT' then kind:='order_created';
  elsif old.payment_status<>'paid' and new.payment_status='paid' then kind:='order_paid';
  elsif old.status is distinct from new.status then kind:='order_status_changed'; end if;
 elsif tg_table_name='approvals' then
  conv:=new.conversation_id;msg:=new.message_id;
  if tg_op='INSERT' then kind:='approval_created';elsif old.status='pending' and new.status<>'pending' then kind:='approval_decided';end if;
 elsif tg_table_name='receipts' then kind:='receipt_issued';ord:=new.order_id;
 elsif tg_table_name='stock_movements' then kind:='stock_changed';prod:=new.product_id;ord:=new.order_id;
 elsif tg_table_name='followups' then if new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then kind:='followup_sent';conv:=new.conversation_id;cust:=new.customer_id;end if;
 elsif tg_table_name='restock_requests' then if new.status='notified' and (tg_op='INSERT' or old.status is distinct from new.status) then kind:='restock_notified';prod:=new.product_id;cust:=new.customer_id;end if;
 elsif tg_table_name='payments' then kind:='payment_verified';ord:=new.order_id;
 end if;
 if kind is not null then
 if tg_table_name in ('orders','approvals','followups','restock_requests') then next_status:=to_jsonb(new)->>'status';if tg_op='UPDATE' then prev_status:=to_jsonb(old)->>'status';end if;end if;
 if tg_table_name='orders' then amount:=new.total_kobo;source:=new.payment_source;
 elsif tg_table_name='payments' then amount:=new.amount_kobo;source:=new.source;fact_time:=new.verified_at;
 elsif tg_table_name='receipts' then receipt:=new.id;amount:=new.total_kobo;fact_time:=new.issued_at;
 elsif tg_table_name='messages' and tg_op='INSERT' then fact_time:=new.created_at;
 elsif tg_table_name='followups' then fact_time:=new.sent_at;
 elsif tg_table_name='restock_requests' then fact_time:=new.notified_at;
 end if;
 insert into public.domain_events(vendor_id,event_type,actor_member_id,conversation_id,message_id,customer_id,order_id,product_id,from_stage,to_stage,dedupe_key,aggregate_revision,from_status,to_status,amount_kobo,payment_source,receipt_id,occurred_at)
 values(new.vendor_id,kind,actor,conv,msg,cust,ord,prod,prior,following,tg_table_name||':'||new.id||':'||rev||':'||kind,rev::bigint,prev_status,next_status,amount,source,receipt,fact_time) on conflict(vendor_id,dedupe_key) do nothing;end if;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['messages','conversations','orders','approvals','receipts','stock_movements','followups','restock_requests','payments'] loop execute format('create trigger capture_event after insert or update on public.%I for each row execute function public.b0_capture_event()',t);end loop;end $$;
-- Reconciled existing onboarding RPC initializes its new dependent records atomically.
create or replace function public.onboard_vendor(p_name text,p_type text,p_tone text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_user uuid:=auth.uid();v_member uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select vendor_id,id into v_id,v_member from public.vendor_members where user_id=v_user and status='active' order by created_at limit 1;
 if v_id is not null then return v_id;end if;
 v_id:=gen_random_uuid();
 insert into public.vendors(id,vendor_id,business_name,business_type,tone) values(v_id,v_id,btrim(p_name),p_type,p_tone);
 insert into public.vendor_members(vendor_id,user_id,role) values(v_id,v_user,'owner') returning id into v_member;
 insert into public.business_settings(vendor_id) values(v_id);
 insert into public.business_hours(vendor_id,day,closed) select v_id,d,d=0 from generate_series(0,6) d;
 insert into public.followup_settings(vendor_id) values(v_id);
 insert into public.member_preferences(vendor_id,member_id) values(v_id,v_member);
 insert into public.audit_log(vendor_id,actor_id,action,entity_type,entity_id) values(v_id,v_user,'vendor.created','vendor',v_id);
 return v_id;
end $$;
-- New receipts use frozen line names and include all frontend-required snapshot fields.
create or replace function public.b0_issue_receipt_internal(p_vendor uuid,p_order uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders;v_id uuid;v_number bigint;v_items jsonb;v_name text;c_name text;
begin
 if not public.has_vendor_role(p_vendor,array['owner','manager']) then raise exception 'Forbidden' using errcode='42501';end if;
 select business_name into v_name from public.vendors where id=p_vendor for update;
 select id into v_id from public.receipts where vendor_id=p_vendor and order_id=p_order;if v_id is not null then return v_id;end if;
 select * into o from public.orders where vendor_id=p_vendor and id=p_order for update;
 if o.id is null or o.payment_status<>'paid' or o.status='cancelled' then raise exception 'Confirmed payment required' using errcode='23514';end if;
 select display_name into c_name from public.customers where vendor_id=p_vendor and id=o.customer_id;
 select coalesce(max(receipt_number),0)+1 into v_number from public.receipts where vendor_id=p_vendor;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.name_snapshot,'variant',i.variant_name_snapshot,'quantity',i.quantity,'unit_price_kobo',i.unit_price_kobo,'snapshot_source',i.snapshot_source) order by i.created_at,i.id),'[]'::jsonb) into v_items from public.order_items i where i.vendor_id=p_vendor and i.order_id=p_order;
 insert into public.receipts(vendor_id,order_id,receipt_number,snapshot,total_kobo) values(p_vendor,p_order,v_number,jsonb_build_object('order_id',o.id,'vendor_name',v_name,'customer_name',c_name,'subtotal_kobo',o.total_kobo-o.delivery_fee_kobo,'total_kobo',o.total_kobo,'delivery_fee_kobo',o.delivery_fee_kobo,'items',v_items,'payment_source',o.payment_source),o.total_kobo) returning id into v_id;
 return v_id;
end $$;
create index restock_identity_fk on public.restock_requests(vendor_id,customer_id,identity_id);
create index order_conversation_customer_fk on public.orders(vendor_id,customer_id,conversation_id);
create index reservation_item_product_fk on public.stock_reservations(vendor_id,order_id,product_id,order_item_id);
-- Replace an untyped resource pointer with tenant-enforced typed resource references.
alter table public.idempotency_keys drop column resource_id;
alter table public.idempotency_keys add column order_id uuid, add column message_id uuid, add column receipt_id uuid, add column product_id uuid;
alter table public.idempotency_keys add foreign key(vendor_id,order_id) references public.orders(vendor_id,id), add foreign key(vendor_id,message_id) references public.messages(vendor_id,id), add foreign key(vendor_id,receipt_id) references public.receipts(vendor_id,id), add foreign key(vendor_id,product_id) references public.products(vendor_id,id);
alter table public.audit_log add foreign key(vendor_id,actor_id) references public.vendor_members(vendor_id,user_id);
create index idempotency_order_fk on public.idempotency_keys(vendor_id,order_id);
create index idempotency_message_fk on public.idempotency_keys(vendor_id,message_id);
create index idempotency_receipt_fk on public.idempotency_keys(vendor_id,receipt_id);
create index idempotency_product_fk on public.idempotency_keys(vendor_id,product_id);
create index audit_actor_fk on public.audit_log(vendor_id,actor_id);
-- Stable keyset identity for every mutable table (including trusted workers).
create function public.b0_stable_identity() returns trigger language plpgsql set search_path='' as $$ begin
 if new.id<>old.id or new.vendor_id<>old.vendor_id or (to_jsonb(new)->'created_at') is distinct from (to_jsonb(old)->'created_at') then raise exception 'Immutable row identity' using errcode='42501';end if;return new;
end $$;
do $$ declare r record;begin for r in select tablename from pg_tables where schemaname='public' and tablename=any(array['vendors','vendor_members','customers','conversations','products','product_variants','orders','order_items','messages','approvals','channel_accounts','receipts','audit_log','business_settings','business_hours','delivery_fees','followup_settings','member_preferences','conversation_reads','product_photos','catalogue_drafts','typed_proposals','team_invitations','followups','moderation_flags','blocked_identities','restock_requests','customer_identities','notifications','billing_accounts','billing_offers','billing_selections','usage_meters','payments','stock_movements','usage_entries','domain_events','stock_reservations','order_timeline','message_deliveries','channel_tokens','channel_attempts','helper_links','invitation_secrets','webhook_events','jobs','idempotency_keys','receipt_shares']) loop execute format('create trigger stable_identity before update on public.%I for each row execute function public.b0_stable_identity()',r.tablename);end loop;end $$;
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup')), add column lease_token uuid;
alter table public.jobs add constraint safe_job_error check(last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$');
alter table public.message_deliveries add constraint safe_delivery_error check(error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'), add constraint delivery_time_order check((delivered_at is null or sent_at is null or delivered_at>=sent_at) and (read_at is null or delivered_at is null or read_at>=delivered_at));
create function public.b0_stock_floor_guard() returns trigger language plpgsql set search_path='' as $$
declare reserved bigint; floor_price bigint;
begin
 if tg_table_name='product_variants' then
  select lowest_price_kobo into floor_price from public.products where vendor_id=new.vendor_id and id=new.product_id for update;
  if new.price_kobo<floor_price then raise exception 'Variant under product floor' using errcode='23514';end if;
  select coalesce(sum(quantity),0) into reserved from public.stock_reservations where vendor_id=new.vendor_id and product_id=new.product_id and variant_id=new.id and status='active' and expires_at>now();
 else
  if exists(select 1 from public.product_variants where vendor_id=new.vendor_id and product_id=new.id and price_kobo<new.lowest_price_kobo) then raise exception 'Floor exceeds a variant price' using errcode='23514';end if;
  select coalesce(sum(quantity),0) into reserved from public.stock_reservations where vendor_id=new.vendor_id and product_id=new.id and variant_id is null and status='active' and expires_at>now();
 end if;
 if new.stock_count is not null and new.stock_count<reserved then raise exception 'Stock is reserved' using errcode='23514';end if;
 return new;
end $$;
create trigger stock_floor_guard before insert or update on public.products for each row execute function public.b0_stock_floor_guard();
create trigger stock_floor_guard before insert or update on public.product_variants for each row execute function public.b0_stock_floor_guard();
-- Sent follow-up/restock history and decided approvals cannot be rewritten later.
create function public.b0_terminal_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='approvals' then
  if old.status<>'pending' and (to_jsonb(new)-'revision') is distinct from (to_jsonb(old)-'revision') then raise exception 'Decision already final' using errcode='23514';end if;
 else
  if old.status in ('sent','notified','cancelled') and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'History already final' using errcode='23514';end if;
 end if;return new;
end $$;
create trigger terminal_guard before update on public.approvals for each row execute function public.b0_terminal_guard();
create trigger terminal_guard before update on public.followups for each row execute function public.b0_terminal_guard();
create trigger terminal_guard before update on public.restock_requests for each row execute function public.b0_terminal_guard();
-- Owner is protected; ownership transfer requires a future separately reviewed workflow.
create unique index one_owner_per_vendor on public.vendor_members(vendor_id) where role='owner';
create function public.b0_owner_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if old.role='owner' then
  if tg_op='DELETE' then raise exception 'Owner is protected' using errcode='23514';end if;
  if new.role<>old.role or new.user_id<>old.user_id or new.status<>old.status then raise exception 'Owner is protected' using errcode='23514';end if;
 end if;if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger owner_guard before update or delete on public.vendor_members for each row execute function public.b0_owner_guard();
-- Safe JS integer bounds are part of the public kobo contract, even though SQL uses bigint.
do $$ declare r record;begin
 for r in select table_name,column_name from information_schema.columns where table_schema='public' and table_name=any(array['vendors','vendor_members','customers','conversations','products','product_variants','orders','order_items','messages','approvals','channel_accounts','receipts','audit_log','business_settings','business_hours','delivery_fees','followup_settings','member_preferences','conversation_reads','product_photos','catalogue_drafts','typed_proposals','team_invitations','followups','moderation_flags','blocked_identities','restock_requests','customer_identities','notifications','billing_accounts','billing_offers','billing_selections','usage_meters','payments','stock_movements','usage_entries','domain_events','stock_reservations','order_timeline','message_deliveries','channel_tokens','channel_attempts','helper_links','invitation_secrets','webhook_events','jobs','idempotency_keys','receipt_shares']) and column_name like '%kobo' loop execute format('alter table public.%I add constraint %I check (%I<=9007199254740991)',r.table_name,r.table_name||'_'||r.column_name||'_safe_integer',r.column_name);end loop;
 if exists(select 1 from public.product_variants v join public.products p on p.vendor_id=v.vendor_id and p.id=v.product_id where v.price_kobo<p.lowest_price_kobo) then raise exception 'Existing variant is below its product floor; review data before upgrade' using errcode='23514';end if;
end $$;
-- Provider event identity is account-scoped; payment webhooks have no channel account.
alter table public.webhook_events drop constraint webhook_events_vendor_id_provider_provider_event_id_key;
create unique index webhook_account_dedupe on public.webhook_events(vendor_id,provider,channel_account_id,provider_event_id) where channel_account_id is not null;
create unique index webhook_merchant_dedupe on public.webhook_events(vendor_id,provider,provider_event_id) where channel_account_id is null;
-- Do not misrepresent backfilled names/timestamps as verified historical data.
alter table public.order_items add column snapshot_source text not null default 'order_creation' check(snapshot_source in ('order_creation','legacy_migration'));
update public.order_items set snapshot_source='legacy_migration';
alter table public.orders add column paid_at_source text check(paid_at_source in ('verified','legacy_creation'));
update public.orders set paid_at_source='legacy_creation' where paid_at is not null;
create or replace function public.confirm_vendor_payment(p_vendor uuid,p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_vendor_role(p_vendor,array['owner','manager']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.orders set payment_status='paid',payment_source='vendor',paid_at=now(),paid_at_source='verified',status='paid' where vendor_id=p_vendor and id=p_order and payment_status='unpaid' and status='awaiting_payment';
 if found then insert into public.audit_log(vendor_id,actor_id,action,entity_type,entity_id) values(p_vendor,auth.uid(),'payment.vendor_confirmed','order',p_order);
 elsif not exists(select 1 from public.orders where vendor_id=p_vendor and id=p_order and payment_status='paid') then raise exception 'Awaiting unpaid order required' using errcode='23514';end if;
end $$;
commit;
