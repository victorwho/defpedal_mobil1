-- record_ride_impact reconcile + ownership guard (audit 2026-07-05 INFRA-2).
--
-- Drift found (pg_get_functiondef, 2026-07-07): THREE live overloads existed —
-- the 3-param legacy from repo migration 202604030001 (plain INSERT, no
-- upsert, double-counts profile totals on retry), a 10-param upsert, and the
-- 11-param upsert (+p_calories_burned) that the API actually calls. Only the
-- 3-param version was in the repo. This migration:
--   1. Drops the two stale overloads (nothing calls them — the API always
--      passes all 11 named params, which resolves uniquely; stale overloads
--      are a PostgREST ambiguity hazard and a drift trap).
--   2. Re-creates the 11-param version byte-equivalent to live PLUS a trip
--      ownership guard: the API handler never verified that :tripId belongs
--      to the caller, and neither did the function — a user could write a
--      ride_impacts row referencing another user's trip (data-integrity
--      pollution, not privilege escalation; own user_id is used throughout).
--      Raises 'TRIP_NOT_OWNED'; the API maps it to 403.
-- Repo and live definitions now match again.

drop function if exists public.record_ride_impact(uuid, uuid, numeric);
drop function if exists public.record_ride_impact(
  uuid, uuid, numeric, numeric, text, numeric, numeric, text, integer, numeric);

create or replace function public.record_ride_impact(
  p_trip_id uuid,
  p_user_id uuid,
  p_distance_meters numeric,
  p_elevation_gain_m numeric default 0,
  p_weather_condition text default null::text,
  p_wind_speed_kmh numeric default null::numeric,
  p_temperature_c numeric default null::numeric,
  p_aqi_level text default null::text,
  p_ride_start_hour integer default null::integer,
  p_duration_minutes numeric default 0,
  p_calories_burned numeric default 0
)
returns ride_impacts
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_co2_kg     numeric;
  v_money_eur  numeric;
  v_result     ride_impacts;
  v_is_insert  boolean;
begin
  -- Ownership guard (audit INFRA-2): the trip must exist and belong to the
  -- caller. trips.user_id can be null after account deletion — that also
  -- (correctly) refuses.
  if not exists (
    select 1 from trips t where t.id = p_trip_id and t.user_id = p_user_id
  ) then
    raise exception 'TRIP_NOT_OWNED';
  end if;

  v_co2_kg    := p_distance_meters / 1000.0 * 0.12;
  v_money_eur := p_distance_meters / 1000.0 * 0.35;

  select exists(select 1 from ride_impacts where trip_id = p_trip_id)
  into v_is_insert;
  v_is_insert := not v_is_insert;

  insert into ride_impacts (
    trip_id, user_id, co2_saved_kg, money_saved_eur, distance_meters,
    elevation_gain_m, weather_condition, wind_speed_kmh, temperature_c,
    aqi_level, ride_start_hour, duration_minutes, calories_burned
  )
  values (
    p_trip_id, p_user_id, v_co2_kg, v_money_eur, p_distance_meters,
    coalesce(p_elevation_gain_m, 0), p_weather_condition, p_wind_speed_kmh,
    p_temperature_c, p_aqi_level, p_ride_start_hour,
    coalesce(p_duration_minutes, 0), coalesce(p_calories_burned, 0)
  )
  on conflict (trip_id) do update set
    co2_saved_kg      = excluded.co2_saved_kg,
    money_saved_eur   = excluded.money_saved_eur,
    distance_meters   = excluded.distance_meters,
    elevation_gain_m  = excluded.elevation_gain_m,
    weather_condition = excluded.weather_condition,
    wind_speed_kmh    = excluded.wind_speed_kmh,
    temperature_c     = excluded.temperature_c,
    aqi_level         = excluded.aqi_level,
    ride_start_hour   = excluded.ride_start_hour,
    duration_minutes  = excluded.duration_minutes,
    calories_burned   = excluded.calories_burned
  returning * into v_result;

  if v_is_insert then
    update profiles set
      total_co2_saved_kg    = total_co2_saved_kg    + v_co2_kg,
      total_money_saved_eur = total_money_saved_eur + v_money_eur
    where id = p_user_id;
  end if;

  return v_result;
end;
$$;
