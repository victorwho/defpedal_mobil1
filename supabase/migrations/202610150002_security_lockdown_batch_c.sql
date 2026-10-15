-- Security lockdown, Batch C (2026-10-15) — stop new objects being born open.
--
-- Root cause of error-log #138: Supabase's default ACL grants anon +
-- authenticated ALL privileges on every new table, sequence and function in
-- `public`, and Postgres itself grants EXECUTE on every new function to PUBLIC.
-- Batches A and B fixed the objects that existed; this fixes the defaults, so
-- the next scratch/backup table, staging table or RPC is closed until someone
-- grants access on purpose.
--
-- Scope: objects created by `postgres` — every migration, the Management API
-- and OSRM_Server's risk loaders run as postgres (65 of the 68 public tables).
-- The `supabase_admin` default ACL for `public` stays as it is: postgres is not
-- a member of supabase_admin and cannot alter it, and the only
-- supabase_admin-owned objects in `public` are PostGIS's (spatial_ref_sys + its
-- functions). `storage` defaults are left to Supabase.
--
-- service_role keeps its default grants, so mobile-api sees new objects as
-- before. Consequence for future work: a table or function a CLIENT must reach
-- directly (Realtime subscription, client .from()/.rpc(), a function called
-- inside an RLS policy) now needs an explicit GRANT — the failure is
-- "permission denied", not an empty result.

begin;

create table archive.lockdown_snapshot_20261015c_default_acl as
  select defaclrole::regrole::text as owner, defaclnamespace, defaclobjtype, defaclacl::text as acl
  from pg_default_acl;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
-- The built-in EXECUTE-to-PUBLIC default is global, not per schema.
alter default privileges for role postgres
  revoke execute on functions from public;

commit;
