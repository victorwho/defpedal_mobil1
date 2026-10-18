/**
 * A starting username for the post-signup step, so it is one tap to accept
 * (docs/plans/onboarding-first-ride.md [D5]). Built from the account's
 * display name, else the email's local part, else `rider_NNNN`.
 *
 * Output always satisfies the screen's rule `^[a-zA-Z0-9_]{3,30}$`. It is a
 * suggestion, not a reservation: a taken name still fails on submit with the
 * normal "already taken" message.
 */

/** U+0300–U+036F, the combining diacritical marks `NFD` splits off. */
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/**
 * Strip accents where the runtime can. Hermes' `normalize` support has varied
 * by build (see core bikeTypes.ts), so a failure just leaves the accents, which
 * the next step turns into `_` — still a valid name, never a crash.
 */
const stripAccents = (raw: string): string => {
  try {
    return raw.normalize('NFD').replace(COMBINING_MARKS, '');
  } catch {
    return raw;
  }
};

const fold = (raw: string): string =>
  stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
    .replace(/_+$/g, '');

export const suggestUsername = (
  displayName: string | null | undefined,
  email: string | null | undefined,
  random: () => number = Math.random,
): string => {
  for (const source of [displayName, email?.split('@')[0]]) {
    if (!source) continue;
    const candidate = fold(source);
    if (candidate.length >= 3) return candidate;
  }
  return `rider_${String(Math.floor(random() * 10000)).padStart(4, '0')}`;
};
