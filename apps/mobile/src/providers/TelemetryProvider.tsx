import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { applyTelemetryConsent, telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';
import { useAuthSession } from './AuthSessionProvider';

/**
 * Subscribes Sentry + PostHog lifecycle to the user's consent flags in
 * appStore. Init / teardown both clients whenever the flags flip. Identifies
 * the active user (id-only for anonymous sessions) once consent is granted.
 *
 * Compliance plan item 8, P0.1 split (2026-05-25), amended 2026-07-19.
 *   - Sentry crash reports default ON under legitimate interest (GDPR Art
 *     6(1)(f)). User can object via Profile → Privacy & Analytics.
 *   - PostHog product analytics ALSO default ON since 2026-07-19.
 *
 * ⚠️ This block used to say PostHog defaulted OFF and required affirmative
 * opt-in. That stopped being true on 2026-07-19, when the product owner
 * directed the flip after being shown the ePrivacy / ANSPDCP Law 506/2004
 * risk; the shipped default is `{ sentry: true, posthog: true,
 * capturedAt: null }` (appStore.ts), with a v5→v6 persist migration flipping
 * never-asked users ON and deliberately NOT stamping `capturedAt`, which
 * records a USER act only. An explicit OFF survives every upgrade.
 *
 * The ANSPDCP/ePrivacy review has still NOT happened. Do not read this
 * provider as evidence that analytics is opt-in — it is not, and a stale
 * comment claiming otherwise is worse than none in a regulated area. The
 * disclosure surface is the first onboarding screen's transparency notice plus
 * the Privacy Policy link; the rollback is in `.claude/CLAUDE.md` under the
 * telemetry consent model. Decision record:
 * docs/legal/consent-split-2026-05-25.md (superseded on the PostHog default).
 */
export const TelemetryProvider = ({ children }: PropsWithChildren) => {
  const { user, isLoading: authLoading } = useAuthSession();
  const sentryConsent = useAppStore((s) => s.analyticsConsent.sentry);
  const posthogConsent = useAppStore((s) => s.analyticsConsent.posthog);

  // Apply consent flags whenever they change. The applyTelemetryConsent
  // helper is idempotent and fast — re-running on every flip is fine.
  useEffect(() => {
    applyTelemetryConsent({ sentry: sentryConsent, posthog: posthogConsent });
  }, [sentryConsent, posthogConsent]);

  /*
   * Re-identify when the auth session changes.
   *
   * ⚠️ `isLoading` is load-bearing, not a nicety. Auth resolves
   * asynchronously, so `user` is null on EVERY cold start for the first
   * moments — and `telemetry.identify(null)` calls PostHog's `reset()`, which
   * mints a brand-new anonymous `distinct_id`. Without this guard every launch
   * began a fresh identity, events fired under it, and the link to the account
   * was made late or not at all.
   *
   * Measured before the fix (30 days to 2026-09-11): 796 distinct_ids for 209
   * users with server-side proof of app use — 613 of those ids matched no
   * account at all, and 107 of the 209 users (51%) had no PostHog event under
   * their own id. PostHog's person count sat BELOW the number of humans we
   * could prove had used the app (11 vs 15 on 2026-09-10). See
   * docs/reviews/active-user-counting-2026-09-11.md.
   *
   * `reset()` is a SIGN-OUT operation. "Auth has not answered yet" is not a
   * sign-out, and must not be treated as one.
   *
   * telemetry.identify is still a no-op for clients that aren't enabled, so
   * this stays safe to call before consent. Anonymous users are identified by
   * id only (no email).
   */
  useEffect(() => {
    if (authLoading) return;
    telemetry.identify(
      user
        ? {
            id: user.id,
            email: user.email ?? null,
          }
        : null,
    );
  }, [authLoading, user?.email, user?.id]);

  return <>{children}</>;
};
