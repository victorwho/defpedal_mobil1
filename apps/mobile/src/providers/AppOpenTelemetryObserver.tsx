/**
 * Records one first-party `app_open` row per foreground.
 *
 * WHY THIS EXISTS AGAIN. A provider of this name was deleted with the Mia
 * persona journey in v0.2.43 (2026-05-10), and `user_telemetry_events.app_open`
 * has been silent since that exact day. Its absence left PostHog as the only
 * way to count active users — and PostHog is consent-gated, so riders who
 * turned product analytics off were uncountable, with the further problem that
 * the opt-out flag is never reported to the server, so the blind spot was not
 * even measurable. Measured 2026-09-11: 107 of 209 users with server-side proof
 * of app use had no PostHog event under their own id
 * (docs/reviews/active-user-counting-2026-09-11.md).
 *
 * ⚠️ INDEPENDENT OF THE PRODUCT-ANALYTICS TOGGLE, on purpose. Lawful basis is
 * legitimate interest (GDPR Art 6(1)(f)) for operating and sizing the service —
 * the same footing the app already uses for Sentry crash reports — and it holds
 * only while the payload stays minimal. One row, no location, no device
 * identifier, no screen, nothing about what the rider did. Do not route product
 * events through here, and do not add fields describing behaviour: that is a
 * privacy decision requiring a Privacy Policy update in the same change.
 *
 * Needs a session, so it waits for auth rather than firing on mount — an open
 * we cannot attribute is not worth a row, and `requireWriteUser` would reject
 * it anyway. Anonymous sessions DO count; they are the population PostHog was
 * least likely to attribute.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { mobileApi } from '../lib/api';
import { getAppBuildInfo } from '../lib/appBuildInfo';
import { shouldRecordAppOpen } from '../lib/appOpenTelemetry';
import { useAuthSession } from './AuthSessionProvider';

export const AppOpenTelemetryObserver = () => {
  const { user, isLoading: authLoading } = useAuthSession();
  const lastRecordedAtRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (authLoading || !user) return undefined;

    const record = () => {
      const now = Date.now();
      if (inFlightRef.current) return;
      if (!shouldRecordAppOpen(lastRecordedAtRef.current, now)) return;
      inFlightRef.current = true;

      mobileApi
        .recordAppOpen({ ...getAppBuildInfo() })
        .then(() => {
          // Stamped only on success, so a failed write retries on the next
          // foreground instead of being silently dropped for five minutes.
          lastRecordedAtRef.current = Date.now();
        })
        .catch(() => {
          // Swallowed by design. An app open is not a request the rider made,
          // so it must never surface as an error, and an unrecorded open costs
          // one row in a count.
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    // The session becoming available IS an app open — this is the cold-start
    // case, and the one that matters most.
    record();

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') record();
      },
    );

    return () => subscription.remove();
  }, [authLoading, user?.id]);

  return null;
};
