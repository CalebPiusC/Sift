begin;
alter table public.business_settings add column reply_engine_enabled boolean not null default false, add column reply_engine_enabled_at timestamptz;
create function public.b3_activation() returns trigger language plpgsql set search_path='' as $$begin
 if new.reply_engine_enabled and (tg_op='INSERT' or not old.reply_engine_enabled) then new.reply_engine_enabled_at:=now();end if;
 if not new.reply_engine_enabled then new.reply_engine_enabled_at:=null;end if;
 return new;end$$;
create trigger reply_activation before insert or update on public.business_settings for each row execute function public.b3_activation();
alter table public.messages add column reply_context jsonb, add column lane text check(lane in ('auto','approval','paused')), add column lane_reason text, add column detected_language text check(detected_language in ('en','pcm','mixed','other')), add column detection_confidence numeric check(detection_confidence between 0 and 1);
alter table public.approvals add column fact_snapshot jsonb, add column fact_hash text, add column safety_reason text, add column outgoing_message_id uuid, add column decision_action text check(decision_action in ('send','edit','reject'));
alter table public.approvals add foreign key(vendor_id,outgoing_message_id) references public.messages(vendor_id,id);
create index approval_outgoing_fk on public.approvals(vendor_id,outgoing_message_id);
create unique index reply_once_per_inbound on public.approvals(vendor_id,message_id) where fact_snapshot is not null;
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check(kind in ('ingest','send','holding_reply','followup','restock','payment','receipt','usage','invitation_email','channel_refresh','cleanup','gmail_sync','gmail_watch','reservation_expiry','takeover_timeout','reply'));
-- Database scheduling catches inbound inserts and prevents replaying a pre-activation mailbox.
create function public.b3_reply_schedule() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.sender='customer' and exists(select 1 from public.business_settings s where s.vendor_id=new.vendor_id and s.reply_engine_enabled and new.created_at>=s.reply_engine_enabled_at) then
 insert into public.jobs(vendor_id,kind,dedupe_key,message_id,conversation_id) values(new.vendor_id,'reply','reply:'||new.id,new.id,new.conversation_id) on conflict do nothing;
 end if;return new;end$$;
create trigger schedule_reply after insert on public.messages for each row execute function public.b3_reply_schedule();
-- Approval invalidations use the same tenant RLS as inbox messages.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='approvals') then alter publication supabase_realtime add table public.approvals;end if;
end$$;
commit;
