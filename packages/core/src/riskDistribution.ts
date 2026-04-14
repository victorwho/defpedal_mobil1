import type { RiskSegment } from './contracts';

export interface RiskCategory {
  readonly label: string;
  readonly color: string;
}

export interface RiskDistributionEntry {
  readonly category: RiskCategory;
  readonly distanceMeters: number;
  readonly percentage: number;
}

/**
 * Canonical order of risk categories for display (safest → most dangerous).
 * Score thresholds are server-side only; the client uses the `riskCategory`
 * label returned per segment to classify.
 */
export const RISK_CATEGORY_ORDER: readonly string[] = [
  'No data',
  'Very safe',
  'Safe',
  'Average',
  'Elevated',
  'Risky',
  'Very risky',
  'Extreme',
] as const;

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance between two [lon, lat] coordinate pairs. */
const haversineMeters = (
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number => {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Compute the total length of a segment geometry in meters. */
const segmentDistanceMeters = (segment: RiskSegment): number => {
  const coords =
    segment.geometry.type === 'MultiLineString'
      ? segment.geometry.coordinates.flat()
      : segment.geometry.coordinates;

  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1] as [number, number];
    const [lon2, lat2] = coords[i] as [number, number];
    total += haversineMeters(lon1, lat1, lon2, lat2);
  }

  return total;
};

/**
 * Compute the distance-weighted risk distribution for a set of risk segments.
 *
 * Uses the server-provided `riskCategory` and `color` per segment — no local
 * score thresholds needed. Returns categories sorted safest → most dangerous
 * (matching `RISK_CATEGORY_ORDER`).
 */
export const computeRiskDistribution = (
  riskSegments: readonly RiskSegment[],
): readonly RiskDistributionEntry[] => {
  if (riskSegments.length === 0) {
    return [];
  }

  // Accumulate distance per category label
  const buckets = new Map<string, { distance: number; color: string }>();

  for (const segment of riskSegments) {
    const label = segment.riskCategory ?? 'No data';
    const distance = segmentDistanceMeters(segment);
    const existing = buckets.get(label);
    buckets.set(label, {
      distance: (existing?.distance ?? 0) + distance,
      color: existing?.color ?? segment.color,
    });
  }

  const totalDistance = [...buckets.values()].reduce((sum, b) => sum + b.distance, 0);

  if (totalDistance === 0) {
    return [];
  }

  // Sort by canonical order, then return only non-zero entries
  return RISK_CATEGORY_ORDER
    .filter((label) => buckets.has(label))
    .map((label) => {
      const { distance, color } = buckets.get(label)!;
      return {
        category: { label, color },
        distanceMeters: distance,
        percentage: Math.round((distance / totalDistance) * 100),
      };
    });
};
