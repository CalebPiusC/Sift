begin;
alter table public.customers add column opted_out_at timestamptz;
alter table public.customer_identities add column opted_out_at timestamptz;
alter table public.messages add column english_translation text, add column extras_context jsonb;
alter table public.followups add column source_message_id uuid, add column template_context jsonb;
alter table public.followups add foreign key(vendor_id,source_message_id) references public.messages(vendor_id,id);
create index b7_followup_source on public.followups(vendor_id,source_message_id);
alter table public.restock_requests add column conversation_id uuid, add column message_id uuid, add column template_context jsonb;
alter table public.restock_requests add foreign key(vendor_id,conversation_id) references public.conversations(vendor_id,id), add foreign key(vendor_id,message_id) references public.messages(vendor_id,id);
create index b7_restock_conversation on public.restock_requests(vendor_id,conversation_id);
create index b7_restock_message on public.restock_requests(vendor_id,message_id);
alter table public.invitation_secrets add column token_ciphertext bytea, add column key_version text;
alter table public.team_invitations add column delivery_status text not null default 'queued' check(delivery_status in ('queued','sending','sent','uncertain','failed')), add column provider_message_id text;
alter table public.jobs add column invitation_id uuid, add column restock_request_id uuid;
alter table public.jobs add foreign key(vendor_id,invitation_id) references public.team_invitations(vendor_id,id), add foreign key(vendor_id,restock_request_id) references public.restock_requests(vendor_id,id);
create index b7_job_invitation on public.jobs(vendor_id,invitation_id);
create index b7_job_restock on public.jobs(vendor_id,restock_request_id);
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup','gmail_sync','gmail_watch','reservation_expiry','takeover_timeout','reply','checkout','order_message','refund','translation'));
alter table public.vendors add column deletion_requested_at timestamptz, add column deletion_state text check(deletion_state in ('requested','redacted_retention_pending'));
create function public.b7_suppression_sticky() returns trigger language plpgsql set search_path='' as $$begin
 if old.opted_out_at is not null and new.opted_out_at is distinct from old.opted_out_at then raise exception 'Opt-out cannot be cleared' using errcode='23514';end if;
 if current_user='authenticated' and new.opted_out_at is distinct from old.opted_out_at then raise exception 'Use opt-out API' using errcode='42501';end if;
 return new;
end$$;
create trigger suppression_sticky before update on public.customers for each row execute function public.b7_suppression_sticky();
create trigger suppression_sticky before update on public.customer_identities for each row execute function public.b7_suppression_sticky();
create index b7_flags_by_message on public.moderation_flags(vendor_id,message_id);
-- Every recorded reply/purchase invalidates scheduled follow-ups, independent of worker uptime.
create function public.b7_cancel_followups() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='messages' then
  if new.sender='customer' then update public.followups set status='cancelled' where conversation_id=new.conversation_id and status='scheduled';end if;
 else
  if new.payment_status='paid' then update public.followups set status='cancelled' where vendor_id=new.vendor_id and customer_id=new.customer_id and status='scheduled';end if;
 end if;return new;
end$$;
create trigger b7_reply_cancels after insert on public.messages for each row execute function public.b7_cancel_followups();
create trigger b7_purchase_cancels after update on public.orders for each row execute function public.b7_cancel_followups();
create function public.b7_invite_route(p_hash text) returns table(vendor_id uuid,invitation_id uuid) language sql security definer set search_path='' as $$
 select i.vendor_id,i.id from public.team_invitations i join public.invitation_secrets s on s.vendor_id=i.vendor_id and s.invitation_id=i.id join public.vendors v on v.id=i.vendor_id where s.token_hash=p_hash and i.status in ('pending','accepted') and i.expires_at>now() and v.deletion_requested_at is null limit 1;
$$;
revoke all on function public.b7_invite_route(text) from public,anon,authenticated,service_role;
grant execute on function public.b7_invite_route(text) to selvora_service;
-- Persist notification history at its source; no in-memory reconstruction.
create function public.b7_notify() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='approvals' then
  insert into public.notifications(vendor_id,member_id,conversation_id,approval_id,kind,dedupe_key)
  select new.vendor_id,m.id,new.conversation_id,new.id,'needs_you','approval:'||new.id from public.vendor_members m left join public.member_preferences p on p.member_id=m.id and p.vendor_id=m.vendor_id where m.vendor_id=new.vendor_id and m.status='active' and coalesce(p.needs_you,true) and (m.role in ('owner','manager') or m.id=(select c.assigned_member_id from public.conversations c where c.id=new.conversation_id)) on conflict do nothing;
 elsif new.stage='ready_to_pay' and old.stage is distinct from new.stage then
  insert into public.notifications(vendor_id,member_id,conversation_id,kind,dedupe_key)
  select new.vendor_id,m.id,new.id,'ready_to_pay','ready:'||new.id||':'||new.revision from public.vendor_members m left join public.member_preferences p on p.member_id=m.id and p.vendor_id=m.vendor_id where m.vendor_id=new.vendor_id and m.status='active' and coalesce(p.ready_to_pay,true) and (m.role in ('owner','manager') or m.id=new.assigned_member_id) on conflict do nothing;
 end if;return new;
end$$;
create trigger b7_approval_notification after insert on public.approvals for each row execute function public.b7_notify();
create trigger b7_ready_notification after update on public.conversations for each row execute function public.b7_notify();
alter table public.vendor_members add column member_email text;
create function public.b7_restock_schedule() returns trigger language plpgsql set search_path='' as $$
declare pid uuid;vid uuid;
begin
 if tg_table_name='products' then pid:=new.id;vid:=null;
 elsif tg_table_name='product_variants' then pid:=new.product_id;vid:=new.id;
 else pid:=new.product_id;vid:=new.variant_id;end if;
 insert into public.jobs(vendor_id,kind,dedupe_key,restock_request_id,conversation_id)
 select r.vendor_id,'restock','restock:'||r.id||':'||txid_current(),r.id,r.conversation_id from public.restock_requests r where r.vendor_id=new.vendor_id and r.product_id=pid and r.variant_id is not distinct from vid and r.status='waiting' and r.consent_at is not null and r.conversation_id is not null on conflict do nothing;
 return new;
end$$;
create trigger b7_restock_product after update of stock_count on public.products for each row execute function public.b7_restock_schedule();
create trigger b7_restock_variant after update of stock_count on public.product_variants for each row execute function public.b7_restock_schedule();
create trigger b7_restock_request after insert on public.restock_requests for each row execute function public.b7_restock_schedule();
commit;
