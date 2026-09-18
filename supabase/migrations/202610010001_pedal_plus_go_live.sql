-- Pedal Plus — GO LIVE.
--
-- ⚠️ DO NOT APPLY THIS UNTIL YOU MEAN TO TURN THE PAYWALL ON.
--
-- Every other migration in this directory describes a schema the app already
-- needs. This one is a business decision in SQL: applying it reveals the
-- paywall to every rider at once and starts enforcing the free-tier ceilings
-- on accounts created after PLUS_LAUNCH_AT_ISO. There is no undo that gives a
-- rider back the moment they first saw a price.
--
-- WHAT IT DOES
--   1. Flips the column default so accounts created from now on get the
--      paywall. Without this, every new signup after launch would see no
--      paywall at all and be silently free forever — the column has defaulted
--      to false since 202608190001, when the tier was dark by design.
--   2. Backfills every existing row to true, so the reveal is simultaneous
--      rather than a slow drip determined by signup date.
--
-- WHAT IT DOES NOT DO
--   It does not take anything away from anyone who is already here. Accounts
--   created before `PLUS_LAUNCH_AT_ISO` (2026-10-01) are grandfathered in
--   `packages/core/src/entitlement.ts` and stay exempt from every ceiling and
--   every meter. They see the paywall so they can buy Cool routing; they are
--   not capped by it.
--
-- BEFORE APPLYING, CHECK ALL THREE:
--   - Subscription products exist in Play Console AND App Store Connect, with
--     the 7-day introductory offer, and a RevenueCat offering maps them to the
--     `plus` entitlement. Without this the paywall renders with no prices and
--     the subscribe button does nothing.
--   - A build carrying the Cool entitlement gate is LIVE in both stores. The
--     gate ships in the client, so an older build ignores it.
--   - `PLUS_LAUNCH_AT_ISO` still reads 2026-10-01. If the launch slipped, that
--     constant and `COOL_ROUTING_FREE_UNTIL` must move together, in a shipped
--     release, BEFORE this runs — otherwise riders who joined in the gap are
--     capped retroactively, which is the thing grandfathering exists to stop.
--
-- ROLLBACK (cosmetic only — it cannot unsee a paywall):
--   ALTER TABLE public.profiles ALTER COLUMN premium_ui_enabled SET DEFAULT false;
--   UPDATE public.profiles SET premium_ui_enabled = false;

ALTER TABLE public.profiles
  ALTER COLUMN premium_ui_enabled SET DEFAULT true;

UPDATE public.profiles
  SET premium_ui_enabled = true
  WHERE premium_ui_enabled IS DISTINCT FROM true;

COMMENT ON COLUMN public.profiles.premium_ui_enabled IS
  'Whether this account sees the Pedal Plus paywall and has the free-tier '
  'ceilings enforced. Defaulted false while the tier was dark (202608190001); '
  'flipped true at go-live. Grandfathered accounts (created before '
  'PLUS_LAUNCH_AT_ISO) see the paywall but are exempt from the ceilings.';
