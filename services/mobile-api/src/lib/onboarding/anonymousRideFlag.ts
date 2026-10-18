/**
 * `ONBOARDING_ANONYMOUS_RIDE_ENABLED` — whether a first-ride onboarding rider
 * may take their FIRST ride before creating an account (the account is then
 * asked for to keep the ride). docs/plans/onboarding-first-ride.md, audit
 * 2026-10-18 finding #2.
 *
 * Separate from `ONBOARDING_FIRST_RIDE_ENABLED` because it trades against the
 * mandatory-registration decision (community trust) and must be reversible on
 * its own. Defaults OFF; the client fails closed. Read at call time.
 */
export const isOnboardingAnonymousRideEnabled = (): boolean => {
  const raw = (process.env.ONBOARDING_ANONYMOUS_RIDE_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
};
