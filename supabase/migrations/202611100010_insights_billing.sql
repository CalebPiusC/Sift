begin;
alter table public.billing_accounts add column entitlement_limit integer not null default 100 check(entitlement_limit>=0), add column entitlement_ends_at timestamptz;
alter table public.billing_offers add column paystack_plan_code text, add column interval_months integer not null default 1 check(interval_months in (1,12));
create table public.billing_checkouts (
 id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.vendors(id),offer_id uuid not null,reference text not null unique,
 amount_kobo bigint not null check(amount_kobo>0),conversations integer not null check(conversations>0),kind text not null check(kind in ('monthly','yearly','volume','bundle')),interval_months integer not null check(interval_months in (1,12)),plan_code text,email text not null,
 status text not null default 'pending' check(status in ('pending','initializing','ready','uncertain','paid')),authorization_url text, paid_at timestamptz,provider_customer text,created_at timestamptz not null default now(),
 foreign key(vendor_id,offer_id) references public.billing_offers(vendor_id,id),unique(vendor_id,id));
create table public.billing_payments(id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),checkout_id uuid not null,provider_transaction text not null unique,reference text not null unique,amount_kobo bigint not null check(amount_kobo>0),paid_at timestamptz not null,created_at timestamptz not null default now(),foreign key(vendor_id,checkout_id) references public.billing_checkouts(vendor_id,id),unique(vendor_id,id));
create table public.ai_cost_entries(id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),dedupe_key text not null,model text not null,operation text not null,input_tokens integer check(input_tokens>=0),output_tokens integer check(output_tokens>=0),cost_usd numeric(18,9) check(cost_usd>=0),pricing_version text not null,created_at timestamptz not null default now(),unique(vendor_id,dedupe_key),unique(vendor_id,id));
-- Append-only payment and cost evidence, scoped service access only.
do $$declare t text;begin foreach t in array array['billing_checkouts','billing_payments','ai_cost_entries'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select,insert on public.%I to selvora_service',t);
 execute format('create policy worker_r on public.%I for select to selvora_service using(public.service_vendor(vendor_id))',t);
 execute format('create policy worker_i on public.%I for insert to selvora_service with check(public.service_vendor(vendor_id))',t);
 end loop;end$$;
grant update on public.billing_checkouts to selvora_service;
create policy worker_u on public.billing_checkouts for update to selvora_service using(public.service_vendor(vendor_id)) with check(public.service_vendor(vendor_id));
create trigger immutable_payment before update or delete on public.billing_payments for each row execute function public.prevent_receipt_mutation();
create trigger immutable_cost before update or delete on public.ai_cost_entries for each row execute function public.prevent_receipt_mutation();
alter table public.jobs add column billing_checkout_id uuid;
alter table public.jobs add foreign key(vendor_id,billing_checkout_id) references public.billing_checkouts(vendor_id,id);
create index billing_job_checkout on public.jobs(vendor_id,billing_checkout_id);
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup','gmail_sync','gmail_watch','reservation_expiry','takeover_timeout','reply','checkout','order_message','refund','translation','billing_payment'));
create function public.b8_billing_route(ref text) returns table(vendor_id uuid,checkout_id uuid) language sql security definer set search_path='' as $$select c.vendor_id,c.id from public.billing_checkouts c where c.reference=ref limit 1$$;
revoke all on function public.b8_billing_route(text) from public,anon,authenticated,service_role;grant execute on function public.b8_billing_route(text) to selvora_service;
-- Event snapshots do not change when catalogue names/prices or message statuses change later.
alter table public.domain_events add column sender text,add column channel text,add column line_items jsonb;
create function public.b8_event_snapshot() returns trigger language plpgsql set search_path='' as $$begin
 if new.message_id is not null then select m.sender into new.sender from public.messages m where m.id=new.message_id;end if;
 if new.conversation_id is not null then select a.channel into new.channel from public.conversations c join public.channel_accounts a on a.id=c.channel_account_id where c.id=new.conversation_id;end if;
 if new.event_type='order_paid' then select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name_snapshot,'quantity',i.quantity)),'[]') into new.line_items from public.order_items i where i.order_id=new.order_id;end if;
 return new;end$$;
create trigger b8_snapshot before insert on public.domain_events for each row execute function public.b8_event_snapshot();
create function public.b8_renewal_route(customer_code text, plan text) returns table(vendor_id uuid,checkout_id uuid) language sql security definer set search_path='' as $$
 with candidates as(select distinct on(c.vendor_id) c.vendor_id,c.id from public.billing_checkouts c where c.provider_customer=customer_code and c.plan_code=plan and c.status='paid' and c.kind<>'bundle' order by c.vendor_id,c.paid_at desc)
 select c.vendor_id,c.id from candidates c where (select count(*) from candidates)=1;
$$;
revoke all on function public.b8_renewal_route(text,text) from public,anon,authenticated,service_role;
grant execute on function public.b8_renewal_route(text,text) to selvora_service;
commit;
