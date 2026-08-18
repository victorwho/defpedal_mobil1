/**
 * Decide, per field, whether the SERVER or the LOCAL store wins when the
 * Profile screen first mounts.
 *
 * The bug this exists to prevent: the Zustand store is device-scoped, so after a
 * reinstall (or on a second device) it holds factory defaults — quiet hours
 * 22:00–07:00, every notify flag on, `shareConversionFeedOptin: true`. The
 * Profile mount effect used to PUSH those to the server unconditionally, so
 * simply opening Profile silently reset a rider's configured quiet-hours window
 * and re-opted them into conversion-feed sharing they had turned off.
 *
 * Rule: the server is authoritative for these fields, because the server is what
 * enforces them (quiet hours gate every push in `lib/notifications.ts`; the
 * notify flags gate categories). Local only fills in fields the server has never
 * had a value for.
 */

export interface LocalNotificationPrefs {
  readonly notifyWeather: boolean;
  readonly notifyHazard: boolean;
  readonly notifyCommunity: boolean;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly shareConversionFeedOptin: boolean;
}

/** The subset of `ProfileResponse` this decision needs; all fields may be absent. */
export interface RemoteNotificationPrefs {
  readonly notifyWeather?: boolean | null;
  readonly notifyHazard?: boolean | null;
  readonly notifyCommunity?: boolean | null;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly shareConversionFeedOptin?: boolean | null;
}

export interface PrefSyncPlan {
  /** Apply to the local store — the server had a value and it wins. */
  readonly hydrate: Partial<LocalNotificationPrefs>;
  /** Send to the server — it had no value, so seed it from local. */
  readonly push: Partial<LocalNotificationPrefs>;
}

export const resolveNotificationPrefSync = (
  local: LocalNotificationPrefs,
  remote: RemoteNotificationPrefs | null,
): PrefSyncPlan => {
  // No server answer (offline, 5xx): keep the old behaviour and push local, so
  // a rider who has never synced still gets their prefs onto the server.
  if (!remote) {
    return { hydrate: {}, push: { ...local } };
  }

  const hydrate: Record<string, unknown> = {};
  const push: Record<string, unknown> = {};

  const booleanFields = ['notifyWeather', 'notifyHazard', 'notifyCommunity', 'shareConversionFeedOptin'] as const;
  for (const field of booleanFields) {
    const value = remote[field];
    if (typeof value === 'boolean') hydrate[field] = value;
    else push[field] = local[field];
  }

  // Quiet hours move as a PAIR. A half-set window (one end null) is not
  // meaningful — the server compares start against end — so treat it as unset
  // and seed both from local rather than mixing a stored end with a default start.
  if (remote.quietHoursStart && remote.quietHoursEnd) {
    hydrate.quietHoursStart = remote.quietHoursStart;
    hydrate.quietHoursEnd = remote.quietHoursEnd;
  } else {
    push.quietHoursStart = local.quietHoursStart;
    push.quietHoursEnd = local.quietHoursEnd;
  }

  return { hydrate: hydrate as Partial<LocalNotificationPrefs>, push: push as Partial<LocalNotificationPrefs> };
};
