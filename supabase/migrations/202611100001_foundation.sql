begin;

create table public.vendors (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null unique,
 business_name text not null check(char_length(btrim(business_name)) between 2 and 80),
 business_type text not null check(business_type in ('products','services','made-to-order','mixed')),
 tone text not null check(tone in ('friendly','professional','Pidgin-friendly')),
 auto_negotiation boolean not null default false,
 created_at timestamptz not null default now(),
 constraint vendor_self_scope check(vendor_id=id),
 unique(vendor_id,id)
);
alter table public.vendors add constraint vendors_scope_fk foreign key(vendor_id) references public.vendors(id);
create table public.vendor_members (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 user_id uuid not null references auth.users(id),role text not null check(role in ('owner','manager','agent')),
 created_at timestamptz not null default now(),unique(vendor_id,user_id),unique(vendor_id,id)
);
-- SECURITY DEFINER avoids recursive membership RLS. Never accepts a caller-supplied user ID.
create function public.is_vendor_member(p_vendor uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vendor_members where vendor_id=p_vendor and user_id=auth.uid());
$$;
create function public.has_vendor_role(p_vendor uuid,p_roles text[]) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vendor_members where vendor_id=p_vendor and user_id=auth.uid() and role=any(p_roles));
$$;
revoke all on function public.is_vendor_member(uuid),public.has_vendor_role(uuid,text[]) from public;
grant execute on function public.is_vendor_member(uuid),public.has_vendor_role(uuid,text[]) to authenticated;

create table public.customers (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 display_name text not null,phone text,email text,language text not null default 'en',
 created_at timestamptz not null default now(),unique(vendor_id,id)
);
create table public.channel_accounts (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 channel text not null check(channel in ('whatsapp','instagram','facebook','tiktok','email')),
 external_account_id text not null,display_name text not null,status text not null default 'disconnected' check(status in ('connected','disconnected','error')),
 created_at timestamptz not null default now(),unique(channel,external_account_id),unique(vendor_id,id)
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 customer_id uuid not null,channel_account_id uuid not null,
 human_mode_until timestamptz,human_mode boolean not null default false,
 created_at timestamptz not null default now(),unique(vendor_id,id),
 foreign key(vendor_id,customer_id) references public.customers(vendor_id,id),
 foreign key(vendor_id,channel_account_id) references public.channel_accounts(vendor_id,id)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 conversation_id uuid not null,external_message_id text,
 sender text not null check(sender in ('customer','ai','vendor')),content text not null,
 status text not null default 'received' check(status in ('received','draft','pending_approval','blocked','sent','failed')),
 language text,created_at timestamptz not null default now(),unique(vendor_id,id),
 unique(vendor_id,conversation_id,external_message_id),
 foreign key(vendor_id,conversation_id) references public.conversations(vendor_id,id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 name text not null,description text not null default '',kind text not null default 'product' check(kind in ('product','service','made-to-order')),
 price_kobo bigint not null check(price_kobo>=0),lowest_price_kobo bigint not null check(lowest_price_kobo>=0 and lowest_price_kobo<=price_kobo),
 stock_count integer check(stock_count>=0),created_at timestamptz not null default now(),unique(vendor_id,id)
);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),product_id uuid not null,
 name text not null,price_kobo bigint not null check(price_kobo>=0),stock_count integer check(stock_count>=0),
 created_at timestamptz not null default now(),unique(vendor_id,id),unique(vendor_id,product_id,id),
 foreign key(vendor_id,product_id) references public.products(vendor_id,id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),customer_id uuid not null,
 status text not null default 'pending' check(status in ('pending','confirmed','fulfilled','cancelled')),
 total_kobo bigint not null default 0 check(total_kobo>=0),delivery_fee_kobo bigint not null default 0 check(delivery_fee_kobo>=0),
 delivery_city text,payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid')),
 payment_source text check(payment_source in ('vendor','paystack')),payment_reference text,
 created_at timestamptz not null default now(),unique(vendor_id,id),
 check((payment_status='unpaid' and payment_source is null) or (payment_status='paid' and payment_source is not null)),
 foreign key(vendor_id,customer_id) references public.customers(vendor_id,id)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),order_id uuid not null,product_id uuid not null,variant_id uuid,
 quantity integer not null check(quantity>0),unit_price_kobo bigint not null check(unit_price_kobo>=0),
 created_at timestamptz not null default now(),unique(vendor_id,id),
 foreign key(vendor_id,order_id) references public.orders(vendor_id,id),
 foreign key(vendor_id,product_id) references public.products(vendor_id,id),
 foreign key(vendor_id,product_id,variant_id) references public.product_variants(vendor_id,product_id,id)
);
create table public.receipts (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),order_id uuid not null,
 receipt_number bigint not null check(receipt_number>0),snapshot jsonb not null,total_kobo bigint not null check(total_kobo>=0),
 issued_at timestamptz not null default now(),unique(vendor_id,id),unique(vendor_id,receipt_number),unique(vendor_id,order_id),
 foreign key(vendor_id,order_id) references public.orders(vendor_id,id)
);
create table public.approvals (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),conversation_id uuid not null,message_id uuid not null,
 customer_message text not null,facts jsonb not null,proposed_reply text not null,reason text not null,
 status text not null default 'pending' check(status in ('pending','sent','edited','rejected')),
 holding_reply_due_at timestamptz not null default (now()+interval '5 minutes'),
 created_at timestamptz not null default now(),unique(vendor_id,id),
 foreign key(vendor_id,conversation_id) references public.conversations(vendor_id,id),
 foreign key(vendor_id,message_id) references public.messages(vendor_id,id)
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(),vendor_id uuid not null references public.vendors(id),
 actor_id uuid,action text not null,entity_type text not null,entity_id uuid,
 created_at timestamptz not null default now(),unique(vendor_id,id)
);
-- No arbitrary metadata on audit rows: do not put messages or phone numbers in logs.
do $$ declare t text; begin
 foreach t in array array['vendors','vendor_members','customers','conversations','messages','products','product_variants','orders','order_items','receipts','channel_accounts','approvals','audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using (public.is_vendor_member(vendor_id))',t);
  execute format('create index on public.%I(vendor_id)',t);
 end loop;
 foreach t in array array['customers','conversations','messages','orders','order_items','approvals'] loop
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check (public.is_vendor_member(vendor_id))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id))',t);
 end loop;
 foreach t in array array['products','product_variants','channel_accounts'] loop
  execute format('create policy manager_write on public.%I for all to authenticated using (public.has_vendor_role(vendor_id,ARRAY[''owner'',''manager''])) with check (public.has_vendor_role(vendor_id,ARRAY[''owner'',''manager'']))',t);
 end loop;
end $$;
create policy owner_update on public.vendors for update to authenticated using(public.has_vendor_role(vendor_id,array['owner'])) with check(public.has_vendor_role(vendor_id,array['owner']));
create policy owner_members on public.vendor_members for all to authenticated using(public.has_vendor_role(vendor_id,array['owner'])) with check(public.has_vendor_role(vendor_id,array['owner']));

-- The only client entry point to create a tenant. Atomic and retry-safe per user.
create function public.onboard_vendor(p_name text,p_type text,p_tone text) returns uuid
 language plpgsql security definer set search_path='' as $$
 declare v_id uuid;v_user uuid:=auth.uid();
 begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select vendor_id into v_id from public.vendor_members where user_id=v_user order by created_at limit 1;
 if v_id is not null then return v_id;end if;
 v_id:=gen_random_uuid();
 insert into public.vendors(id,vendor_id,business_name,business_type,tone) values(v_id,v_id,btrim(p_name),p_type,p_tone);
 insert into public.vendor_members(vendor_id,user_id,role) values(v_id,v_user,'owner');
 insert into public.audit_log(vendor_id,actor_id,action,entity_type,entity_id) values(v_id,v_user,'vendor.created','vendor',v_id);
 return v_id;
 end;
$$;
revoke all on function public.onboard_vendor(text,text,text) from public;
grant execute on function public.onboard_vendor(text,text,text) to authenticated;

create function public.prevent_receipt_mutation() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Issued receipts are immutable' using errcode='42501';end;
$$;
create trigger immutable_receipts before update or delete on public.receipts for each row execute function public.prevent_receipt_mutation();
-- Vendor row lock serialises receipt numbering without gaps from failed transactions.
create function public.issue_receipt(p_vendor uuid,p_order uuid) returns uuid
 language plpgsql security definer set search_path='' as $$
 declare o public.orders;v_id uuid;v_number bigint;v_items jsonb;
 begin
 if not public.is_vendor_member(p_vendor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform 1 from public.vendors where id=p_vendor for update;
 select id into v_id from public.receipts where vendor_id=p_vendor and order_id=p_order;
 if v_id is not null then return v_id;end if;
 select * into o from public.orders where vendor_id=p_vendor and id=p_order for update;
 if o.id is null or o.payment_status<>'paid' then raise exception 'Confirmed payment required';end if;
 select coalesce(max(receipt_number),0)+1 into v_number from public.receipts where vendor_id=p_vendor;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',p.name,'variant',v.name,'quantity',i.quantity,'unit_price_kobo',i.unit_price_kobo)),'[]'::jsonb) into v_items
 from public.order_items i join public.products p on p.vendor_id=i.vendor_id and p.id=i.product_id
 left join public.product_variants v on v.vendor_id=i.vendor_id and v.id=i.variant_id where i.vendor_id=p_vendor and i.order_id=p_order;
 insert into public.receipts(vendor_id,order_id,receipt_number,snapshot,total_kobo)
 values(p_vendor,p_order,v_number,jsonb_build_object('order_id',o.id,'total_kobo',o.total_kobo,'delivery_fee_kobo',o.delivery_fee_kobo,'items',v_items,'payment_source',o.payment_source),o.total_kobo) returning id into v_id;
 return v_id;
 end;
$$;
revoke all on function public.issue_receipt(uuid,uuid) from public;
grant execute on function public.issue_receipt(uuid,uuid) to authenticated;
grant usage on schema public to authenticated;
-- Override Supabase default ALL privileges (notably TRUNCATE, which bypasses RLS).
revoke all on all tables in schema public from anon,authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
-- Browser clients cannot claim a Paystack webhook confirmed payment.
revoke insert,update on public.orders from authenticated;
grant insert(vendor_id,customer_id,status,total_kobo,delivery_fee_kobo,delivery_city) on public.orders to authenticated;
grant update(status,total_kobo,delivery_fee_kobo,delivery_city) on public.orders to authenticated;
create function public.confirm_vendor_payment(p_vendor uuid,p_order uuid) returns void
 language plpgsql security definer set search_path='' as $$
 begin
 if not public.is_vendor_member(p_vendor) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.orders set payment_status='paid',payment_source='vendor'
 where vendor_id=p_vendor and id=p_order and payment_status='unpaid';
 if not found and not exists(select 1 from public.orders where vendor_id=p_vendor and id=p_order and payment_status='paid') then
 raise exception 'Order not found';end if;
 insert into public.audit_log(vendor_id,actor_id,action,entity_type,entity_id)
 values(p_vendor,auth.uid(),'payment.vendor_confirmed','order',p_order);
 end;
$$;
revoke all on function public.confirm_vendor_payment(uuid,uuid) from public;
grant execute on function public.confirm_vendor_payment(uuid,uuid) to authenticated;

-- Audit and receipt writes must go through controlled functions or trusted workers.
revoke insert,update,delete on public.receipts,public.audit_log from authenticated;
commit;
