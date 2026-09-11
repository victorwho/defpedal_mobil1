/**
 * First-party operational telemetry: "this user opened the app".
 *
 * Deliberately NOT part of the product-analytics stack. PostHog is
 * consent-gated, so counting active users through it was impossible for anyone
 * who opted out — and since the opt-out flag is never reported to the server,
 * the size of that blind spot was not knowable either. Measured 2026-09-11:
 * 107 of 209 users with server-side proof of app use had no PostHog event under
 * their own id (docs/reviews/active-user-counting-2026-09-11.md).
 *
 * ⚠️ Lawful basis is legitimate interest (GDPR Art 6(1)(f)) for operating and
 * sizing the service — the same footing the app already uses for Sentry crash
 * reports. That holds only while the data stays minimal, so this module writes
 * ONE row with no location, no device identifier, no screen and no behaviour.
 * `properties` is left empty on purpose. If you are here to add a field that
 * says what the rider DID, that is a privacy decision, not a schema tweak: it
 * needs the Privacy Policy updated in the same change.
 */
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Events this endpoint will accept.
 *
 * An allowlist, not free text. The table's CHECK constraint enforces the same
 * set at the database, so a mismatch fails loudly here rather than silently
 * widening what we collect.
 */
export const ACCEPTED_DEVICE_EVENTS = ['app_open'] as const;
export type DeviceTelemetryEvent = (typeof ACCEPTED_DEVICE_EVENTS)[number];

export type DeviceTelemetryWrite = {
  readonly event: DeviceTelemetryEvent;
  readonly sessionId?: string | null;
  readonly appEnvironment?: string | null;
  readonly appVersion?: string | null;
  readonly appPlatform?: string | null;
};

export type DeviceTelemetryResult = { readonly recorded: boolean };

/**
 * Record one app open.
 *
 * Note what is NOT a parameter: a timestamp. `created_at` takes the column
 * default, i.e. server time, because a device clock that is wrong by hours
 * would move a user across a day boundary and corrupt the only number this
 * table exists to produce.
 *
 * Never throws. An unrecorded open costs one row in a count; a 5xx here would
 * surface as an error on a path the rider did not ask for, and the caller
 * fires this without awaiting anything.
 */
export const recordDeviceTelemetry = async (
  write: DeviceTelemetryWrite,
  userId: string,
): Promise<DeviceTelemetryResult> => {
  if (!supabaseAdmin) return { recorded: false };

  const { error } = await supabaseAdmin.from('user_telemetry_events').insert([
    {
      user_id: userId,
      event_type: write.event,
      session_id: write.sessionId ?? null,
      app_environment: write.appEnvironment ?? null,
      app_version: write.appVersion ?? null,
      app_platform: write.appPlatform ?? null,
      // properties intentionally omitted — the column defaults to '{}'.
    },
  ]);

  return { recorded: !error };
};
