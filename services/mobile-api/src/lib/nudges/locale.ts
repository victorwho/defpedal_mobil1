/**
 * Per-user push locale resolution.
 *
 * `profiles.preferred_locale` is synced from the device by the mobile client
 * (nullable — older builds never write it). Anything unknown falls back to
 * English: the EN pedalVoice catalog is verified geography-neutral, so it is
 * always a safe default (review 2026-08-13 G-11 — before this column every
 * dispatch hardcoded 'en' and the commissioned RO/ES catalogs never reached
 * riders).
 */
export type NudgeLocale = 'en' | 'ro' | 'es';

/**
 * Permissive on purpose: accepts region tags ("es-ES"/"ro_RO" → base
 * language) and any non-string shape, so a future client writing full BCP-47
 * tags can never silently force English. Single implementation — the
 * first-ride notification stack's `normalizeFirstRideLocale` delegates here.
 */
export const toNudgeLocale = (value: unknown): NudgeLocale => {
  if (typeof value !== 'string') return 'en';
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return base === 'ro' || base === 'es' ? base : 'en';
};
