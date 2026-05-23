-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-23: Create `city_suggestions` table.
--
-- Private, location-tagged free-text feedback from riders to the dev team.
-- Stored independently from `hazards` because:
--   (a) hazards have type-based TTL + community voting; suggestions never
--       expire and don't have a vote concept
--   (b) hazards are surfaced during navigation; suggestions are explicitly
--       NOT (user requirement, see docs/plans/city-suggestions.md)
--   (c) hazards are a community surface; suggestions are a private channel
--       to the dev team
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.city_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location geography(Point, 4326) not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  body text not null check (char_length(body) between 1 and 500),
  source text not null check (source in ('route_preview')),
  client_submitted_at timestamptz,
  locality text,
  route_context jsonb,
  status text not null default 'open'
    check (status in ('open','triaged','resolved','rejected')),
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_city_suggestions_created_at_desc
  on public.city_suggestions (created_at desc);

create index if not exists idx_city_suggestions_location_gist
  on public.city_suggestions using gist (location);

create index if not exists idx_city_suggestions_user_created
  on public.city_suggestions (user_id, created_at desc);

alter table public.city_suggestions enable row level security;

-- INSERT: full users only (no anonymous), and only as themselves.
-- Defense-in-depth: API also rejects anonymous via requireFullUser, but RLS
-- ensures the rule holds even if the API auth gate ever regresses.
create policy "city_suggestions_insert_own_full_user"
  on public.city_suggestions
  for insert
  with check (
    auth.uid() = user_id
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
  );

-- SELECT: own rows only. No public read in v1.
create policy "city_suggestions_select_own"
  on public.city_suggestions
  for select
  using (auth.uid() = user_id);

-- No UPDATE/DELETE policies. Admin actions use the service-role key.

commit;
