/**
 * App-level availability gate (distinct from OSRM routing coverage in
 * `countryCoverage.ts`). Routing coverage answers "can we compute a safe
 * route between these two points?" — this module answers "is Defensive Pedal
 * available in the rider's country at all?".
 *
 * The Play/App Store listings are open worldwide; new installs outside this
 * list see the onboarding region gate (country picker + email waitlist) and
 * may still continue with Mapbox fallback routing (soft gate, product
 * decision 2026-07-12).
 */

/**
 * ISO 3166-1 alpha-2 codes where the app is considered available: the 27 EU
 * member states, the EEA (Iceland, Liechtenstein, Norway), Switzerland and
 * the United Kingdom — the countries the OSRM routing deployment covers.
 *
 * The UK joined 2026-09-21 with the b47v1 routing generation (Great Britain
 * added to the graph; Northern Ireland was already routed inside the
 * Ireland extract), which shipped with UK risk data on the same day. The
 * Crown Dependencies (Isle of Man IM, Jersey JE, Guernsey GG) are separate
 * ISO codes and are NOT in the graph, so they stay outside this list.
 */
export const SUPPORTED_APP_COUNTRIES: ReadonlySet<string> = new Set([
  // EU-27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA
  'IS', 'LI', 'NO',
  // Bilateral
  'CH',
  // United Kingdom (b47v1, 2026-09-21)
  'GB',
]);

/**
 * Normalize a raw country string (device geocoder output, user input) to a
 * canonical ISO 3166-1 alpha-2 code. Returns `null` when the input is not a
 * two-letter code. The informal `UK` alias (returned by some Android
 * geocoder implementations) is mapped to `GB`.
 */
export const normalizeCountryCode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === 'UK') return 'GB';
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
};

/**
 * Whether the app is available in the given country. Case-insensitive;
 * `null`/malformed input is treated as unsupported (the UI then falls back
 * to the manual country picker rather than silently passing the gate).
 */
export const isAppCountrySupported = (raw: string | null | undefined): boolean => {
  const code = normalizeCountryCode(raw);
  return code !== null && SUPPORTED_APP_COUNTRIES.has(code);
};
