-- P1-5 · `record_ride_microlives` accumulated profile totals on every call.
--
-- The ride row insert is idempotent (`ON CONFLICT (trip_id) DO NOTHING`), but the
-- `profiles.total_microlives` / `total_community_seconds` update and the
-- `community_seconds_daily` upsert underneath it were NOT gated on whether that
-- insert actually happened. So any replay of POST /v1/trips/:id/impact — an
-- offline-queue retry, a delivered-then-timed-out request, a double submit — added
-- the same ride's microlives to the rider's lifetime totals again, permanently,
-- and visibly on the Impact Dashboard.
--
-- MEASURED LIVE before this migration (2026-09-26): 10 of 145 riders with rides
-- were over-counted, carrying 2,107.96 excess microlives against 715.65
-- legitimate ones and 23,737 excess community seconds. The signature is
-- unambiguous and is why this is replay rather than row deletion: three of those
-- riders hold a single stored ride row with a profile total at an EXACT integer
-- multiple of it — ratios 2.00, 3.00 and 4.00. Deleting rows can shrink the sum
-- but cannot leave the total an exact multiple of what survives.
--
-- Ruled out as alternative causes, rather than assumed away:
--   * `merge_anonymous_account` ASSIGNS the anonymous totals (`=`, not `+=`) and
--     re-parents `ride_microlives` in the same call, so it preserves the invariant.
--   * `trips` cascades to this table, so deletion CAN under-count the sum — but
--     `record_ride_impact`, which gates correctly, shows over-count on a nearly
--     DISJOINT set of riders (12, overlapping by 1). One shared cause would hit
--     both tables for the same rider; two mechanisms is what the data shows.
--
-- ⚠️ The insert is detected via `RETURNING id`, NOT `RETURNING trip_id`.
-- `ride_microlives.trip_id` is NULLABLE and its unique index is NULLS DISTINCT,
-- so a NULL-trip row inserts successfully while returning a NULL trip_id — which
-- a trip_id test would read as "already present" and silently stop accumulating
-- for a real new ride. `id` is NOT NULL, so it cannot lie in either direction.
-- (No NULL-trip rows exist today — 0 of 353 — but the column permits them.)
--
-- Also: a replay now REPORTS THE STORED ROW rather than recomputing from the
-- replayed request. The values could differ — `DO NOTHING` means the first write
-- wins, which is exactly why the bike-type fallback at `routes/v1.ts:3129` was
-- locked in permanently — so recomputing showed the rider a number that was not
-- the one in the database. `replayed` is returned so the caller and a live probe
-- can tell the two paths apart.
--
-- This migration does NOT repair the existing excess. Recomputing 10 riders'
-- visible lifetime totals downward is a product decision, not a schema fix; the
-- numbers above are recorded here so that decision can be made with them.

CREATE OR REPLACE FUNCTION public.record_ride_microlives(
  p_trip_id uuid,
  p_user_id uuid,
  p_distance_meters numeric,
  p_bike_type text DEFAULT 'acoustic'::text,
  p_european_aqi smallint DEFAULT NULL::smallint,
  p_validated boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_distance_km NUMERIC;
  v_vehicle TEXT;
  v_user_mult NUMERIC;
  v_com_mult NUMERIC;
  v_aqi_mult NUMERIC;
  v_personal NUMERIC;
  v_community NUMERIC;
  v_inserted_id UUID;
  v_stored public.ride_microlives;
BEGIN
  v_distance_km := p_distance_meters / 1000.0;

  -- Vehicle type mapping (see bike_type_to_vehicle)
  v_vehicle := public.bike_type_to_vehicle(p_bike_type);

  v_user_mult := CASE WHEN v_vehicle = 'ebike' THEN 0.6 ELSE 1.0 END;
  v_com_mult := CASE WHEN v_vehicle = 'ebike' THEN 0.85 ELSE 1.0 END;

  -- AQI multiplier (European AQI scale)
  v_aqi_mult := CASE
    WHEN p_european_aqi IS NULL THEN 1.0
    WHEN p_european_aqi <= 40 THEN 1.0          -- Good / Fair
    WHEN p_european_aqi <= 60 THEN 1.2          -- Moderate
    WHEN p_european_aqi <= 80 THEN 1.5          -- Poor (bonus for braving it)
    WHEN p_european_aqi <= 100 THEN 1.0         -- Very Poor (no bonus)
    ELSE 0                                       -- Hazardous (discourage riding)
  END;

  -- Calculate
  IF p_validated AND v_aqi_mult > 0 THEN
    v_personal := ROUND(0.4 * v_distance_km * v_user_mult * v_aqi_mult, 4);
    v_community := ROUND(4.5 * v_distance_km * v_com_mult, 4);
  ELSE
    v_personal := 0;
    v_community := 0;
  END IF;

  -- Insert ride record. `id` is the insert detector; see the header note.
  INSERT INTO public.ride_microlives (
    trip_id, user_id, distance_km, bike_type, european_aqi,
    v_user, m_aqi, personal_microlives, community_seconds,
    validated
  ) VALUES (
    p_trip_id, p_user_id, v_distance_km, v_vehicle, p_european_aqi,
    v_user_mult, v_aqi_mult, v_personal, v_community,
    p_validated
  )
  ON CONFLICT (trip_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- Accumulate ONLY for a ride recorded for the first time, and only if
  -- validated. A replay must leave every lifetime total untouched.
  IF v_inserted_id IS NOT NULL AND p_validated AND v_personal > 0 THEN
    UPDATE public.profiles
    SET
      total_microlives = total_microlives + v_personal,
      total_community_seconds = total_community_seconds + v_community
    WHERE id = p_user_id;

    -- Upsert community daily
    INSERT INTO public.community_seconds_daily (day, city, total_seconds, total_rides)
    VALUES (CURRENT_DATE, 'default', v_community, 1)
    ON CONFLICT (day, city)
    DO UPDATE SET
      total_seconds = community_seconds_daily.total_seconds + EXCLUDED.total_seconds,
      total_rides = community_seconds_daily.total_rides + 1;
  END IF;

  IF v_inserted_id IS NULL AND p_trip_id IS NOT NULL THEN
    -- Replay: report what is actually stored for this trip, not a recomputation
    -- of the replayed request, which `DO NOTHING` never persisted.
    SELECT * INTO v_stored
    FROM public.ride_microlives
    WHERE trip_id = p_trip_id;
  END IF;

  RETURN jsonb_build_object(
    'personalMicrolives', COALESCE(v_stored.personal_microlives, v_personal),
    'communitySeconds',   COALESCE(v_stored.community_seconds, v_community),
    'distanceKm',         COALESCE(v_stored.distance_km, v_distance_km),
    'vehicle',            COALESCE(v_stored.bike_type, v_vehicle),
    'vUser',              COALESCE(v_stored.v_user, v_user_mult),
    'mAqi',               COALESCE(v_stored.m_aqi, v_aqi_mult),
    'validated',          COALESCE(v_stored.validated, p_validated),
    'replayed',           v_inserted_id IS NULL
  );
END;
$function$;
