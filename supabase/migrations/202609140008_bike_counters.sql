-- Municipal bike-counter ingestion (2026-09-14)
--
-- Why: every "people cycling" number the app can show from its own data is
-- honestly small — 822 signed-up cyclists, 552 who have ridden. Municipal cycle
-- counters are the one source of a genuinely large figure that is still a real
-- count of real people on bicycles. Paris alone measured **1,929,105 cyclists
-- across 108 counters in seven days** (verified live 2026-09-14; see
-- docs/research/bike-counter-availability-2026-09-14.md).
--
-- ⚠️ THIS IS NOT OUR ACTIVITY, and the schema is shaped to keep that true.
-- It must never be summed with rides, folded into the community card, or
-- phrased so a rider could read it as app usage. The UI labels it as Europe,
-- never as "near you" — which is also the honest framing for a second reason:
-- Romania publishes NO cyclist counters at all (data.gov.ro returns one hit for
-- "biciclete" and it is bike-share dock locations with no counts), and
-- essentially all our riders are Romanian. A per-city treatment would be dark
-- for almost every rider we have.
--
-- Registry + readings, mirroring hazard_import_sources: adding a city is an
-- INSERT, not new code — as long as an adapter for its platform exists.

create table if not exists public.bike_counter_sources (
  id            text primary key,                    -- 'paris:opendata'
  city          text not null,
  country_code  text not null,                       -- ISO-3166-1 alpha-2
  -- Which fetcher handles it. 'opendatasoft' covers Paris and the many other
  -- Opendatasoft portals; 'ecovisio' is Eco-Counter's shared platform, which
  -- backs counters in dozens of European cities — one adapter, many cities.
  adapter       text not null,
  config        jsonb not null default '{}'::jsonb,
  enabled       boolean not null default false,
  -- ⚠️ Record the real licence, or record honestly that it is unverified.
  -- hazard_import_sources carries 'UNCONFIRMED-OWNER-OVERRIDE-2026-08-27' for
  -- Amsterdam precisely so nobody later mistakes it for settled. Same rule.
  licence       text,
  last_fetched_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

comment on table public.bike_counter_sources is
  'Municipal cycle-counter sources. Adding a city is an INSERT when an adapter for its platform already exists (migration 202609140008).';

create table if not exists public.bike_counter_readings (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references public.bike_counter_sources(id) on delete cascade,
  -- Length of the window the count covers, so a source reporting a different
  -- period can never be silently added to one reporting seven days.
  window_days   integer not null,
  cyclists_counted bigint not null,
  counter_count integer,
  fetched_at    timestamptz not null default now()
);

comment on table public.bike_counter_readings is
  'One row per source per successful fetch. History is kept so the aggregate is recomputable and a source going quiet is visible rather than silently shrinking the total.';

-- Service-role only, like planned_routes: the app never reads these directly,
-- only the aggregate through the heartbeat RPC.
alter table public.bike_counter_sources  enable row level security;
alter table public.bike_counter_readings enable row level security;
revoke all on public.bike_counter_sources  from anon, authenticated;
revoke all on public.bike_counter_readings from anon, authenticated;

create index if not exists bike_counter_readings_source_idx
  on public.bike_counter_readings (source_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- Aggregate
-- ---------------------------------------------------------------------------
--
-- ⚠️ The failure mode this function exists to avoid: with several sources, one
-- of them failing would drop the headline by its share and look like cycling
-- collapsed overnight. So the aggregate uses each source's LAST GOOD reading
-- within a grace window rather than only today's, and reports how many sources
-- are actually contributing — a number that can be watched, unlike a total that
-- quietly sags.
--
-- Sources stale beyond the grace window are dropped rather than counted
-- forever: a counter that has been dead a fortnight is not measuring anyone.

create or replace function public.get_bike_counter_totals(
  p_window_days integer default 7,
  p_grace_days  integer default 14
)
returns jsonb
language sql
stable
as $fn$
  with latest as (
    select distinct on (r.source_id)
      r.source_id, r.cyclists_counted, r.counter_count, r.fetched_at, s.city
    from bike_counter_readings r
    join bike_counter_sources s on s.id = r.source_id
    where s.enabled = true
      and r.window_days = p_window_days
      and r.fetched_at > now() - make_interval(days => p_grace_days)
    order by r.source_id, r.fetched_at desc
  )
  select jsonb_build_object(
    'cyclistsCounted', coalesce(sum(cyclists_counted), 0)::bigint,
    'windowDays',      p_window_days,
    'cities',          count(*)::int,
    'counters',        coalesce(sum(counter_count), 0)::int,
    -- Oldest contributing reading: if this drifts, a source has gone quiet and
    -- the headline is coasting on stale data.
    'oldestFetchedAt', min(fetched_at)
  )
  from latest;
$fn$;

-- ---------------------------------------------------------------------------
-- Seed: Paris
-- ---------------------------------------------------------------------------
--
-- Enabled on day one because it was verified end-to-end by live request, not
-- read off a portal description: no auth, aggregation pushed server-side so one
-- call returns the headline, hourly data over 13 rolling months updated daily.
--
-- Licence: Paris Open Data is ODbL, stated on the portal. Attribution is
-- satisfied by the UI naming the source.

insert into public.bike_counter_sources (id, city, country_code, adapter, config, enabled, licence)
values (
  'paris:opendata', 'Paris', 'FR', 'opendatasoft',
  jsonb_build_object(
    'baseUrl', 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets',
    'dataset', 'comptage-velo-donnees-compteurs',
    'countField', 'sum_counts',
    'dateField', 'date',
    'counterField', 'nom_compteur'
  ),
  true,
  'ODbL — Paris Open Data'
)
on conflict (id) do update
  set config = excluded.config,
      adapter = excluded.adapter,
      licence = excluded.licence;

-- Cologne, via Eco-Counter's shared platform. DISABLED: the host answers but
-- the organisation id has to be harvested before this is real — a guessed one
-- returned 404. Seeded so widening is a flag flip plus an id, and so the next
-- person can see the intended shape rather than rediscovering the API.
insert into public.bike_counter_sources (id, city, country_code, adapter, config, enabled, licence)
values (
  'koln:ecovisio', 'Köln', 'DE', 'ecovisio',
  jsonb_build_object(
    'baseUrl', 'https://www.eco-visio.net/api/aladdin/1.0.0/pbl',
    'idOrganisme', null
  ),
  false,
  'UNVERIFIED — confirm before enabling'
)
on conflict (id) do nothing;
