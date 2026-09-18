/**
 * Tree-canopy comparison between a shade route and the standard safe route.
 *
 * The shade OSRM instance exposes `GET /compare?from=lon,lat&to=lon,lat`,
 * which routes the same pair on both the shade and the standard graph and
 * reports how much of each falls under tree canopy. This module is the SINGLE
 * reader of that response — everything the UI is allowed to say about canopy
 * comes through `parseCanopyCompareResponse`, and nothing else derives it.
 *
 * WHY A PARSER RATHER THAN READING THE JSON AT THE CALL SITE
 * ---------------------------------------------------------
 * Four of the five display rules are really *parse* rules, and each of them
 * fails silently if it is left to a call site to remember:
 *
 *  - `display: false` means the server judged its own coverage too thin to
 *    present. A caller that reads `shade.tree_pct` directly gets a real
 *    number back and has no reason to suspect it should not be shown.
 *  - `code` is `"Ok"`, `"NoRoute"` or `"TooLong"` at HTTP 200. Status alone
 *    does not separate an answer from a refusal (the same trap as
 *    error-log #117 on the routing endpoint).
 *  - The two percentages are only ever meaningful as ABSOLUTE values. A
 *    shade route can legitimately score lower than the standard one, so any
 *    relative figure ("X% more shade") goes negative on real data. Returning
 *    two independent numbers, and no delta, means there is nothing to invert.
 *  - The claim is TREE COVER, never temperature. `coverage_pct` (how much of
 *    the route had canopy data) and `distance_m` are deliberately dropped
 *    here rather than carried and trusted not to be rendered.
 *
 * Every failure shape — a refusal code, `display: false`, a malformed body,
 * a value outside 0-100 — returns `null`, which callers render as nothing.
 */

/**
 * What the UI may show about canopy: two absolute percentages, no delta.
 *
 * Deliberately has no field for a difference, a ratio, or a temperature —
 * those are the claims that are not supported by this data.
 */
export interface RouteCanopyComparison {
  /** Percent of the shade route under tree canopy. */
  readonly shadeTreePct: number;
  /** Percent of the standard safe route under tree canopy. */
  readonly standardTreePct: number;
}

/** A percentage the server could plausibly have measured. */
const isValidPct = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;

/**
 * Read a `/compare` response body.
 *
 * Returns `null` for every case where nothing should be shown: a non-`Ok`
 * code (`NoRoute`, `TooLong`), `display !== true`, a body that does not carry
 * two usable percentages, or anything unrecognised. Never throws — a shape
 * this does not understand is a reason to show nothing, not to fail a route.
 */
export const parseCanopyCompareResponse = (
  body: unknown,
): RouteCanopyComparison | null => {
  if (typeof body !== 'object' || body === null) return null;
  const payload = body as Record<string, unknown>;

  // NoRoute / TooLong arrive at HTTP 200 alongside Ok.
  if (payload.code !== 'Ok') return null;

  // The server's own judgement that its coverage is good enough to present.
  // Strict `=== true`: a missing flag is not consent.
  if (payload.display !== true) return null;

  const shade = payload.shade as Record<string, unknown> | undefined;
  const standard = payload.safe as Record<string, unknown> | undefined;
  if (typeof shade !== 'object' || shade === null) return null;
  if (typeof standard !== 'object' || standard === null) return null;

  const shadeTreePct = shade.tree_pct;
  const standardTreePct = standard.tree_pct;
  if (!isValidPct(shadeTreePct) || !isValidPct(standardTreePct)) return null;

  return { shadeTreePct, standardTreePct };
};

/**
 * Smallest canopy gain, in percentage points, worth putting a number on.
 *
 * MEASURED, not chosen for feel (2026-09-18, 18 usable probes across five
 * cities x four start points each — Bucharest, Berlin, Madrid, Amsterdam,
 * Brasov):
 *
 *   shade route carries MORE canopy : 8/18
 *   the two routes tie exactly      : 8/18   <- the shade router picked the
 *   shade route carries LESS        : 2/18      same roads, difference 0.0
 *
 * So on more than half of real routes there is no gain to report at all, and
 * two of the eight "wins" were under a single point. A card claiming a win
 * below this threshold would be reporting the router's rounding as a benefit.
 *
 * The two losses were -0.2 and -0.7 points, i.e. also inside this band, which
 * is why `similar` covers small differences in BOTH directions.
 */
export const CANOPY_MEANINGFUL_POINTS = 1;

/**
 * What may be CLAIMED about a canopy comparison.
 *
 * Three outcomes, because the honest thing to say changes shape:
 *
 *  - `gain`     the shade route carries meaningfully more canopy. `pointsMore`
 *               is a PERCENTAGE-POINT difference (73% of the ride vs 46% of
 *               the ride -> 27), never a relative increase. Relative would
 *               read "+58%" for that same pair, and on a low base it inflates
 *               absurdly: 2% vs 1% of a ride is "+100% more shade" for a ride
 *               that is 98% in the sun.
 *  - `similar`  the difference is inside the noise band, in either direction.
 *  - `no_gain`  the shade route carries meaningfully LESS canopy. Deliberately
 *               carries no number: there is no honest headline for this case,
 *               and the caller falls back to stating both absolute figures.
 *               A signed delta here would render as negative shade, which is
 *               the one thing this comparison must never say.
 */
export type CanopyVerdict =
  | { readonly kind: 'gain'; readonly pointsMore: number }
  | { readonly kind: 'similar' }
  | { readonly kind: 'no_gain' };

/**
 * Classify a comparison into the claim that can be made about it.
 *
 * Pure and total: every input maps to exactly one verdict, and no verdict can
 * carry a negative number.
 */
export const describeCanopyComparison = (
  comparison: RouteCanopyComparison,
): CanopyVerdict => {
  const difference = comparison.shadeTreePct - comparison.standardTreePct;
  if (difference >= CANOPY_MEANINGFUL_POINTS) {
    // Rounded here so the headline and the threshold agree: a 1.4-point gain
    // must not render as "+1% more shade" while a 1.6-point one renders "+2%".
    return { kind: 'gain', pointsMore: Math.round(difference) };
  }
  if (difference > -CANOPY_MEANINGFUL_POINTS) return { kind: 'similar' };
  return { kind: 'no_gain' };
};

/**
 * Render one canopy percentage for display.
 *
 * One decimal place, with a trailing `.0` dropped so the server's `29.0`
 * reads as `29` while `28.6` keeps its precision. Matches the plain
 * dot-decimal formatting used everywhere else in the app (`toFixed`), which
 * is not locale-aware anywhere, so this is not the place to start.
 */
export const formatTreePct = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};
