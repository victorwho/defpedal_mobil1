-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-25: Create `user_ride_pattern` table for adaptive nudge timing.
--
-- Stores the typical-start-hour each rider tends to start rides at, so the
-- nudges-evaluate-cron can fire the streak-at-risk reminder ~1 hour before
-- the rider's usual ride window (vs a blunt 6 PM default for everyone).
--
-- Recomputed daily by the nudges-pattern-cron from the last 14 days of
-- `trip_tracks` records.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.user_ride_pattern (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Most common ride-start hour (0–23) in the user's local timezone.
  -- NULL = no pattern learned yet (fall back to 18:00 default).
  typical_start_hour smallint check (typical_start_hour between 0 and 23),

  -- Confidence 0.00–1.00 based on sample size + variance.
  -- Eligibility uses confidence >= 0.40 before honoring typical_start_hour.
  confidence numeric(3,2) not null default 0.0
    check (confidence between 0 and 1),

  -- Number of rides used in the computation. Affects confidence weighting.
  sample_count integer not null default 0 check (sample_count >= 0),

  last_computed_at timestamptz not null default now()
);

create index if not exists idx_user_ride_pattern_last_computed
  on public.user_ride_pattern (last_computed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: own-row SELECT only; no client INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_ride_pattern enable row level security;

create policy "user_ride_pattern_select_own"
  on public.user_ride_pattern
  for select
  using (auth.uid() = user_id);

-- Service role only for writes (cron)
grant all on public.user_ride_pattern to service_role;

commit;
