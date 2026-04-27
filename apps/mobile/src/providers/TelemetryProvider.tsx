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
 * Item 8 of the compliance plan: no telemetry events fire before the user
 * has explicitly consented in onboarding (or post-onboarding via Profile →
 * Privacy & Analytics). The store default is { sentry: false, posthog: false,
 * capturedAt: null } so a fresh install never sends anything until the
 * consent screen captures a decision.
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
