begin;
-- B5: encrypted private media, tenant-bound WhatsApp routing and helper authority.
alter table public.channel_accounts drop constraint channel_accounts_provider_check;
alter table public.channel_accounts add constraint channel_accounts_provider_check check(provider in ('gmail','whatsapp'));
alter table public.channel_accounts add column whatsapp_waba_id text, add column helper_account boolean not null default false;
alter table public.conversations add column last_customer_at timestamptz;
alter table public.messages add column template_context jsonb;
alter table public.webhook_events add column media_ciphertext bytea, add column media_key_version text, add column media_mime text, add column transcript text, add column detected_language text, add column helper_member_id uuid;
alter table public.webhook_events add foreign key(vendor_id,helper_member_id) references public.vendor_members(vendor_id,id);
alter table public.helper_links add column member_id uuid, add column sender_hash text, add column pending_proposal_id uuid;
alter table public.helper_links add foreign key(vendor_id,member_id) references public.vendor_members(vendor_id,id), add foreign key(vendor_id,pending_proposal_id) references public.typed_proposals(vendor_id,id);
create unique index b5_helper_sender on public.helper_links(sender_hash) where status='linked';
alter table public.typed_proposals add column instruction_change jsonb;
create function public.b5_whatsapp_route(p_phone text) returns table(vendor_id uuid,account_id uuid) language sql security definer set search_path='' as $$
 select c.vendor_id,c.id from public.channel_accounts c where c.provider='whatsapp' and c.external_account_id=p_phone and c.status='connected' and not c.helper_account limit 1;
$$;
create function public.b5_helper_route(p_hash text) returns table(vendor_id uuid,member_id uuid) language sql security definer set search_path='' as $$
 select h.vendor_id,h.member_id from public.helper_links h join public.vendor_members m on m.vendor_id=h.vendor_id and m.id=h.member_id where h.sender_hash=p_hash and h.status='linked' and m.status='active' and m.role in ('owner','manager') limit 1;
$$;
revoke all on function public.b5_whatsapp_route(text),public.b5_helper_route(text) from public,anon,authenticated,service_role;
grant execute on function public.b5_whatsapp_route(text),public.b5_helper_route(text) to selvora_service;
-- Raw media must never be browser-readable via table grants/realtime. It lives in
-- server-only webhook_events. Message columns carry no ciphertext in this increment.
revoke select on public.webhook_events from authenticated;
-- Meta inbound audio does not supply duration. Never fabricate a duration.
alter table public.messages drop constraint voice_shape;
alter table public.messages add constraint voice_shape check(kind<>'voice' or voice_transcript is not null);
drop index public.current_helper_link;
create unique index current_helper_link on public.helper_links(vendor_id,coalesce(member_id,vendor_id)) where status in ('pending','linked');
alter table public.webhook_events add column helper_reply text, add column helper_send_started_at timestamptz, add column helper_provider_id text;
create index b5_event_member_fk on public.webhook_events(vendor_id,helper_member_id);
create index b5_helper_member_fk on public.helper_links(vendor_id,member_id);
create index b5_helper_proposal_fk on public.helper_links(vendor_id,pending_proposal_id);

alter table public.messages add column media_language text check(length(media_language)<=80);
commit;
