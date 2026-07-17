-- ─────────────────────────────────────────────────────────────────────────────
-- City Riders Pulse (docs/plans/city-riders-pulse-notification.md)
--
-- 1. nudge_schedule — stateful per-user next-fire draw for scheduled triggers.
--    One row per (user, trigger). city_riders_pulse is the first consumer;
--    the shape is deliberately trigger-generic so future scheduled triggers
--    reuse it.
-- 2. Widen the nudge_log.trigger_id CHECK to accept 'city_riders_pulse'
--    (the original constraint enumerates the 10 launch triggers — without
--    this every insert for the new trigger fails).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.nudge_schedule (
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_id text not null,
  -- Next planned fire instant (UTC). The */30-min evaluate cron emits a
  -- candidate when now >= next_fire_at.
  next_fire_at timestamptz not null,
  -- Last successful send; drives the 5-day guarantee escalation. NULL until
  -- the first send.
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, trigger_id)
);

-- The evaluate cron scans due rows per trigger every tick.
create index if not exists idx_nudge_schedule_due
  on public.nudge_schedule (trigger_id, next_fire_at);

-- RLS deny-all: enable RLS and add NO policies — only the service-role cron
-- reads or writes scheduling state. Clients have no business here.
alter table public.nudge_schedule enable row level security;

grant all on public.nudge_schedule to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- nudge_log.trigger_id: + 'city_riders_pulse'
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.nudge_log
  drop constraint if exists nudge_log_trigger_id_check;

alter table public.nudge_log
  add constraint nudge_log_trigger_id_check check (trigger_id in (
    'post_ride_celebration',
    'post_hazard_thanks',
    'streak_at_risk_mild',
    'streak_at_risk_dramatic',
    'daily_ride_reminder',
    'milestone_celebration',
    'badge_proximity',
    'lapsed_reengagement',
    'community_signal',
    'streak_lost_apology',
    'city_riders_pulse'
  ));
