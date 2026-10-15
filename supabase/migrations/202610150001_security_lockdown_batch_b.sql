-- Security lockdown, Batch B (drafted 2026-10-14, apply 2026-10-15 after the
-- Batch A soak — see error-log #138).
--
-- Batch A closed the write paths that were exploitable with the bare anon key
-- or that let a session edit its own XP / paywall flag. Batch B removes the
-- REST of the client write surface. Every rider-facing read and write goes
-- through mobile-api on the service-role key (bypasses RLS and holds its own
-- grants), and Supabase anonymous sign-in makes `authenticated` free for
-- anyone, so a client write policy is exposure with no consumer:
--   - verified 2026-10-14: no app/web/edge-function code calls .from()/.rpc()
--     with a non-service key (only Storage `avatars` + auth), the admin
--     dashboard writes server-side with the service role, and the one
--     browser client that wrote directly (defpedal5 / beta.defensivepedal.com)
--     was deleted on 2026-10-14.
--
--   1. Revoke INSERT/UPDATE/DELETE on every public table (and sequence usage)
--      from anon + authenticated, and drop the ~55 own-row write policies.
--      Notable: hazard_validations (direct votes skipped the API rate limit
--      and dedup), xp_events / user_badges / streak_state / ride_impacts
--      (self-awarded progression), trips / trip_tracks (bypassed validation).
--   2. hazards: no client SELECT. The table was readable by anyone with the
--      anon key — 21k rows incl. 15 rider reports with user_id + location +
--      time. The app reads hazards only via GET /v1/hazards/nearby.
--   3. trip_shares: any session (anonymous included) could read every
--      non-hidden share — ride geometry + start/destination text. Scoped to
--      the owner, the same fix 2026-09-25 applied to profiles / activity_feed.
--   4. get_public_route_share / record_route_share_view: SECURITY DEFINER and
--      executable by clients (view-count inflation, sharer user id). Only
--      mobile-api calls them, with the service role.
--   5. Pin search_path on the two SECURITY DEFINER functions that had none.
--   6. avatars bucket: public with no size or type limit. Cap at 2 MB, images
--      only. The largest existing avatar is 1.2 MB (p95 925 KB, picker
--      quality 0.7) — a 512 KB cap would have broken uploads.
--
-- SELECT grants on other tables are deliberately kept: their reads are
-- already scoped by policy (own rows, or public-by-design reference data).
-- Prior policies/grants are snapshotted below for rollback.
-- ⚠️ Supabase Table Editor runs as `authenticated`: hazards and other
-- people's trip_shares will look empty there. Use the SQL editor.

begin;

create table archive.lockdown_snapshot_20261015_policies as
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies where schemaname = 'public';
create table archive.lockdown_snapshot_20261015_grants as
  select table_schema, table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated');
create table archive.lockdown_snapshot_20261015_buckets as
  select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 1. Client write surface.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles <> '{service_role}'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke usage, update on all sequences in schema public from anon, authenticated;

-- 2. hazards: API-only reads.
drop policy "Allow public select on hazards" on public.hazards;
drop policy hazards_select_own on public.hazards;

-- 3. trip_shares: owner only.
drop policy trip_shares_select_authenticated on public.trip_shares;
create policy trip_shares_select_own on public.trip_shares
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 4. Route-share definer functions: service role only.
revoke execute on function public.get_public_route_share(text)  from public, anon, authenticated;
revoke execute on function public.record_route_share_view(text) from public, anon, authenticated;
grant  execute on function public.get_public_route_share(text)  to service_role;
grant  execute on function public.record_route_share_view(text) to service_role;

-- 5. Pin search_path (matches the database default, so behaviour is unchanged).
alter function public.check_and_award_badges(uuid) set search_path = public, extensions;
alter function public.increment_hazard_count()     set search_path = public, extensions;

-- 6. Avatars: 2 MB, images only.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'avatars';

commit;
