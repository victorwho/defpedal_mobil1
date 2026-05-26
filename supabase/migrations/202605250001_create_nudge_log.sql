-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-25: Create `nudge_log` table for the Pedal Nudge System.
--
-- Records every dispatched (or suppressed) Pedal nudge with full funnel
-- attribution columns so we can measure:
--   sent → delivered → tapped → action-completed-within-2h
--
-- `notification_log` (from 202604010001_push_notifications.sql) remains the
-- dispatch transcript for ALL pushes (weather, hazard, community, system).
-- This table is the analytics/attribution layer for nudge-specific pushes.
-- The two link via expo_ticket_id correlation.
--
-- The CHECK constraint on `notification_log.category` is also widened in
-- this migration to include 'nudge' so existing dispatchNotification calls
-- can continue to enforce the unified daily budget across both tables.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- Widen notification_log category enum to allow 'nudge' dispatches to log
-- through the existing pipeline (daily budget + suppression accounting).
alter table public.notification_log
  drop constraint if exists notification_log_category_check;

alter table public.notification_log
  add constraint notification_log_category_check
  check (category in ('weather','hazard','community','system','mia','nudge'));

-- ─────────────────────────────────────────────────────────────────────────────
-- nudge_log: per-nudge attribution + variant testing + funnel telemetry
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.nudge_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Which trigger fired this nudge, e.g. 'streak_at_risk_dramatic'
  trigger_id text not null check (trigger_id in (
    'post_ride_celebration',
    'post_hazard_thanks',
    'streak_at_risk_mild',
    'streak_at_risk_dramatic',
    'daily_ride_reminder',
    'milestone_celebration',
    'badge_proximity',
    'lapsed_reengagement',
    'community_signal',
    'streak_lost_apology'
  )),

  -- Sticky-bucket copy variant per (user_id, trigger_id) for A/B testing
  variant_id text not null,

  -- Numeric priority from packages/core/src/pedalVoice.ts
  --   0 = P0 (always send), 1 = P1 (high), 2 = P2 (medium), 3 = P3 (low)
  priority smallint not null check (priority between 0 and 3),

  -- Lifecycle timestamps
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,           -- when Expo Push accepted
  delivered_at timestamptz,      -- if Expo receipt confirms delivery
  tapped_at timestamptz,         -- when the user opened via tap (mobile callback)
  action_completed_at timestamptz, -- did the intended action complete within 2h

  -- Outcome enum: why we landed in this state
  outcome text not null default 'scheduled' check (outcome in (
    'scheduled',
    'sent',
    'suppressed_anonymous',
    'suppressed_quiet_hours',
    'suppressed_weather',
    'suppressed_sunset',
    'suppressed_cap',
    'suppressed_category_pref',
    'suppressed_no_token',
    'suppressed_qualified_already',
    'cancelled_kill_switch',
    'expo_error'
  )),

  -- Correlation with notification_log + arbitrary context (city, streak, etc)
  expo_ticket_id text,
  context jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_nudge_log_user_scheduled
  on public.nudge_log (user_id, scheduled_at desc);

create index if not exists idx_nudge_log_trigger_scheduled
  on public.nudge_log (trigger_id, scheduled_at desc);

-- Partial index to speed up the 2-h action-attribution sweep
create index if not exists idx_nudge_log_pending_attribution
  on public.nudge_log (sent_at)
  where action_completed_at is null and sent_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: own-row SELECT only; no client INSERT/UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.nudge_log enable row level security;

create policy "nudge_log_select_own"
  on public.nudge_log
  for select
  using (auth.uid() = user_id);

-- Service role only for writes (cron + mobile API)
grant all on public.nudge_log to service_role;

commit;
