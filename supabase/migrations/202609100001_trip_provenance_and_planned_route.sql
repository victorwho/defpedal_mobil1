-- Two independent gaps found while investigating "most trips are not being
-- recorded" (2026-09-10). Neither is a tracking bug — the upload path is
-- healthy (96 of 97 SAVED rides in Aug-Sep carry a trip_tracks row). Both are
-- about being able to SEE what happened.

-- ---------------------------------------------------------------------------
-- 1. Which build wrote the row
-- ---------------------------------------------------------------------------
-- Preview, development and store installs are indistinguishable in every
-- number on the dashboard, so a developer's own test rides are counted beside
-- riders'. `push_tokens.platform` was the only provenance of any kind, and it
-- covers 250 of 446 trip users since June (56%) and is consent-gated for
-- anonymous riders, so it is both partial and biased.
--
-- Written to `profiles` rather than `push_tokens` for that coverage reason,
-- and synced by ProfileDeviceSyncManager, which already runs at every session
-- bootstrap. NOTE THE LIMITATION: this is the LAST build a user ran, not the
-- build that wrote a given row. It answers "is this user a tester?", which is
-- the question the dashboard needs. Per-row attribution would need the same
-- columns on `trips`; deliberately not done here.
--
-- No DEFAULT on any of these: absent must stay distinguishable from a real
-- value, or every pre-existing row silently claims to be a production install.
alter table public.profiles add column if not exists app_environment text;
alter table public.profiles add column if not exists app_version text;
alter table public.profiles add column if not exists app_platform text;

comment on column public.profiles.app_environment is
  'Last app build variant seen for this user: development | preview | production. NULL = never synced (pre-2026-09-10 client). Set by ProfileDeviceSyncManager at session bootstrap.';
comment on column public.profiles.app_version is
  'Last app versionName seen for this user, e.g. 0.2.159. NULL = never synced.';
comment on column public.profiles.app_platform is
  'Last OS seen for this user: ios | android. NULL = never synced.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_app_environment_check'
  ) then
    alter table public.profiles
      add constraint profiles_app_environment_check
      check (app_environment is null or app_environment in ('development','preview','production'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_app_platform_check'
  ) then
    alter table public.profiles
      add constraint profiles_app_platform_check
      check (app_platform is null or app_platform in ('ios','android','web'));
  end if;
end $$;

-- Dashboards filter on it, and it is low-cardinality; partial index keeps the
-- never-synced majority out of the index entirely.
create index if not exists profiles_app_environment_idx
  on public.profiles (app_environment)
  where app_environment is not null;

-- ---------------------------------------------------------------------------
-- 2. The planned route survives a failed track upload
-- ---------------------------------------------------------------------------
-- `planned_route_polyline6` lived ONLY on `trip_tracks`, which is written at
-- ride END. If that upload never lands — the rider discards, churns mid-ride,
-- or the queue dies with the process — the route the rider actually planned is
-- gone, even though the geometry existed the moment they pressed Start.
-- Writing it at trip_start means a trip row alone can still draw the map.
--
-- Nullable and no default: an old client sends nothing, and a trip started
-- before this shipped genuinely has no planned route recorded.
alter table public.trips add column if not exists planned_route_polyline6 text;
alter table public.trips add column if not exists planned_route_distance_meters real;
alter table public.trips add column if not exists routing_mode text;

comment on column public.trips.planned_route_polyline6 is
  'Planned route geometry (polyline6) captured at trip START, so a failed trip_tracks upload no longer erases the route. trip_tracks keeps its own copy; that one is authoritative when present.';
comment on column public.trips.planned_route_distance_meters is
  'Planned route distance at trip START. Distinct from trips.distance_meters, which callers have used inconsistently.';
comment on column public.trips.routing_mode is
  'Routing profile the ride was started with: safe | fast | flat | course | generated_loop. NULL = old client.';
