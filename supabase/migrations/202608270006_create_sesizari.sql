-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-27: Create `sesizari` — Romanian civic-complaint escalations.
--
-- One row per time a rider hands a hazard off to civia.ro. The row is written
-- on TAP-THROUGH, not on filing: civia.ro's submit requires author_name +
-- author_address (OG 27/2002 art. 7) which we never hold, so the rider always
-- finishes on Civia and we can never observe the actual send. Every count
-- derived from this table means "escalations started" — keep UI copy honest.
--
-- Why snapshot columns instead of a plain FK to hazards:
--   Hazards are written through the mobile offline queue, so a hazard reported
--   three minutes ago may still have NO server id when the post-ride card
--   renders. `hazard_id` is therefore nullable, and lat/lon/hazard_type/address
--   are denormalized so the row stays meaningful when the id is unknown, and
--   survives the hazard later expiring or being hard-deleted by the 3 AM cron.
--
-- Plan: docs/plans/sesizari-civia.md
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.sesizari (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Nullable on purpose (see header). `on delete set null` keeps the rider's
  -- history — and their badge progress — intact when a hazard is reaped.
  hazard_id uuid references public.hazards(id) on delete set null,
  hazard_type text not null,
  civia_category text not null,
  location geography(Point, 4326) not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  address text,
  created_at timestamptz not null default now()
);

-- Blocks the same rider re-escalating the same hazard. Partial, because
-- hazard_id is nullable and NULLs must not collide with each other.
create unique index if not exists sesizari_user_hazard_uniq
  on public.sesizari (user_id, hazard_id)
  where hazard_id is not null;

create index if not exists idx_sesizari_hazard
  on public.sesizari (hazard_id)
  where hazard_id is not null;

create index if not exists idx_sesizari_user_created
  on public.sesizari (user_id, created_at desc);

create index if not exists idx_sesizari_location_gist
  on public.sesizari using gist (location);

alter table public.sesizari enable row level security;

-- INSERT: own rows only. Anonymous IS allowed (unlike city_suggestions):
-- Civia collects the rider's legal identity itself, so nothing downstream
-- depends on us knowing who they are, and blocking anonymous would gate a
-- civic right behind our signup for no safety gain.
create policy "sesizari_insert_own"
  on public.sesizari
  for insert
  with check (auth.uid() = user_id);

-- SELECT: own rows only. Cross-user escalation counts do NOT come from here —
-- they come from get_sesizare_counts() below, which is security definer.
create policy "sesizari_select_own"
  on public.sesizari
  for select
  using (auth.uid() = user_id);

-- No UPDATE/DELETE policies. Admin actions use the service-role key.

-- Supabase grants the full DML set to anon/authenticated by default ACL.
-- Least privilege: reads and inserts only, everything else via service role.
revoke all on public.sesizari from anon, authenticated;
grant select, insert on public.sesizari to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- get_sesizare_counts — "N riders already escalated this" for the hazard list.
--
-- Security definer because callers may only SELECT their own rows under RLS,
-- but the count is a cross-user aggregate. Returns the caller's own flag in
-- the same pass so /v1/hazards/nearby needs one round-trip, not two.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_sesizare_counts(
  p_hazard_ids uuid[],
  p_user_id uuid default null
)
returns table (
  hazard_id uuid,
  total bigint,
  escalated_by_caller boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.hazard_id,
    count(*) as total,
    bool_or(p_user_id is not null and s.user_id = p_user_id) as escalated_by_caller
  from public.sesizari s
  where s.hazard_id = any(p_hazard_ids)
  group by s.hazard_id;
$$;

revoke all on function public.get_sesizare_counts(uuid[], uuid) from public, anon;
grant execute on function public.get_sesizare_counts(uuid[], uuid) to authenticated, service_role;

comment on table public.sesizari is
  'Civic-complaint escalations handed off to civia.ro. Rows record a tap-through, NOT a confirmed filing — see docs/plans/sesizari-civia.md.';

commit;
