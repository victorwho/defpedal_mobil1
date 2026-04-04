-- Phase 0 + 1: Microlives data foundation
-- Adds bike_type and aqi_at_start to trip_tracks,
-- creates ride_microlives table, community_seconds_daily,
-- extends profiles with microlives totals,
-- and creates the record_ride_microlives RPC.

-- ── Phase 0: Extend trip_tracks ──

ALTER TABLE public.trip_tracks
  ADD COLUMN IF NOT EXISTS bike_type TEXT DEFAULT 'acoustic',
  ADD COLUMN IF NOT EXISTS aqi_at_start SMALLINT;

-- ── Phase 1: Microlives tables ──

CREATE TABLE IF NOT EXISTS public.ride_microlives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  distance_km NUMERIC NOT NULL,
  bike_type TEXT NOT NULL DEFAULT 'acoustic',
  european_aqi SMALLINT,
  v_user NUMERIC NOT NULL DEFAULT 1.0,
  m_aqi NUMERIC NOT NULL DEFAULT 1.0,
  personal_microlives NUMERIC NOT NULL DEFAULT 0,
  community_seconds NUMERIC NOT NULL DEFAULT 0,
  validated BOOLEAN NOT NULL DEFAULT true,
  validation_flags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_microlives_user
  ON public.ride_microlives (user_id, created_at DESC);

ALTER TABLE public.ride_microlives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own microlives"
  ON public.ride_microlives FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access to ride_microlives"
  ON public.ride_microlives FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Community daily aggregation
CREATE TABLE IF NOT EXISTS public.community_seconds_daily (
  day DATE NOT NULL,
  city TEXT NOT NULL DEFAULT 'default',
  total_seconds NUMERIC NOT NULL DEFAULT 0,
  total_rides INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, city)
);

ALTER TABLE public.community_seconds_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read community seconds"
  ON public.community_seconds_daily FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role full access to community_seconds_daily"
  ON public.community_seconds_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Extend profiles with microlives totals
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_microlives NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_community_seconds NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS microlife_tier TEXT NOT NULL DEFAULT 'pedaler';

-- ── RPC: record_ride_microlives ──

CREATE OR REPLACE FUNCTION public.record_ride_microlives(
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

  -- Vehicle type mapping
  v_vehicle := CASE
    WHEN p_bike_type IN ('E-bike', 'ebike') THEN 'ebike'
    ELSE 'acoustic'
  END;

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
