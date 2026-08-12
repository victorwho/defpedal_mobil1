import type { RiskSegment } from './contracts';
import { riskSegmentDistanceMeters } from './riskDistribution';

/**
 * Category labels that count as a "busy road" stretch for the honest-stretch
 * callout on route preview. Uses the server-provided `riskCategory` labels —
 * score thresholds stay server-side only (2026-04-13 hardening).
 *
 * Deliberately only the top two bands: firing on 'Risky' as well would make
 * the warning common enough to become noise, and the callout's copy ("no
 * calmer alternative here") should be reserved for stretches the safe router
 * genuinely could not avoid.
 */
const BUSY_ROAD_CATEGORIES: ReadonlySet<string> = new Set([
  'Very risky',
  'Extreme',
]);

/**
 * Length in meters of the longest contiguous run of high-risk segments along
 * a route. Segments are assumed to be ordered along the route geometry (as
 * returned by `/v1/risk-segments`). Returns 0 when no high-risk segments
 * exist.
 */
export const longestHighRiskStretchMeters = (
  riskSegments: readonly RiskSegment[],
): number => {
  let longest = 0;
  let current = 0;

  for (const segment of riskSegments) {
    if (BUSY_ROAD_CATEGORIES.has(segment.riskCategory)) {
      current += riskSegmentDistanceMeters(segment);
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 0;
    }
  }

  return longest;
};
