-- Adaptive ETA, Phase 3 (docs/plans/adaptive-eta.md).
--
-- Two facts recorded at ride START so a rider's pace can be calibrated
-- against the router and kept per bike:
--
--   planned_route_duration_seconds  the router's predicted ride time for the
--                                   route the rider set out on. Lets the app
--                                   compare actual time with predicted time.
--   is_ebike                        whether E-bike was selected when the ride
--                                   started. Lets the app keep a separate pace
--                                   per bike.
--
-- Both NULLABLE with NO DEFAULT, on purpose: NULL means "not recorded" (a
-- ride before this migration, or an older client). A default would turn
-- "unknown" into a false fact, the same trap as trip_tracks.reroute_count.
-- No backfill is possible: neither value was stored anywhere before.
--
-- Client access: none. trips has no client policies or grants since the
-- 2026-10-15 lockdown; the API writes and reads on the service role.

alter table public.trips
  add column if not exists planned_route_duration_seconds integer
    check (planned_route_duration_seconds is null or planned_route_duration_seconds >= 0),
  add column if not exists is_ebike boolean;

comment on column public.trips.planned_route_duration_seconds is
  'Router-predicted ride time (s) for the route at ride start. NULL = not recorded.';
comment on column public.trips.is_ebike is
  'E-bike selected at ride start. NULL = not recorded (pre-2026-10-21 or older client).';
