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
 * Compliance plan item 8, updated for P0.1 split (2026-05-25): the two
 * channels have asymmetric legal bases.
 *   - Sentry crash reports default ON under legitimate interest (GDPR Art
 *     6(1)(f)). User can object via Profile → Privacy & Analytics.
 *   - PostHog product analytics default OFF; requires affirmative opt-in
 *     under ePrivacy / ANSPDCP Law 506/2004.
 * The store default is { sentry: true, posthog: false, capturedAt: null }
 * — so a fresh install starts emitting crash diagnostics immediately while
 * holding analytics events until the user opts in via the consent screen.
 * See docs/legal/consent-split-2026-05-25.md for the decision record.
 */
export const TelemetryProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuthSession();
  const sentryConsent = useAppStore((s) => s.analyticsConsent.sentry);
  const posthogConsent = useAppStore((s) => s.analyticsConsent.posthog);

  // Apply consent flags whenever they change. The applyTelemetryConsent
  // helper is idempotent and fast — re-running on every flip is fine.
  useEffect(() => {
    applyTelemetryConsent({ sentry: sentryConsent, posthog: posthogConsent });
  }, [sentryConsent, posthogConsent]);

  // Re-identify when the auth session changes. telemetry.identify is a no-op
  // for clients that aren't currently enabled, so this is safe to call even
  // before consent. Anonymous users are identified by id only (no email).
  useEffect(() => {
    telemetry.identify(
      user
        ? {
            id: user.id,
            email: user.email ?? null,
          }
        : null,
    );
  }, [user?.email, user?.id]);

  return <>{children}</>;
};
