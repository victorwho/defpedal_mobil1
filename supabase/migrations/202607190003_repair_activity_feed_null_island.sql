-- Repair activity_feed "Null Island" locations (2026-07-19)
--
-- Root cause (error-log #70 family): the v1 ride-end auto-publish block
-- read `trips.start_location.latitude ?? .lat ?? 0` — but PostgREST
-- returns geography columns as WKB hex strings, so every published ride
-- got location = POINT(0 0). 112 ride rows (+3 hazard batches) sat at
-- Null Island, and migration 202607190002's badge/tier backfill then
-- copied that artifact onto 165 badge/tier rows.
--
-- The code fix (parseGeographyPoint in the v1 publish path +
-- toPointWktOrNull rejecting 0/0 in autoPublish) stops new artifacts;
-- this migration repairs the existing rows from their REAL trip data:
--
--   1. rides: re-derive location from the parent trips.start_location
--      (via payload->>tripId)
--   2. hazard batches: copy the (now repaired) parent ride's location
--   3. badge/tier rows at 0,0 or still NULL: re-run the consent-gated
--      backfill against non-zero ride locations
--   4. anything still at 0,0: location = NULL (honest "unknown" →
--      follower-only in get_ranked_feed) — never a fabricated position.

-- 1. Rides: real start coordinate from the parent trip
update activity_feed af
set location = t.start_location
from trips t
where af.type = 'ride'
  and af.location is not null
  and ST_Equals(af.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326))
  and af.payload->>'tripId' is not null
  and t.id::text = af.payload->>'tripId'
  and t.start_location is not null
  and not ST_Equals(t.start_location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326));

-- 2. Hazard batches: inherit the repaired parent ride location
update activity_feed af
set location = ride.location
from activity_feed ride
where af.type = 'hazard_batch'
  and af.location is not null
  and ST_Equals(af.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326))
  and af.payload->>'rideActivityId' is not null
  and ride.id::text = af.payload->>'rideActivityId'
  and ride.location is not null
  and not ST_Equals(ride.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326));

-- 3a. Badge/tier rows that were backfilled with the 0,0 artifact:
--     re-derive from the user's latest REAL (non-zero) ride location.
--     The subquery may yield NULL — that is the correct follower-only
--     outcome when the user has no genuinely located ride.
update activity_feed af
set location = (
  select af2.location
  from activity_feed af2
  where af2.user_id = af.user_id
    and af2.type = 'ride'
    and af2.location is not null
    and not ST_Equals(af2.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326))
  order by af2.created_at desc
  limit 1
)
where af.type in ('badge_unlock', 'tier_up')
  and af.location is not null
  and ST_Equals(af.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326));

-- 3b. Badge/tier rows left NULL by 202607190002 because the user's only
--     "located" rides were 0,0 — those rides may now be repaired, so run
--     the same consent-gated backfill once more with the 0,0 exclusion.
update activity_feed af
set location = (
  select af2.location
  from activity_feed af2
  where af2.user_id = af.user_id
    and af2.type = 'ride'
    and af2.location is not null
    and not ST_Equals(af2.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326))
  order by af2.created_at desc
  limit 1
)
where af.type in ('badge_unlock', 'tier_up')
  and af.location is null
  and exists (
    select 1 from profiles p
    where p.id = af.user_id and p.auto_share_rides = true
  )
  and exists (
    select 1 from activity_feed af3
    where af3.user_id = af.user_id
      and af3.type = 'ride'
      and af3.location is not null
      and not ST_Equals(af3.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326))
  );

-- 4. Catch-all: anything still at Null Island becomes NULL (unknown)
update activity_feed af
set location = null
where af.location is not null
  and ST_Equals(af.location::geometry, ST_SetSRID(ST_MakePoint(0, 0), 4326));
