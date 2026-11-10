begin;
alter table public.orders add column currency text not null default 'NGN' check(currency='NGN'), add column checkout_reference text, add column checkout_started_at timestamptz, add column reservation_expires_at timestamptz, add column payment_review text, add column chat_context jsonb, add column delivery_instructions text not null default '', add column refund_requested_at timestamptz, add column refund_reference text, add column refund_status text check(refund_status in ('requested','processing','pending','completed','uncertain')), add column restocked_at timestamptz;
create unique index checkout_reference_identity on public.orders(checkout_reference) where checkout_reference is not null;
alter table public.messages add column commerce_context jsonb;
alter table public.payments add column currency text not null default 'NGN' check(currency='NGN');
alter table public.receipt_shares add column token_ciphertext bytea, add column key_version text;
create function public.b4_payment_route(p_reference text) returns table(vendor_id uuid,order_id uuid) language sql security definer set search_path='' as $$select o.vendor_id,o.id from public.orders o where o.checkout_reference=p_reference$$;
revoke all on function public.b4_payment_route(text) from public,anon,authenticated,service_role;
grant execute on function public.b4_payment_route(text) to selvora_service;
-- Legacy browser payment RPC bypasses the explicit bank confirmation and stock transaction.
revoke execute on function public.confirm_vendor_payment(uuid,uuid),public.issue_receipt(uuid,uuid) from authenticated;
create function public.b4_order_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.status<>old.status and not (
 (old.status='draft' and new.status in ('awaiting_payment','cancelled')) or
 (old.status='awaiting_payment' and new.status in ('paid','cancelled')) or
 (old.status='paid' and new.status in ('preparing','cancelled')) or
 (old.status='preparing' and new.status in ('out_for_delivery','cancelled')) or
 (old.status='out_for_delivery' and new.status='delivered')) then raise exception 'Invalid order transition' using errcode='23514';end if;
 if old.payment_status='paid' and (new.payment_status<>'paid' or new.payment_source is distinct from old.payment_source or new.payment_reference is distinct from old.payment_reference or new.paid_at is distinct from old.paid_at) then raise exception 'Payment fact is immutable' using errcode='23514';end if;
 if old.payment_status='unpaid' and new.payment_status='paid' and not exists(select 1 from public.payments p where p.vendor_id=new.vendor_id and p.order_id=new.id and p.source=new.payment_source and p.reference=new.payment_reference and p.amount_kobo=new.total_kobo) then raise exception 'Verified payment ledger required' using errcode='23514';end if;
 if old.status<>'draft' and (new.total_kobo<>old.total_kobo or new.delivery_fee_kobo<>old.delivery_fee_kobo or new.customer_id<>old.customer_id or new.delivery_city is distinct from old.delivery_city) then raise exception 'Order financial facts are frozen' using errcode='23514';end if;
 return new;end$$;
create function public.b4_order_insert_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.status<>'draft' or new.payment_status<>'unpaid' then raise exception 'New orders must start as unpaid drafts' using errcode='23514';end if;return new;end$$;
create trigger commerce_order_insert_guard before insert on public.orders for each row execute function public.b4_order_insert_guard();
create trigger commerce_order_guard before update on public.orders for each row execute function public.b4_order_guard();
create function public.b4_item_guard() returns trigger language plpgsql set search_path='' as $$begin
 perform 1 from public.orders where vendor_id=new.vendor_id and id=new.order_id for update;
 if exists(select 1 from public.orders where vendor_id=new.vendor_id and id=new.order_id and status<>'draft') then raise exception 'Order lines are frozen after draft' using errcode='23514';end if;return new;end$$;
create trigger commerce_item_guard before insert or update on public.order_items for each row execute function public.b4_item_guard();
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup','gmail_sync','gmail_watch','reservation_expiry','takeover_timeout','reply','checkout','order_message','refund'));
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then foreach t in array array['orders','order_timeline','receipts'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end if;
end$$;
commit;
