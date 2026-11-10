begin;
-- No public new tables; extend the B0 tenant/RLS boundary for Gmail and durable workers.
alter table public.channel_accounts add column provider text check(provider in ('gmail')), add column mailbox_hash text check(mailbox_hash ~ '^[0-9a-f]{64}$'), add column gmail_history_id numeric(30,0), add column watch_expires_at timestamptz;
create unique index gmail_mailbox_owner on public.channel_accounts(provider,mailbox_hash) where provider='gmail' and mailbox_hash is not null;
alter table public.channel_attempts add column oauth_context_ciphertext bytea, add column oauth_key_version text, add column initiating_member_id uuid;
alter table public.channel_attempts add foreign key(vendor_id,initiating_member_id) references public.vendor_members(vendor_id,id);
alter table public.messages add column provider_message_id text, add column rfc_message_id text, add column email_subject text, add column reply_to_message_id uuid, add column delivery_error_code text check(delivery_error_code ~ '^[A-Z0-9_]{1,64}$');
alter table public.messages add foreign key(vendor_id,reply_to_message_id) references public.messages(vendor_id,id);
alter table public.conversations add column provider_thread_id text;
create unique index gmail_thread_identity on public.conversations(vendor_id,channel_account_id,provider_thread_id) where provider_thread_id is not null;
alter table public.customers add column merged_into_id uuid;
alter table public.customers add foreign key(vendor_id,merged_into_id) references public.customers(vendor_id,id), add constraint customer_no_self_merge check(merged_into_id is null or merged_into_id<>id);
alter table public.audit_log add column source_customer_id uuid, add column target_customer_id uuid;
alter table public.audit_log add foreign key(vendor_id,source_customer_id) references public.customers(vendor_id,id), add foreign key(vendor_id,target_customer_id) references public.customers(vendor_id,id);
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup','gmail_sync','gmail_watch','reservation_expiry','takeover_timeout'));
alter table public.jobs add column channel_account_id uuid;
alter table public.jobs add foreign key(vendor_id,channel_account_id) references public.channel_accounts(vendor_id,id);
create index gmail_attempt_member_fk on public.channel_attempts(vendor_id,initiating_member_id);
create index message_reply_fk on public.messages(vendor_id,reply_to_message_id);
create index customer_merge_fk on public.customers(vendor_id,merged_into_id);
create index audit_source_fk on public.audit_log(vendor_id,source_customer_id);
create index audit_target_fk on public.audit_log(vendor_id,target_customer_id);
create index job_account_fk on public.jobs(vendor_id,channel_account_id);
-- Minimal privileged routing capabilities. They return IDs only, never secrets/message content.
-- They are executable only after SET ROLE selvora_service, never by browser roles.
create function public.b2_oauth_route(p_hash text) returns table(vendor_id uuid,attempt_id uuid) language sql security definer set search_path='' as $$
 select a.vendor_id,a.id from public.channel_attempts a where a.state_hash=p_hash and a.status='pending' and a.expires_at>now();
$$;
create function public.b2_mailbox_route(p_hash text) returns table(vendor_id uuid,account_id uuid) language sql security definer set search_path='' as $$
 select c.vendor_id,c.id from public.channel_accounts c where c.provider='gmail' and c.mailbox_hash=p_hash and c.status='connected';
$$;
create function public.b2_due_vendors(p_limit integer default 100) returns table(vendor_id uuid) language sql security definer set search_path='' as $$
 select distinct j.vendor_id from public.jobs j where (j.status in ('queued','failed') and j.run_at<=now() and j.attempts<j.max_attempts) or (j.status='running' and j.locked_until<now()) limit greatest(1,least(p_limit,1000));
$$;
revoke all on function public.b2_oauth_route(text),public.b2_mailbox_route(text),public.b2_due_vendors(integer) from public,anon,authenticated,service_role;
grant execute on function public.b2_oauth_route(text),public.b2_mailbox_route(text),public.b2_due_vendors(integer) to selvora_service;
-- Alias merges preserve original identities, thread/customer FKs and immutable receipts.
create function public.b2_merge_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='UPDATE' and old.merged_into_id is distinct from new.merged_into_id and current_user='authenticated' then raise exception 'Use authorized merge transaction' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('merge:'||new.vendor_id,0));
 if new.merged_into_id is not null then
  if current_user='authenticated' then raise exception 'Use authorized merge transaction' using errcode='42501';end if;
  if exists(select 1 from public.customers where vendor_id=new.vendor_id and id=new.merged_into_id and merged_into_id is not null) or exists(select 1 from public.customers where vendor_id=new.vendor_id and merged_into_id=new.id) then raise exception 'Merge chains not allowed' using errcode='23514';end if;
 end if;return new;
end $$;
create trigger customer_merge_guard before insert or update on public.customers for each row execute function public.b2_merge_guard();
alter table public.jobs add column approval_id uuid, add column followup_id uuid, add column reservation_id uuid;
alter table public.jobs add foreign key(vendor_id,approval_id) references public.approvals(vendor_id,id), add foreign key(vendor_id,followup_id) references public.followups(vendor_id,id), add foreign key(vendor_id,reservation_id) references public.stock_reservations(vendor_id,id);
alter table public.followups add column message_id uuid;
alter table public.followups add foreign key(vendor_id,message_id) references public.messages(vendor_id,id);
create index job_approval_fk on public.jobs(vendor_id,approval_id);
create index job_followup_fk on public.jobs(vendor_id,followup_id);
create index job_reservation_fk on public.jobs(vendor_id,reservation_id);
create index followup_message_fk on public.followups(vendor_id,message_id);
alter table public.messages add column provider_account_id uuid;
alter table public.messages add foreign key(vendor_id,provider_account_id) references public.channel_accounts(vendor_id,id);
create index message_provider_account_fk on public.messages(vendor_id,provider_account_id);
create unique index gmail_message_dedupe on public.messages(vendor_id,provider_account_id,provider_message_id) where provider_message_id is not null;
-- Delayed intent is committed in PostgreSQL, never entrusted to an in-process timer.
create function public.b2_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare job_kind text; due timestamptz; cid uuid; aid uuid; fid uuid; rid uuid; oid uuid;
begin
 if tg_table_name='approvals' then if new.status='pending' and new.holding_reply_sent_at is null then job_kind:='holding_reply';due:=new.holding_reply_due_at;cid:=new.conversation_id;aid:=new.id;end if;
 elsif tg_table_name='followups' then if new.status='scheduled' then job_kind:='followup';due:=new.scheduled_at;cid:=new.conversation_id;fid:=new.id;end if;
 elsif tg_table_name='stock_reservations' then if new.status='active' then job_kind:='reservation_expiry';due:=new.expires_at;rid:=new.id;oid:=new.order_id;end if;
 elsif tg_table_name='conversations' then if new.human_mode_until is not null then job_kind:='takeover_timeout';due:=new.human_mode_until;cid:=new.id;end if;
 end if;
 if job_kind is not null then insert into public.jobs(vendor_id,kind,dedupe_key,run_at,conversation_id,approval_id,followup_id,reservation_id,order_id)
 values(new.vendor_id,job_kind,'schedule:'||new.id||':'||due::text,due,cid,aid,fid,rid,oid) on conflict(vendor_id,kind,dedupe_key) do nothing;end if;
 return new;
end $$;
create trigger schedule_intent after insert or update on public.approvals for each row execute function public.b2_schedule();
create trigger schedule_intent after insert or update on public.followups for each row execute function public.b2_schedule();
create trigger schedule_intent after insert or update on public.stock_reservations for each row execute function public.b2_schedule();
create trigger schedule_intent after insert or update on public.conversations for each row execute function public.b2_schedule();
-- Backfill outstanding timers; this does not send or decide anything.
insert into public.jobs(vendor_id,kind,dedupe_key,run_at,conversation_id,approval_id) select vendor_id,'holding_reply','schedule:'||id||':'||holding_reply_due_at::text,holding_reply_due_at,conversation_id,id from public.approvals where status='pending' and holding_reply_sent_at is null on conflict do nothing;
insert into public.jobs(vendor_id,kind,dedupe_key,run_at,conversation_id,followup_id) select vendor_id,'followup','schedule:'||id||':'||scheduled_at::text,scheduled_at,conversation_id,id from public.followups where status='scheduled' on conflict do nothing;
insert into public.jobs(vendor_id,kind,dedupe_key,run_at,order_id,reservation_id) select vendor_id,'reservation_expiry','schedule:'||id||':'||expires_at::text,expires_at,order_id,id from public.stock_reservations where status='active' on conflict do nothing;
insert into public.jobs(vendor_id,kind,dedupe_key,run_at,conversation_id) select vendor_id,'takeover_timeout','schedule:'||id||':'||human_mode_until::text,human_mode_until,id from public.conversations where human_mode_until is not null on conflict do nothing;
-- Supabase realtime authorizes subscribers with existing forced RLS; no secret tables published.
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['messages','conversations','channel_accounts','customers'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
commit;
