begin;
alter table public.vendors add column ai_paused boolean not null default false;
-- Operations-only singleton, outside tenant tables; no browser/table access.
create schema if not exists operations;
revoke all on schema operations from public,anon,authenticated,service_role,selvora_service;
create table operations.controls(singleton boolean primary key default true check(singleton),ai_paused boolean not null default false,updated_at timestamptz not null default now());
insert into operations.controls(singleton) values(true);
alter table operations.controls enable row level security;
alter table operations.controls force row level security;
create function public.b9_ai_paused(v uuid) returns boolean language sql security definer set search_path='' as $$
 select coalesce((select ai_paused from operations.controls where singleton),true) or coalesce((select ai_paused or deletion_requested_at is not null from public.vendors where id=v and vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid),true);
$$;
create table operations.control_events(id uuid primary key default gen_random_uuid(),actor_id uuid,paused boolean not null,created_at timestamptz not null default now());
alter table operations.control_events enable row level security;
alter table operations.control_events force row level security;
create trigger append_only before update or delete on operations.control_events for each row execute function public.prevent_receipt_mutation();
create function public.b9_global_pause(paused boolean,actor uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
 insert into operations.control_events(actor_id,paused) values(actor,paused);
 update operations.controls set ai_paused=paused,updated_at=now() where singleton;
end$$;
revoke all on function public.b9_ai_paused(uuid),public.b9_global_pause(boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.b9_ai_paused(uuid),public.b9_global_pause(boolean,uuid) to selvora_service;
alter table operations.controls add column worker_seen_at timestamptz;
create function public.b9_worker_heartbeat() returns void language sql security definer set search_path='' as $$update operations.controls set worker_seen_at=now() where singleton$$;
create function public.b9_backlog() returns table(pending bigint,dead bigint,oldest_seconds bigint,worker_age_seconds bigint) language sql security definer set search_path='' as $$
 select count(*) filter(where j.status in ('queued','failed','running')),count(*) filter(where j.status='dead'),coalesce(extract(epoch from now()-min(j.run_at) filter(where j.status in ('queued','failed') and j.run_at<now()))::bigint,0),(select extract(epoch from now()-worker_seen_at)::bigint from operations.controls where singleton) from public.jobs j;
$$;
revoke all on function public.b9_worker_heartbeat(),public.b9_backlog() from public,anon,authenticated,service_role;
grant execute on function public.b9_worker_heartbeat(),public.b9_backlog() to selvora_service;
commit;
