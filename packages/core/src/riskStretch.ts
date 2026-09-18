import type { RiskSegment } from './contracts';
import { riskSegmentDistanceMeters } from './riskDistribution';

/**
 * Category labels that count as a "busy road" stretch for the honest-stretch
 * callout on route preview. Uses the server-provided `riskCategory` labels —
 * score thresholds stay server-side only (2026-04-13 hardening).
 *
 * Since the 2026-09-04 band re-anchoring this is exactly the 'High risk'
 * tier (score >80 on the b46v1 scale) — the one tier with a validated
 * severity claim. Firing on 'Typical' as well would make the warning common
 * enough to become noise, and the callout's copy ("no calmer alternative
 * here") should be reserved for stretches the safe router genuinely could
 * not avoid.
 */
const BUSY_ROAD_CATEGORIES: ReadonlySet<string> = new Set([
  'High risk',
]);

/**
 * Minimum busy-road saving, in metres, worth quoting to the rider.
 *
 * ⚠️ NOT measured against real routes, unlike the canopy threshold. Quoting a
 * safe-vs-fast saving needs the risk API, which is authenticated, so no probe
 * was run. 150 m matches `BUSY_STRETCH_MIN_M`, the length at which this app
 * already considers a busy stretch worth mentioning at all — reusing that is a
 * consistent starting point, not a validated one. Measure it on real routes
 * before treating the number as tuned.
 */
export const BUSY_SAVING_MIN_METERS = 150;

/**
 * Metres of a route spent on busy roads.
 *
 * LENGTH-WEIGHTED, which is the whole point. The pre-existing safe-vs-fast
 * figure (`RouteComparison.diffPercent`) is an unweighted mean of segment
 * risk SCORES, so a 20 m segment at a junction counts the same as a 2 km
 * arterial. This counts metres, so it cannot be skewed by how the router
 * happened to chop the route up.
 *
 * Uses the shared `BUSY_ROAD_CATEGORIES`, so "busy" means exactly what it
 * means everywhere else in the app (error-log #20).
 */
export const busyRoadMeters = (
  riskSegments: readonly RiskSegment[],
): number =>
  riskSegments.reduce((total, segment) => {
    if (!BUSY_ROAD_CATEGORIES.has(segment.riskCategory)) return total;
    // `riskSegmentDistanceMeters` dereferences `geometry.type`, and the risk
    // response is consumed without per-item validation. A malformed segment
    // must cost this figure only — the caller computes it inside the
    // comparison's single try/catch, so an unguarded throw here would take
    // the whole safe-vs-fast verdict down with it.
    if (!segment.geometry) return total;
    return total + riskSegmentDistanceMeters(segment);
  }, 0);

/**
 * What may be CLAIMED about two routes' busy-road exposure.
 *
 * WHY THIS IS NOT "X% SAFER"
 * --------------------------
 * Two constraints from the risk model, both load-bearing:
 *
 *  - The TIER is the only level at which risk may be named or compared. A
 *    percentage derived from mean scores compares at a finer granularity than
 *    the validation supports. This stays at tier level: it counts metres in
 *    the 'High risk' tier and says nothing about any other.
 *  - The one validated claim is about SEVERITY, not frequency — a crash on a
 *    high-risk road is more likely to be SERIOUS. "30% safer" reads as "30%
 *    less likely to crash", which is the unvalidated frequency claim. Metres
 *    of exposure makes no probability claim at all: it says where the route
 *    goes, which the rider can also see on the map.
 *
 * `none` deliberately carries no number, so a safe route that happens to use
 * MORE busy road than the fast one cannot render as a negative saving.
 */
export type BusyRoadSaving =
  | { readonly kind: 'saves'; readonly metersSaved: number }
  | { readonly kind: 'none' };

/**
 * Classify the busy-road difference between the current route and the one it
 * was compared against. Pure and total; never produces a negative.
 */
export const describeBusyRoadSaving = (
  currentMeters: number,
  comparisonMeters: number,
): BusyRoadSaving => {
  const saved = comparisonMeters - currentMeters;
  return saved >= BUSY_SAVING_MIN_METERS
    ? { kind: 'saves', metersSaved: saved }
    : { kind: 'none' };
};

/**
 * Length in meters of the longest contiguous run of high-risk segments along
 * a route. Segments are assumed to be ordered along the route geometry (as
 * returned by `/v1/risk-segments`). Returns 0 when no high-risk segments
 * exist.
 */
export const longestHighRiskStretchMeters = (
  riskSegments: readonly RiskSegment[],
): number =>
  findHighRiskStretches(riskSegments).reduce(
    (longest, stretch) => Math.max(longest, stretch.lengthMeters),
    0,
  );

/**
 * One contiguous run of busy-road segments along a route.
 *
 * Powers the "Busy stretches" list on an imported GPX course, where we did not
 * choose the roads and so cannot route around them — the honest alternative is
 * to say exactly where the route gets dangerous and let the rider look at it.
 */
export interface HighRiskStretch {
  /** Index of the first segment of the run, into the input array. */
  readonly startIndex: number;
  /** Index of the last segment of the run (inclusive). */
  readonly endIndex: number;
  /** Total length of the run. */
  readonly lengthMeters: number;
  /** Along-route distance from the start of the route to where the run begins. */
  readonly distanceFromStartMeters: number;
  /** Category label shared by the run (all members are in the busy tier). */
  readonly category: string;
  /** A point inside the run, for panning a map to it. */
  readonly focus: { readonly lat: number; readonly lon: number };
}

/** First coordinate of a segment's geometry, as [lon, lat]. */
const firstCoordinate = (
  segment: RiskSegment,
): readonly [number, number] | null => {
  const coords =
    segment.geometry.type === 'MultiLineString'
      ? segment.geometry.coordinates.flat()
      : segment.geometry.coordinates;
  const first = coords[0];
  return Array.isArray(first) ? (first as [number, number]) : null;
};

/**
 * Every contiguous busy-road run along a route, in route order.
 *
 * Shares `BUSY_ROAD_CATEGORIES` with `longestHighRiskStretchMeters` — which is
 * now defined in terms of this function — so there is exactly one definition
 * of "busy" in the codebase. A second, private list at a feature's call site
 * is precisely the mistake error-log #20 records: it goes invisible to every
 * other surface and outlives the thing it encoded.
 *
 * Segments are assumed ordered along the route geometry, as `/v1/risk-segments`
 * returns them.
 */
export const findHighRiskStretches = (
  riskSegments: readonly RiskSegment[],
): HighRiskStretch[] => {
  const stretches: HighRiskStretch[] = [];

  let travelled = 0;
  let runStartIndex = -1;
  let runStartDistance = 0;
  let runLength = 0;

  const closeRun = (endIndex: number): void => {
    if (runStartIndex < 0) return;

    const anchor = riskSegments[runStartIndex]!;
    const coordinate = firstCoordinate(anchor);

    if (coordinate !== null) {
      stretches.push({
        startIndex: runStartIndex,
        endIndex,
        lengthMeters: runLength,
        distanceFromStartMeters: runStartDistance,
        category: anchor.riskCategory,
        focus: { lon: coordinate[0], lat: coordinate[1] },
      });
    }

    runStartIndex = -1;
    runLength = 0;
  };

  for (let i = 0; i < riskSegments.length; i++) {
    const segment = riskSegments[i]!;
    const length = riskSegmentDistanceMeters(segment);

    if (BUSY_ROAD_CATEGORIES.has(segment.riskCategory)) {
      if (runStartIndex < 0) {
        runStartIndex = i;
        runStartDistance = travelled;
      }
      runLength += length;
    } else {
      closeRun(i - 1);
    }

    travelled += length;
  }

  closeRun(riskSegments.length - 1);

  return stretches;
};
