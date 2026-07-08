-- Master Pedal-nudge opt-out (audit 2026-07-05 UX-14).
--
-- Profile > Pedal Nudges had only `notify_streak` (streak-family triggers) —
-- post_ride_celebration / post_hazard_thanks / community_signal /
-- daily_ride_reminder / lapsed_reengagement had no user-facing off switch
-- short of revoking OS notification permission for the whole app (which
-- kills weather/hazard/community pushes too). This column gates ALL nudge
-- triggers at the top of evaluateEligibility (suppressed_category_pref).

alter table public.profiles
  add column if not exists notify_pedal_nudges boolean not null default true;

comment on column public.profiles.notify_pedal_nudges is
  'Master switch for the Pedal nudge system (all triggers). false = no nudges of any kind; per-family flags (notify_streak) still apply when true.';
