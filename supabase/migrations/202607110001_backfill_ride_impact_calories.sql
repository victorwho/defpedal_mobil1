-- Backfill ride_impacts.calories_burned for historical rides stored as 0/null.
--
-- Context: calories_burned was added by 202606290001. Every existing
-- ride_impacts row is 0/null (the live Play production app predates the
-- calories client code, so no client had sent a value). The GET
-- /v1/rides/:tripId/impact auto-compute path also stored 0 until the
-- duration fix (commit a2de0ce). This one-time pass recomputes calories
-- from each trip's real duration + distance using the same model as
-- packages/core/src/calories.ts:
--     kcal = MET x weight_kg x duration_hours
--   MET (Ainsworth 2011 Compendium; e-bike 2024 update):
--     e-bike -> 4.9; else by average speed: <16 -> 4.0, <22 -> 6.8,
--     <26 -> 8.0, >=26 -> 10.0.
--   weight_kg = 70 (DEFAULT_RIDER_WEIGHT_KG; body weight is not stored
--   server-side, so the default is used — same as the live auto path).
--
-- Only plausible rides are touched: duration 60s-8h AND average speed
-- 3-60 km/h. Sub-minute / corrupt-timestamp rides (near-zero or absurd
-- speeds up to ~15000 km/h in the live data) are left at 0 so the client
-- keeps hiding the calorie block for them rather than surfacing garbage.
-- Idempotent: guarded on calories_burned being 0/null, so re-running is a
-- no-op for rows already backfilled.

update ride_impacts ri
set calories_burned = c.kcal
from (
  select
    ri2.trip_id,
    round(
      (case
         when lower(coalesce(tt.bike_type, '')) in ('ebike', 'electric')
              or lower(coalesce(tt.bike_type, '')) like '%e-bike%' then 4.9
         when (v.dist_m * 3.6 / v.dur_s) < 16 then 4.0
         when (v.dist_m * 3.6 / v.dur_s) < 22 then 6.8
         when (v.dist_m * 3.6 / v.dur_s) < 26 then 8.0
         else 10.0
       end) * 70.0 * (v.dur_s / 3600.0)
    ) as kcal
  from ride_impacts ri2
  join trip_tracks tt on tt.trip_id = ri2.trip_id
  cross join lateral (
    select
      extract(epoch from (tt.ended_at - tt.started_at))::numeric as dur_s,
      coalesce(ri2.distance_meters, tt.actual_distance_meters,
               tt.planned_route_distance_meters, 0)::numeric as dist_m
  ) v
  where (ri2.calories_burned is null or ri2.calories_burned = 0)
    and tt.started_at is not null
    and tt.ended_at is not null
    and tt.ended_at > tt.started_at
    and v.dur_s between 60 and 28800
    and v.dist_m > 0
    and (v.dist_m * 3.6 / v.dur_s) between 3 and 60
) c
where ri.trip_id = c.trip_id
  and (ri.calories_burned is null or ri.calories_burned = 0)
  and c.kcal > 0;
