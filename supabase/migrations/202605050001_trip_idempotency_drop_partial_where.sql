-- ---------------------------------------------------------------------------
-- 202605050001 — Drop partial WHERE on trips_user_client_trip_id_unique
-- ---------------------------------------------------------------------------
--
-- Migration 202604270002 created a PARTIAL unique index:
--   CREATE UNIQUE INDEX trips_user_client_trip_id_unique
--     ON public.trips (user_id, client_trip_id)
--     WHERE (client_trip_id IS NOT NULL)
--
-- The mobile-api route /v1/trips/start uses Supabase's
--   .upsert(...rows, { onConflict: 'user_id,client_trip_id' })
-- which PostgREST translates to bare:
--   ON CONFLICT (user_id, client_trip_id) DO UPDATE ...
--
-- PostgreSQL rejects this with `42P10: there is no unique or exclusion
-- constraint matching the ON CONFLICT specification` because partial unique
-- indexes require an explicit WHERE in the conflict target. PostgREST's
-- onConflict parameter doesn't support a WHERE clause — it only takes a
-- comma-separated column list. So every trip_start has been failing with a
-- 502 UPSTREAM_ERROR since the partial index landed on 2026-04-27. The
-- mobile offline queue retried 5x then cascade-killed the dependent
-- trip_end / trip_track, so users saw zero trips recorded.
--
-- Fix: drop the partial index and recreate without the WHERE clause.
-- PostgreSQL treats NULL values as distinct in unique indexes by default,
-- so legacy rows with NULL client_trip_id remain valid (multiple NULLs
-- allowed). The semantic of the index — "uniqueness on (user_id,
-- client_trip_id) when client_trip_id is set" — is preserved verbatim.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.trips_user_client_trip_id_unique;

CREATE UNIQUE INDEX trips_user_client_trip_id_unique
  ON public.trips (user_id, client_trip_id);
