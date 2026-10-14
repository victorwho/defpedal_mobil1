-- Security lockdown, Batch A (2026-10-14).
--
-- An external probe with the public anon key, plus a four-agent review of the
-- live catalog, found client-reachable write paths that no client uses: every
-- rider-facing read and write goes through mobile-api on the service-role key,
-- which bypasses RLS. Supabase anonymous sign-in makes `authenticated` free for
-- anyone, so "own rows only" is not a trust boundary here.
--
-- This batch closes the holes that nothing legitimate depends on:
--   1. profiles UPDATE   — any anonymous session could PATCH its own row:
--                          total_xp, rider_tier, premium_ui_enabled (paywall).
--   2. RLS-off backups   — 7 iasi_* tables (raw risk_score / risk_factors) were
--                          readable, insertable and deletable by anon. Moved to
--                          a schema PostgREST does not expose; NOT dropped,
--                          because OSRM_Server lists them as its rollback.
--   3. WITH CHECK (true) — three "service role" insert policies were granted to
--                          PUBLIC, so the bare anon key could forge rows.
--   4. user_id IS NULL   — hazards / navigation_feedback accepted anon inserts
--                          with a NULL user_id, indistinguishable from imports.
--   5. TRUNCATE etc.     — Supabase default ACL grants; TRUNCATE ignores RLS.
--
-- Batch B (broad INSERT/UPDATE/DELETE revoke, hazards/trip_shares reads) and
-- Batch C (default privileges) follow after a soak. The pre-change policies and
-- grants are snapshotted below; rollback SQL is generated from that snapshot.

begin;

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

-- Rollback source of truth.
create table archive.lockdown_snapshot_20261014_policies as
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies where schemaname = 'public';
create table archive.lockdown_snapshot_20261014_grants as
  select table_schema, table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated');

-- 1. profiles: clients never write it directly.
revoke update on public.profiles from anon, authenticated;

-- 2. RLS-off backup tables out of the exposed schema (spatial_ref_sys is PostGIS, stays).
alter table public.iasi_lane_cancel_backup_20260926      set schema archive;
alter table public.iasi_phantom_cycleway_backup_20260926 set schema archive;
alter table public.iasi_v2_strip_backup_20260927         set schema archive;
alter table public.iasi_v2_phantom_backup_20260927       set schema archive;
alter table public.iasi_bahlui_footway_backup_20260928   set schema archive;
alter table public.iasi_bank_bikeway_backup_20260928     set schema archive;
alter table public.iasi_stefan_ped_backup_20260928       set schema archive;

-- 3. "Service role" insert policies that were actually granted to PUBLIC.
--    service_role bypasses RLS and never needed them.
drop policy "Service role inserts snapshots"       on public.leaderboard_snapshots;
drop policy mia_detection_signals_insert_service   on public.mia_detection_signals;
drop policy mia_journey_events_insert_service      on public.mia_journey_events;

-- 4. No client-forged NULL-owner rows (imports are written by service_role).
alter policy "Authenticated users can insert own hazards" on public.hazards
  with check (user_id = auth.uid());
-- navigation_feedback_insert_own (auth.uid() = user_id) remains.
drop policy "Authenticated users can insert own feedback" on public.navigation_feedback;

-- 5. Privileges no client path ever needs.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

commit;
