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
      .catch(() => {
        // Best-effort: clear the key so a transient failure retries on the
        // next dependency change / app open rather than being latched.
        lastSyncedKey.current = null;
      });
  }, [user, locale]);

  return null;
};
