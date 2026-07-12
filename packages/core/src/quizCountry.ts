/**
 * Quiz country detection.
 *
 * The daily safety quiz serves one of three static question pools: RO
 * (Romanian law + local context), ES (Spanish law + local context), or
 * GENERIC (country-agnostic questions that are generally true everywhere —
 * added with the global availability gate, 2026-07-12, so a rider in Berlin
 * or Boston never gets asked about the Codul Rutier). Picking the right pool
 * is a small composite policy:
 *
 *   1. **User override wins.** A `'RO'` / `'ES'` preference from the Profile
 *      picker short-circuits everything — expats, tourists, and testers can
 *      pin their region.
 *   2. **GPS bbox lookup.** When the preference is `'auto'`, classify the
 *      caller's coords against axis-aligned bounding boxes for RO and ES
 *      (mainland Romania; mainland Spain + Balearics + Canary Islands). A
 *      valid GPS fix OUTSIDE both is a *reliable* "not RO/ES" answer — that
 *      rider gets `'GENERIC'`, because serving them RO law would be wrong,
 *      not merely imprecise.
 *   3. **Device-locale region.** When GPS is unavailable (permission denied,
 *      pre-first-fix), an RO/ES device region still selects the matching
 *      country content.
 *   4. **Default to `'GENERIC'`.** When nothing can place the rider, serve
 *      the questions that are true everywhere rather than gambling on a
 *      country's law. (Pre-gate this defaulted to `'RO'`.)
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

/** Supported quiz pools. GENERIC = country-agnostic, generally-true content. */
export type QuizCountry = 'RO' | 'ES' | 'GENERIC';

/**
 * User preference from Profile > Display > Quiz region. Only the two
 * country pools are pinnable — 'auto' already resolves to GENERIC whenever
 * the rider isn't placeable in RO/ES, so a GENERIC pin adds nothing.
 */
export type QuizCountryPreference = 'auto' | 'RO' | 'ES';

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

  // 2. GPS bbox lookup. A valid fix INSIDE an RO/ES box selects that
  //    country's content; a valid fix OUTSIDE both is a reliable "the rider
  //    is somewhere else" — serve the generally-true pool rather than a
  //    country's law that doesn't apply where they ride.
  if (input.coords && Number.isFinite(input.coords.lat) && Number.isFinite(input.coords.lon)) {
    const fromGps = resolveQuizCountryFromCoords(input.coords.lat, input.coords.lon);
    return { country: fromGps ?? 'GENERIC', source: 'gps' };
  }

  // 3. Device-locale region hint (no GPS available).
  const region = input.deviceLocaleRegion?.trim().toUpperCase() ?? null;
  if (region === 'RO' || region === 'ES') {
    return { country: region, source: 'locale' };
  }

  // 4. Nothing can place the rider — serve the questions that are true
  //    everywhere.
  return { country: 'GENERIC', source: 'default' };
};
