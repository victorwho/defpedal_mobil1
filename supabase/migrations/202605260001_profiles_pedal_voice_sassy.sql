-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-26: Add `pedal_voice_sassy` toggle on profiles.
--
-- Per locked spec (Wave 3 + Wave 7), Pedal's witty/sassy voice is the
-- default for new users, with a profile setting to soften to neutral.
-- The Pedal Nudge System reads this column when rendering messages via
-- packages/core/src/pedalVoice.ts → pickMessage(..., sassy).
--
-- Defaults TRUE so the brand voice ships on day one. Riders who prefer
-- neutral toggle it in Profile > Display.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.profiles
  add column if not exists pedal_voice_sassy boolean not null default true;

commit;
