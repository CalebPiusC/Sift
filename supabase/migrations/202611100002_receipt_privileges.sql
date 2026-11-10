begin;
-- Supabase grants service_role ALL on newly created tables by default.
-- Workers do not need destructive operations on issued receipts, even with BYPASSRLS.
revoke update,delete,truncate on public.receipts from authenticated,anon,service_role;
-- The immutable_receipts trigger additionally blocks row mutation by the DB owner.
-- A database administrator can still disable triggers or DROP tables: that is not an app role.
commit;
