-- Estimated daily cyclists per city (2026-09-14)
--
-- Goal: show a rider roughly how many people cycle in their city on a normal
-- day. There is no counter data in Romania (see
-- docs/research/bike-counter-availability-2026-09-14.md), so this cannot be a
-- measurement. It is a DERIVED ESTIMATE, of the kind transport planners
-- publish, and it is only defensible because every input is stored beside the
-- output and shown to the rider.
--
--   daily cyclists ≈ population × trips_per_person_per_day × modal_share ÷ 2
--
-- The ÷2 turns trips into people: a commuter makes a round trip, so counting
-- trips as cyclists would double the figure.
--
-- ⚠️ WHAT THIS IS NOT. Not a count, not our users, and not precise. It must be
-- labelled "estimated", carry its source, and be rounded hard enough that it
-- cannot imply accuracy it does not have. This is the honest version of
-- "show a big number"; a multiple of our own ride count is not.
--
-- ⚠️ THE MODAL SHARE IS THE WEAK INPUT, and it is weak in three ways at once:
--   * 3.4% is a figure for Romanian COUNTY SEATS COLLECTIVELY, not per city.
--   * It was measured 2015-2017 — nine years before this migration.
--   * Cycling in these cities has changed since, almost certainly upward, so
--     the estimate is more likely low than high. Erring low is the right
--     direction for a headline number.
-- Source: World Bank, "Analysis of urban mobility and transport in Romania"
-- (P171176), quoting SUMP modal splits: "only 3.4% of trips were related to
-- cycling". Arad reaches 8% and is the national outlier.
--
-- ⚠️ ONLY SEEDED FOR CITIES THE INPUT PLAUSIBLY DESCRIBES — county seats and
-- larger cities. A 15,000-person mountain town is not what a county-seat
-- average measures, so Râșnov gets no row; a rider there is shown the nearest
-- seeded city BY NAME instead, never their own town's name over someone else's
-- number.

create table if not exists public.city_cycling_estimates (
  id              text primary key,             -- 'ro:bucuresti'
  city            text not null,
  country_code    text not null,
  centre          geography(Point, 4326) not null,
  -- How far out this city's estimate is considered to describe. A rider inside
  -- it is shown this city.
  catchment_meters integer not null default 25000,

  population      integer not null,
  population_source text not null,
  population_year integer not null,

  -- Stored as a fraction (0.034 = 3.4%).
  modal_share     numeric not null,
  modal_share_source text not null,
  modal_share_year integer not null,

  -- Stored rather than hard-coded so the assumption is inspectable and can be
  -- revised per city without a code change. 2.5 is deliberately at the low end
  -- of the usual European urban range (~2.5-3.5).
  trips_per_person_per_day numeric not null default 2.5,

  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.city_cycling_estimates is
  'Inputs for the estimated-daily-cyclists figure. Every input is stored so the output can be audited and shown with its source. NOT a measurement — see migration 202609140010.';

alter table public.city_cycling_estimates enable row level security;
revoke all on public.city_cycling_estimates from anon, authenticated;

create index if not exists city_cycling_estimates_centre_gix
  on public.city_cycling_estimates using gist (centre);

-- ---------------------------------------------------------------------------
-- Lookup
-- ---------------------------------------------------------------------------
--
-- Returns the city whose catchment contains the rider, else the NEAREST seeded
-- city within p_max_distance_meters, named so the rider can see it is not
-- their own town. Null when nothing is close enough — a rider in a country we
-- have no figure for is told nothing rather than shown someone else's city as
-- if it were theirs.

create or replace function public.get_city_cycling_estimate(
  p_lat double precision,
  p_lon double precision,
  p_max_distance_meters double precision default 60000
)
returns jsonb
language sql
stable
as $fn$
  with pt as (select ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography g)
  select jsonb_build_object(
    'city',        c.city,
    -- Rounded to the nearest thousand below 100k and nearest 10k above, so the
    -- rendered figure never implies precision the inputs cannot support.
    'dailyCyclists', (
      case
        when raw.v >= 100000 then round(raw.v / 10000.0) * 10000
        else round(raw.v / 1000.0) * 1000
      end
    )::bigint,
    'isRiderCity', ST_DWithin(c.centre, pt.g, c.catchment_meters),
    'distanceMeters', round(ST_Distance(c.centre, pt.g))::int,
    -- Shipped to the client so the UI can cite it. An estimate whose source is
    -- not visible is indistinguishable from an invention.
    'modalSharePercent', round(c.modal_share * 100, 1),
    'modalShareSource',  c.modal_share_source,
    'modalShareYear',    c.modal_share_year,
    'population',        c.population
  )
  from city_cycling_estimates c, pt,
  lateral (
    select (c.population * c.trips_per_person_per_day * c.modal_share / 2.0) as v
  ) raw
  where c.enabled
    and ST_DWithin(c.centre, pt.g, p_max_distance_meters)
  order by ST_Distance(c.centre, pt.g)
  limit 1;
$fn$;

-- ---------------------------------------------------------------------------
-- Seed — Romanian county seats where riders actually are
-- ---------------------------------------------------------------------------
--
-- Populations: Romanian census 2021 (INS), municipality figures.
-- Modal share: the single national county-seat figure; per-city figures do not
-- exist in the source. Recorded identically on every row so nobody later reads
-- a repeated number as independent per-city measurement.

insert into public.city_cycling_estimates
  (id, city, country_code, centre, catchment_meters, population, population_source,
   population_year, modal_share, modal_share_source, modal_share_year)
values
  ('ro:bucuresti', 'București', 'RO',
   ST_SetSRID(ST_MakePoint(26.1025, 44.4268), 4326)::geography, 30000,
   1716983, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017),
  ('ro:cluj-napoca', 'Cluj-Napoca', 'RO',
   ST_SetSRID(ST_MakePoint(23.6236, 46.7712), 4326)::geography, 20000,
   286598, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017),
  ('ro:iasi', 'Iași', 'RO',
   ST_SetSRID(ST_MakePoint(27.6014, 47.1585), 4326)::geography, 20000,
   271692, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017),
  ('ro:constanta', 'Constanța', 'RO',
   ST_SetSRID(ST_MakePoint(28.6348, 44.1598), 4326)::geography, 20000,
   263688, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017),
  ('ro:timisoara', 'Timișoara', 'RO',
   ST_SetSRID(ST_MakePoint(21.2087, 45.7489), 4326)::geography, 20000,
   250849, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017),
  ('ro:brasov', 'Brașov', 'RO',
   ST_SetSRID(ST_MakePoint(25.6012, 45.6579), 4326)::geography, 20000,
   237589, 'Recensământ INS 2021', 2021,
   0.034, 'World Bank, Analysis of urban mobility and transport in Romania (SUMP modal splits 2015-2017)', 2017)
on conflict (id) do update
  set population = excluded.population,
      modal_share = excluded.modal_share,
      modal_share_source = excluded.modal_share_source,
      centre = excluded.centre;
