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
  /**
   * Maps to `profiles.auto_share_rides`.
   *
   * Named `shareTripsPublicly` in the store for historical reasons — the two
   * were INDEPENDENT flags until 2026-09-14, which is the defect this field
   * closes. The device flag decided whether a finished ride wrote a
   * `trip_shares` row; the server column decided whether that ride was
   * auto-published to the activity feed, whether badge/tier rows got a
   * location, and whether the rider appeared in City Heartbeat's top
   * contributors. Nothing in the app had ever written the server column, so
   * the two could disagree indefinitely — and did: the product owner's account
   * shared 245 rides (51% of every share in the database) while sitting at
   * `auto_share_rides = false`, invisible on the contributors list it topped.
   */
  readonly shareTripsPublicly: boolean;
}

/** The subset of `ProfileResponse` this decision needs; all fields may be absent. */
export interface RemoteNotificationPrefs {
  readonly notifyWeather?: boolean | null;
  readonly notifyHazard?: boolean | null;
  readonly notifyCommunity?: boolean | null;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly shareConversionFeedOptin?: boolean | null;
  readonly autoShareRides?: boolean | null;
  /**
   * When `autoShareRides` was last explicitly set — null (or absent, on an
   * older server) if it never has been.
   *
   * This is what makes the sharing field safe to reconcile at all. Every other
   * field here holds a value some rider chose, so the server deserves to win.
   * `auto_share_rides` held the trigger default for 3,364 of 3,365 accounts
   * because nothing in the app had ever written it, so winning on its own
   * would push a never-chosen default over the device toggle — the only place
   * the rider HAS expressed this intent.
   */
  readonly autoShareRidesSetAt?: string | null;
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

  // shareTripsPublicly <-> auto_share_rides. Gated on the STAMP, not on the
  // value being present — the column is NOT NULL, so "does the server hold a
  // value" is always true here and would hand every account's never-chosen
  // default authority over the one flag the rider could actually set. The
  // stamp is the only thing that distinguishes a choice from a default.
  //
  // Both directions matter, and they are the same bug pointed opposite ways:
  // an unstamped server `false` over a device `true` hides a rider who has
  // been sharing for months (the product owner, 245 shares); an unstamped
  // server `true` over a device `false` re-opts in a rider who turned sharing
  // off (error-log #81). Neither is acceptable, so neither happens — local
  // wins exactly until someone sets it, and the server owns it forever after.
  if (remote.autoShareRidesSetAt && typeof remote.autoShareRides === 'boolean') {
    hydrate.shareTripsPublicly = remote.autoShareRides;
  } else {
    push.shareTripsPublicly = local.shareTripsPublicly;
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

/**
 * Translate a `push` plan (store keys) into the `PATCH /v1/profile` body
 * (wire keys).
 *
 * Only one key actually differs — `shareTripsPublicly` -> `autoShareRides` —
 * but it differs in a way nothing would catch: `profileUpdateRequestSchema` is
 * `additionalProperties: false` while Fastify's ajv defaults to
 * `removeAdditional: true`, so sending the store key would be SILENTLY
 * STRIPPED and the sync would look like it worked. Keeping the mapping here
 * means every caller gets it right, and a future renamed field has one place
 * to be handled.
 */
export const toProfileUpdatePayload = (
  push: Partial<LocalNotificationPrefs>,
): Record<string, unknown> => {
  const { shareTripsPublicly, ...rest } = push;
  return shareTripsPublicly === undefined
    ? { ...rest }
    : { ...rest, autoShareRides: shareTripsPublicly };
};
