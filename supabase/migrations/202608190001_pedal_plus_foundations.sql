-- Pedal Plus — Phase 0 foundations: entitlement storage, usage metering, and
-- the dark-launch visibility flag.
--
-- Nothing in this migration changes rider-visible behaviour. No app build reads
-- these tables yet, `premium_ui_enabled` defaults to false for every account,
-- and no gate consults the meter until Phase 5. Applying it early is deliberate:
-- the server half can be deployed and exercised long before any UI exists.
--
-- Design notes worth keeping:
--
--  * ENTITLEMENT IS SERVER-OWNED. The device caches the last answer and honours
--    it for a grace window when offline, but it never derives Plus from a
--    receipt. Same server-owns-it / client-hydrates split as quiet hours and
--    notification prefs (error-log #81) — a client that computes its own answer
--    eventually overwrites the truth.
--
--  * ONE ROW PER USER in `subscriptions`. This table answers exactly one
--    question: does this rider have Plus right now. RevenueCat remains the
--    system of record for billing history; `subscription_events` keeps the
--    audit trail we need for support and idempotency.
--
--  * STORE-AGNOSTIC VOCABULARY. `status` is normalised across Play and
--    StoreKit so neither store's terminology leaks into the domain model.
--    `grace` is the billing-retry window (payment failed, store still granting
--    access); `cancelled` means auto-renew is off but the paid period has not
--    ended. Both still grant Plus — see `entitlement.ts`.
--
--  * GRANDFATHERING NEEDS NO COLUMN. It is `profiles.created_at` (equivalently
--    auth.users.created_at) compared against the launch constant in
--    `premiumCatalog.ts`. Deliberately not denormalised here so there is no
--    second copy to drift.

-- ---------------------------------------------------------------------------
-- subscriptions — current entitlement state, one row per rider
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'none'
                           CHECK (status IN ('none','trialing','active','grace','cancelled','expired')),
  store                  TEXT CHECK (store IN ('play','app_store','manual')),
  product_id             TEXT,
  -- End of the paid period. NULL when there has never been one. Checked against
  -- now() by the resolver for every status except 'grace', where the period has
  -- lapsed by definition and the store is still granting access.
  expires_at             TIMESTAMPTZ,
  -- RevenueCat's app_user_id. We set this to the Supabase user id at login, but
  -- it is stored explicitly so a mismatch is visible during support rather than
  -- assumed away.
  revenuecat_app_user_id TEXT,
  -- Ordering guard: an out-of-order webhook delivery must not overwrite newer
  -- state with older state. The writer compares against this before applying.
  last_event_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support lookup path: "which account does this RevenueCat id belong to".
CREATE INDEX IF NOT EXISTS idx_subscriptions_rc_app_user_id
  ON public.subscriptions (revenuecat_app_user_id)
  WHERE revenuecat_app_user_id IS NOT NULL;

-- Renewal/expiry sweeps read by expiry.
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at
  ON public.subscriptions (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- A rider may read their own entitlement. Writes are service-role only: the
-- webhook is the only writer, and a client that could write this row could
-- grant itself Plus.
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies by design.

-- Supabase grants INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES to anon and
-- authenticated by default on new tables. REVOKE ALL first, then grant back only
-- what is needed. TRUNCATE is the dangerous one: it BYPASSES RLS, so a policy
-- alone does not protect the table. Same trap as road_risk_data (v22 migrations).
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- ---------------------------------------------------------------------------
-- subscription_events — webhook idempotency + audit trail
-- ---------------------------------------------------------------------------

-- The PRIMARY KEY on the provider's event id is the idempotency mechanism:
-- insert first, and a conflict means we have already processed this delivery.
-- RevenueCat retries aggressively, so duplicate deliveries are routine, not an
-- edge case.
CREATE TABLE IF NOT EXISTS public.subscription_events (
  event_id    TEXT PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  event_at    TIMESTAMPTZ NOT NULL,
  -- Full payload retained for support and for replaying a mapping bug without
  -- asking the provider to resend.
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_at
  ON public.subscription_events (user_id, event_at DESC);

-- Service-role only. No client reads billing events; RLS with no policies is
-- deny-all for anon/authenticated, and service_role bypasses RLS.
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_events FROM anon, authenticated;
GRANT ALL ON public.subscription_events TO service_role;

-- ---------------------------------------------------------------------------
-- usage_meters — monthly quota counters
-- ---------------------------------------------------------------------------

-- Generic on purpose: `meter` is a discriminator so a second metered feature
-- does not need a second table. Today the only value is 'flat_route'.
--
-- `period_key` is 'YYYY-MM' computed in the RIDER's timezone, not UTC. A rider
-- in Bucharest starting a ride at 01:30 local on the 1st is in the new month
-- while UTC still says the old one; quota that resets on the wrong day looks
-- like a bug to the only person who can see it. Stored as text because the
-- bucket, not the instant, is the identity — and because lexicographic order
-- on 'YYYY-MM' is chronological order, which the client-side merge relies on.
CREATE TABLE IF NOT EXISTS public.usage_meters (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter      TEXT NOT NULL CHECK (meter IN ('flat_route')),
  period_key TEXT NOT NULL CHECK (period_key ~ '^\d{4}-\d{2}$'),
  count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meter, period_key)
);

ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;

-- A rider may read their own usage — the UI shows "2 of 3 left this month".
-- Writes are service-role only; a client that could write its own meter could
-- reset its own quota.
CREATE POLICY "usage_meters_select_own"
  ON public.usage_meters
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON public.usage_meters FROM anon, authenticated;
GRANT SELECT ON public.usage_meters TO authenticated;
GRANT ALL ON public.usage_meters TO service_role;

-- Old periods are never read once rolled over. A retention sweep can drop
-- anything older than a couple of months; deliberately not scheduled yet since
-- the table stays tiny until Phase 5 activates metering.

-- ---------------------------------------------------------------------------
-- profiles.premium_ui_enabled — dark-launch visibility
-- ---------------------------------------------------------------------------

-- VISIBILITY IS NOT ENTITLEMENT. This flag controls only whether paywall and
-- upgrade UI renders. A subscriber stays entitled with the flag off, so hiding
-- the paywall can never strip features from someone who paid — which is what
-- makes it safe to use as an instant server-side kill switch.
--
-- Defaults false: ships dark to the entire fleet, flipped per-account for
-- testing, then widened.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_ui_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.premium_ui_enabled IS
  'Dark-launch gate for Pedal Plus UI. Controls paywall visibility only, never entitlement. Default false; flip per-account to test, then widen.';
