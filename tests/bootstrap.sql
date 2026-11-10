-- Local-only compatibility shim. Supabase already provides these objects.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(
 nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'
 )::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

grant usage on schema public,auth to service_role;
grant execute on function auth.uid() to service_role;
alter default privileges in schema public grant all on tables to service_role;
