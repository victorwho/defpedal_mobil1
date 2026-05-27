/**
 * Quiz country detection.
 *
 * The daily safety quiz serves one of two static question pools (RO or ES).
 * Picking the right pool for each rider is a small composite policy:
 *
 *   1. **User override wins.** A `'RO'` / `'ES'` preference from the Profile
 *      picker short-circuits everything — expats, tourists, and testers can
 *      pin their region.
 *   2. **GPS bbox lookup.** When the preference is `'auto'`, classify the
 *      caller's coords against axis-aligned bounding boxes for the supported
 *      countries (mainland Romania, mainland Spain + Balearic Islands, Canary
 *      Islands).
 *   3. **Device-locale region.** When GPS is unavailable (permission denied,
 *      pre-first-fix), use the device locale's region code as a hint.
 *   4. **Default to `'RO'`.** Romania is the launched country with deeper
 *      content coverage, so it's the safer fallback when nothing else can
 *      narrow it down.
 *
 * Bbox note vs `countryCoverage.ts`
 * --------------------------------
 * `countryCoverage` ships a similar-looking constant for routing dispatch, but
 * the two intentionally differ:
 *
 *   - Routing must reject Canary Islands today (no OSRM data shipped for the
 *     archipelago).
 *   - The quiz, in contrast, has nothing to do with OSRM — a rider in Las
 *     Palmas should still get Spanish content. So we widen ES here with a
 *     second bbox for the Canary group.
 *
 * The two layers are kept separate on purpose: tightening routing coverage
 * later (e.g. excluding a contested border strip) must not silently change
 * which quiz pool a rider sees.
 *
 * All helpers are pure, deterministic, and sync — safe to call on every render.
 */

/** Supported quiz pools. */
export type QuizCountry = 'RO' | 'ES';

/** User preference from Profile > Display > Quiz region. */
export type QuizCountryPreference = 'auto' | QuizCountry;

/** What signal produced the resolved country (telemetry / debug surface). */
export type QuizCountrySource = 'override' | 'gps' | 'locale' | 'default';

interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
}

/**
 * Quiz country bounding boxes.
 *
 * - RO: mainland Romania (Timișoara → Constanța, Bucharest → Maramureș).
 * - ES (mainland): Iberian peninsula + Balearic Islands (Galicia → Catalonia,
 *   Andalusia → Cantabria, Mallorca / Ibiza / Menorca).
 * - ES (Canary): Gran Canaria / Tenerife / Lanzarote / Fuerteventura / La
 *   Palma / La Gomera / El Hierro. Intentionally included for quiz purposes
 *   even though the routing layer excludes it.
 *
 * Ranges are loose by a fraction of a degree on each side to absorb GPS noise
 * at the borders without bleeding into a neighboring country.
 */
export const QUIZ_COUNTRY_BBOXES: {
  readonly RO: readonly BoundingBox[];
  readonly ES: readonly BoundingBox[];
} = {
  RO: [
    { minLat: 43.6, maxLat: 48.3, minLon: 20.2, maxLon: 29.7 },
  ],
  ES: [
    // Mainland + Balearics
    { minLat: 36.0, maxLat: 43.8, minLon: -9.3, maxLon: 3.3 },
    // Canary Islands
    { minLat: 27.6, maxLat: 29.5, minLon: -18.2, maxLon: -13.4 },
  ],
};

const isInBbox = (lat: number, lon: number, bbox: BoundingBox): boolean =>
  lat >= bbox.minLat &&
  lat <= bbox.maxLat &&
  lon >= bbox.minLon &&
  lon <= bbox.maxLon;

/**
 * Resolve a single coordinate to a quiz country.
 *
 * Returns `null` when:
 * - Either coordinate is `null` (no GPS fix yet).
 * - The pair sits outside every supported bbox (e.g. Paris, Berlin, mid-Atlantic).
 * - The pair is non-finite (NaN / Infinity from a misbehaving sensor).
 */
export const resolveQuizCountryFromCoords = (
  lat: number | null,
  lon: number | null,
): QuizCountry | null => {
  if (lat === null || lon === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  for (const country of ['RO', 'ES'] as const) {
    for (const bbox of QUIZ_COUNTRY_BBOXES[country]) {
      if (isInBbox(lat, lon, bbox)) return country;
    }
  }
  return null;
};

interface ResolveQuizCountryInput {
  readonly preference: QuizCountryPreference;
  readonly coords: { readonly lat: number; readonly lon: number } | null;
  /**
   * The two-letter region code from the device locale (e.g. `'RO'`, `'ES'`,
   * `'US'`). Pass `null` if the device locale doesn't carry a region segment.
   * Case-insensitive; lowercase / mixed-case input is normalized.
   */
  readonly deviceLocaleRegion: string | null;
}

/**
 * Composite quiz-country resolution.
 *
 * Always returns a concrete `QuizCountry` — never `null`. See the file header
 * for the policy.
 */
export const resolveQuizCountry = (
  input: ResolveQuizCountryInput,
): { country: QuizCountry; source: QuizCountrySource } => {
  // 1. Manual override always wins.
  if (input.preference === 'RO' || input.preference === 'ES') {
    return { country: input.preference, source: 'override' };
  }

  // 2. GPS bbox lookup.
  if (input.coords) {
    const fromGps = resolveQuizCountryFromCoords(input.coords.lat, input.coords.lon);
    if (fromGps !== null) {
      return { country: fromGps, source: 'gps' };
    }
  }

  // 3. Device-locale region hint.
  const region = input.deviceLocaleRegion?.trim().toUpperCase() ?? null;
  if (region === 'RO' || region === 'ES') {
    return { country: region, source: 'locale' };
  }

  // 4. Launch-country fallback.
  return { country: 'RO', source: 'default' };
};
