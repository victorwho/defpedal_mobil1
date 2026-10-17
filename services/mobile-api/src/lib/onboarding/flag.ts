/**
 * `ONBOARDING_FIRST_RIDE_ENABLED` — whether a fresh install gets the
 * value-first onboarding (ride intent → route reveal → signup → ride it)
 * instead of today's intro → wall flow. Spec: docs/plans/onboarding-first-ride.md [D12].
 *
 * Delivered through `GET /v1/profile`, which answers the anonymous session
 * every fresh install already has — onboarding runs before signup, so a
 * full-account-only source would never be read.
 *
 * Defaults to OFF and the client fails CLOSED: an older server, a failed read
 * or a missing field all keep today's flow. Turning it on is the deliberate act:
 *
 *   gcloud run services update defpedal-api --region europe-central2 \
 *     --update-env-vars ONBOARDING_FIRST_RIDE_ENABLED=true \
 *     --project gen-lang-client-0895796477
 *
 * Read at call time (like `loops/flag.ts`) so it is testable and needs no
 * cold start to take effect.
 */
export const isOnboardingFirstRideEnabled = (): boolean => {
  const raw = (process.env.ONBOARDING_FIRST_RIDE_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
};
