-- auto_share_rides: record WHEN it was explicitly set (2026-09-14)
--
-- The defect: `profiles.auto_share_rides` gates three real behaviours —
-- `autoPublishRide` (whether a finished ride reaches the activity feed), the
-- badge/tier location stamp, and the top-contributors join on City Heartbeat —
-- but NOTHING in the mobile app has ever written it. The Profile screen's
-- "Share trips publicly" toggle wrote only the device-scoped Zustand flag
-- `shareTripsPublicly`. Two flags, one user intent, and only one reachable.
--
-- Measured 2026-09-14: 3,364 of 3,365 profiles sit at the trigger default
-- `true`; the single exception is the product owner's account, which had
-- shared 245 rides (51% of every share in the database, 977.7 km) while
-- `auto_share_rides = false` kept it off the contributors list it topped.
--
-- ⚠️ Why a timestamp and not just "let the server win".
-- The obvious repair — hydrate the device flag from the column, the way quiet
-- hours and the notify flags work — is WRONG for this field, and wrong in a way
-- that reproduces error-log #81 pointing the other way. Those fields hold real
-- user choices, so the server deserves to win. This column holds a value nobody
-- ever chose, so letting it win would push a never-chosen default over the one
-- place the rider HAS expressed this intent (the device toggle) — silently
-- re-opting a rider who had turned sharing off back into publishing.
--
-- So: NULL means "never explicitly set, the device flag carries the real
-- intent, seed me from it"; non-NULL means "a human set this, the server owns
-- it from now on and a reinstall must not reset it". Same shape as
-- `notify_riding_tips_consented_at`, which exists for exactly this reason.
--
-- Deliberately NOT backfilled. Backfilling would assert that every existing
-- value was chosen, which is the false claim this column exists to avoid.

alter table public.profiles
  add column if not exists auto_share_rides_set_at timestamptz;

comment on column public.profiles.auto_share_rides_set_at is
  'When auto_share_rides was last explicitly set by the user. NULL = never set, so the device flag seeds it (migration 202609140004). Never backfill: NULL is the meaningful state.';
