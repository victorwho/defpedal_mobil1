-- record_ride_microlives: recognise every bike-type label this app has ever
-- persisted, not just the two English spellings.
--
-- The RPC matched `p_bike_type IN ('E-bike', 'ebike')`. `trip_tracks.bike_type`
-- holds whatever the device stored at the time, and for most of this app's
-- history that was the LOCALIZED PICKER LABEL: 'Bicicletă electrică' (ro),
-- 'Bicicleta eléctrica' (es), plus 'electric' and lowercase spellings. Every
-- one of those fell through to 'acoustic', so an RO/ES e-bike rider was scored
-- with the acoustic multipliers — V_user 1.0 instead of 0.6 (too many
-- microlives) and V_com 1.0 instead of 0.85 (too many community seconds).
--
-- This is the server half of the bug `packages/core/src/bikeTypes.ts` was
-- written to end on the client; its header comment describes the same failure.
--
-- ⚠️ Keep `bike_type_to_vehicle` in step with `mapBikeTypeToVehicle` /
-- `legacyBikeTypeToId` in packages/core. Core's rule applies here too: do NOT
-- remove a label when a translation changes — old devices and old `trip_tracks`
-- rows still hold the previous wording.
--
-- ⚠️ This migration changes NO stored row. `ride_microlives` is written once
-- per trip (`ON CONFLICT (trip_id) DO NOTHING`) and its values are already
-- accumulated into `profiles.total_microlives` / `total_community_seconds` and
-- `community_seconds_daily`. Re-scoring history means unwinding all three and
-- lowering totals riders have already seen; that is a product decision, not a
-- schema fix, and is deliberately not done here.

-- ── The label → vehicle mapping, in ONE place ──
--
-- A previous copy of this logic was inlined in the calories backfill
-- (202607110001) with a third, different set of spellings. Call this function
-- instead of writing a fourth.
create or replace function public.bike_type_to_vehicle(p_bike_type text)
returns text
language sql
immutable
set search_path = public
as $$
  with k as (
    -- Mirrors core's `normalizeLabel`: lowercase, trim, fold the diacritics our
    -- RO/ES labels use. The fold is load-bearing, not decoration: Spanish
    -- 'eléctrica' does NOT contain the substring 'electr' (the é breaks it), so
    -- without this every Spanish e-bike rider is still scored as acoustic.
    -- Written as an explicit translate() rather than unaccent() so it needs no
    -- extension, exactly as core writes it out rather than using NFD.
    select translate(
             lower(btrim(coalesce(p_bike_type, ''))),
             'ăâáàîíșşțţéèóòúüñ',
             'aaaaiisstteeoouun'
           ) as key
  )
  select case
    -- Stable ids and every historical display label that means "e-bike".
    -- 'bicicleta electrica' is the folded form of BOTH 'Bicicletă electrică'
    -- (ro) and 'Bicicleta eléctrica' (es) — one entry serves both locales.
    when k.key in ('ebike', 'e-bike', 'electric', 'bicicleta electrica')
      then 'ebike'
    -- Core's last-resort sniff: the one category whose miscategorisation
    -- silently corrupts microlives and calories rather than just routing.
    when k.key like '%ebike%' or k.key like '%e-bike%' or k.key like '%electr%'
      then 'ebike'
    -- Unknown/NULL is 'acoustic', matching core's `mapBikeTypeToVehicle`,
    -- which maps an unrecognised label (legacyBikeTypeToId → null) to acoustic.
    else 'acoustic'
  end
  from k;
$$;

comment on function public.bike_type_to_vehicle(text) is
  'Map any historical bike-type label (en/ro/es) or stable id to the microlives vehicle category. Mirrors mapBikeTypeToVehicle in packages/core/src/bikeTypes.ts — change both together.';

-- ── The RPC, unchanged except for the vehicle mapping ──
--
-- ⚠️ CREATE OR REPLACE resets proconfig, so `SET search_path` MUST be restated
-- here or the SECURITY DEFINER hardening applied by 202604120001 is silently
-- dropped. Everything else below is byte-identical to the live definition.
create or replace function public.record_ride_microlives(
  p_trip_id UUID,
  p_user_id UUID,
  p_distance_meters NUMERIC,
  p_bike_type TEXT DEFAULT 'acoustic',
  p_european_aqi SMALLINT DEFAULT NULL,
  p_validated BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distance_km NUMERIC;
  v_vehicle TEXT;
  v_user_mult NUMERIC;
  v_com_mult NUMERIC;
  v_aqi_mult NUMERIC;
  v_personal NUMERIC;
  v_community NUMERIC;
  v_result JSONB;
BEGIN
  v_distance_km := p_distance_meters / 1000.0;

  -- Vehicle type mapping (see bike_type_to_vehicle above)
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

  -- Insert ride record
  INSERT INTO public.ride_microlives (
    trip_id, user_id, distance_km, bike_type, european_aqi,
    v_user, m_aqi, personal_microlives, community_seconds,
    validated
  ) VALUES (
    p_trip_id, p_user_id, v_distance_km, v_vehicle, p_european_aqi,
    v_user_mult, v_aqi_mult, v_personal, v_community,
    p_validated
  )
  ON CONFLICT (trip_id) DO NOTHING;

  -- Accumulate on profiles (only if validated)
  IF p_validated AND v_personal > 0 THEN
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

  v_result := jsonb_build_object(
    'personalMicrolives', v_personal,
    'communitySeconds', v_community,
    'distanceKm', v_distance_km,
    'vehicle', v_vehicle,
    'vUser', v_user_mult,
    'mAqi', v_aqi_mult,
    'validated', p_validated
  );

  RETURN v_result;
END;
$$;
