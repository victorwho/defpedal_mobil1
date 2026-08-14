-- Geo-remnants review 2026-08-13 (G-06, G-11).
--
-- 1) quiet_hours_timezone: drop the 'Europe/Bucharest' schema default.
--    The default meant every profile row was POPULATED with Bucharest and
--    server-side quiet hours ran on the Bucharest clock for riders who never
--    opened the Profile screen (the only surface that synced the real device
--    timezone). New rows now start NULL; all server consumers fall back to
--    'UTC' uniformly (routes/nudges.ts, lib/nudges/eventFirer.ts,
--    lib/notifications.ts), and the mobile client syncs the real device
--    timezone at session bootstrap (ProfileDeviceSyncManager), which also
--    heals the existing Bucharest-stamped rows on each user's next app open.
--    Deliberately NO backfill of existing rows: for the RO-majority fleet the
--    stored value is correct, and wrong-but-stored values self-heal via the
--    bootstrap sync.
ALTER TABLE public.profiles
  ALTER COLUMN quiet_hours_timezone DROP DEFAULT;

-- 2) preferred_locale: per-user push language for server-sent notifications
--    (Pedal nudges, first-ride notifications). Synced from the app UI locale
--    at session bootstrap. NULL → server falls back to 'en' (the EN catalog
--    is verified geography-neutral). Before this column existed every
--    dispatch hardcoded 'en' and the commissioned RO/ES pedalVoice catalogs
--    never reached riders.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text
  CHECK (preferred_locale IN ('en', 'ro', 'es'));

COMMENT ON COLUMN public.profiles.preferred_locale IS
  'App UI locale synced from the device (en/ro/es). Drives server-sent push copy language. NULL = never synced, treat as en.';
