/**
 * Headless provider that pushes device-derived profile fields to the server
 * once per session (and again if they change mid-session):
 *
 *   - `quietHoursTimezone` — the REAL device timezone. Before this existed,
 *     the only writer was the Profile screen's mount effect, so a rider who
 *     never opened Profile kept the schema-era 'Europe/Bucharest' default
 *     forever and could be push-woken at 04:00 local in Reykjavík (review
 *     2026-08-13 G-06). Syncing at bootstrap also heals travelers whose
 *     stored zone went stale.
 *   - `preferredLocale` — the app UI locale, so server-sent pushes (Pedal
 *     nudges, first-ride notifications) speak the rider's language instead
 *     of hardcoded English (review 2026-08-13 G-11).
 *
 * Fire-and-forget: a failed sync is retried on the next app open. The
 * Profile screen's own sync remains and stays authoritative for explicit
 * preference edits.
 *
 * It also hydrates Pedal Plus entitlement and the sesizări remote config
 * (kill switch + civia.ro base URL) from the SAME response, at zero
 * extra network cost: PATCH /v1/profile returns the full profile including the
 * premium block, and this already runs at every session bootstrap. A failed
 * sync simply leaves the previously cached snapshot in place, which is exactly
 * the offline behaviour we want — `resolveEntitlement` ages it out via the
 * grace window rather than dropping a paying rider to free on one bad request.
 */
import { useEffect, useRef } from 'react';

import { mobileApi } from '../lib/api';
import { useAppStore } from '../store/appStore';
import { useAuthSession } from './AuthSessionProvider';

export const ProfileDeviceSyncManager = () => {
  const { user } = useAuthSession();
  const locale = useAppStore((s) => s.locale);
  const lastSyncedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const key = `${user.id}|${timezone}|${locale}`;
    if (lastSyncedKey.current === key) return;
    lastSyncedKey.current = key;

    mobileApi
      .updateProfile({ quietHoursTimezone: timezone, preferredLocale: locale })
      .then((profile) => {
        if (profile?.premium) {
          useAppStore
            .getState()
            .setPremiumFromProfile(profile.premium, new Date().toISOString());
        }

        // Sesizări remote config, hydrated from the same response. Server
        // config, not a preference — this is the ONLY writer. Undefined means
        // an older server, so the previously cached values stay (fail open).
        if (profile?.sesizariEnabled !== undefined) {
          useAppStore.getState().setSesizariConfig({
            enabled: profile.sesizariEnabled,
            baseUrl: profile.sesizariBaseUrl ?? '',
          });
        }

        // Flat rides taken since the last successful sync. Piggy-backed here
        // because reaching this point already proves we are online and
        // authenticated; without a durable count the allowance would reset on
        // reinstall. Best-effort: a failure leaves `pendingCount` intact so the
        // next sync retries, and no ride is ever double-charged.
        const meter = useAppStore.getState().flatRouteMeter;
        if (meter.pendingCount > 0 && meter.periodKey) {
          mobileApi
            .reconcileFlatRoutes({
              periodKey: meter.periodKey,
              pending: meter.pendingCount,
            })
            .then((result) => {
              const store = useAppStore.getState();
              // Clear only what the server actually absorbed, then adopt its
              // total. Order matters: acknowledging first keeps the running
              // total stable across the two writes.
              store.acknowledgeFlatRoutesLocally(result.accepted);
              store.mergeFlatRouteMeterFromServer({
                periodKey: result.periodKey,
                syncedCount: result.total,
                pendingCount: 0,
              });
            })
            .catch(() => {
              // Keep the pending count; the next sync retries.
            });
        }
      })
      .catch(() => {
        // Best-effort: clear the key so a transient failure retries on the
        // next dependency change / app open rather than being latched.
        lastSyncedKey.current = null;
      });
  }, [user, locale]);

  return null;
};
