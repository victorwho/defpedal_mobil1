-- Keep community ride counts when an account is deleted (2026-09-14)
--
-- The problem: `trips_user_id_fkey` is ON DELETE CASCADE, so every account
-- deletion silently and permanently removed that rider's entire ride history
-- from every community number. There is no deletion audit table and no
-- soft-delete column, so the rides that have already gone are unrecoverable and
-- their number is unknowable. City Heartbeat's "1420 rides all time" is
-- therefore a floor, not a total.
--
-- ⚠️ THE OBVIOUS FIX IS WRONG. Flipping the FK to ON DELETE SET NULL keeps the
-- row but keeps EVERYTHING ELSE ON IT, and `trips` is far from anonymous once
-- the user id is gone:
--
--     start_location_text     free text, in practice a street address
--     destination_text        free text
--     start_location          precise point (~1 m)
--     destination_location    precise point
--     planned_route_polyline6 the full route line
--     early_end_reason_note   free text, up to 280 chars, rider-written
--     started_at / ended_at   to the second
--
-- A row reading "a ride from Strada Pandurii 2, Rasnov to Brasov at 09:37 on
-- 14 Sep" is still personal data with or without a user id, so SET NULL alone
-- would convert an erasure into a retention — the opposite of what the rider
-- asked for. GDPR Art 17 is not satisfied by dropping the foreign key.
--
-- What this does instead: a BEFORE DELETE trigger on auth.users ANONYMISES the
-- rider's trips, so by the time the delete lands there is nothing left to
-- identify. What survives is what a count needs and nothing more — a coarse
-- location, a date, and the ride's own shape (distance, mode, outcome).
-- Anonymous statistical data falls outside GDPR entirely (Recital 26), which is
-- the whole basis for keeping it.
--
-- ⚠️ THE FK DELIBERATELY STAYS `CASCADE`, and that is not an oversight.
-- It is the fail-safe, and its direction matters: if this trigger is ever
-- dropped or disabled, CASCADE resumes DELETING the rides — lossy, but private.
-- Had the FK been switched to SET NULL, the same failure would instead leave
-- un-scrubbed addresses and route lines behind forever. When the two failure
-- modes are "lose counts" and "retain personal data after an erasure request",
-- the safe default is to lose counts. The trigger is what buys the counts back;
-- the FK is what happens when the trigger isn't there.
--
-- Everything else still cascades away untouched: trip_tracks (the raw GPS
-- breadcrumb trail), trip_shares, activity_feed, ride_microlives. Only the
-- lifecycle row survives, stripped.

create or replace function public.anonymise_trips_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.trips
  set
    -- Sever the link first: this also means the FK below matches nothing, so
    -- CASCADE becomes a no-op for these rows rather than deleting them.
    user_id                       = null,

    -- Free text the rider or the geocoder wrote. The likeliest home address in
    -- the whole schema; there is no safe way to keep either.
    start_location_text           = null,
    destination_text              = null,
    early_end_reason_note         = null,

    -- Where they were GOING, and the line between. Neither is needed to count a
    -- ride, and a route line is close to a signature.
    destination_location          = null,
    planned_route_polyline6       = null,
    planned_route_distance_meters = null,

    -- Links back to a device-side identifier.
    client_trip_id                = null,

    -- Coarsen the origin to ~1.1 km (2 dp). The heartbeat filters at 15 km and
    -- 100 km radii, so this costs the count nothing, while a metre-accurate
    -- start point repeated each morning is exactly how an anonymous row stops
    -- being anonymous.
    start_location = case
      when start_location is null then null
      else ST_SetSRID(
             ST_MakePoint(
               round(ST_X(start_location::geometry)::numeric, 2)::double precision,
               round(ST_Y(start_location::geometry)::numeric, 2)::double precision
             ), 4326)::geography
    end,

    -- Day precision. The RPC casts to ::date anyway, so windowing is unchanged;
    -- a to-the-second timestamp plus a coarse location is still a pattern.
    -- ended_at is kept (not nulled) so the stale-trip reaper does not mistake
    -- these for rides still in progress and start stamping them 'abandoned'.
    started_at                    = date_trunc('day', started_at),
    ended_at                      = date_trunc('day', ended_at)
  where user_id = old.id;

  return old;
end;
$fn$;

comment on function public.anonymise_trips_on_user_delete() is
  'Strips identifying detail from a deleted account''s trips so community ride counts survive the erasure. See migration 202609140005 — the trips FK stays CASCADE on purpose, as the fail-safe if this trigger is ever removed.';

drop trigger if exists anonymise_trips_before_user_delete on auth.users;

create trigger anonymise_trips_before_user_delete
  before delete on auth.users
  for each row
  execute function public.anonymise_trips_on_user_delete();
