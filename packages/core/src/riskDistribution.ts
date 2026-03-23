import type { RiskSegment } from './contracts';

export interface RiskCategory {
  readonly label: string;
  readonly minScore: number;
  readonly maxScore: number;
  readonly color: string;
}

export interface RiskDistributionEntry {
  readonly category: RiskCategory;
  readonly distanceMeters: number;
  readonly percentage: number;
}

export const RISK_CATEGORIES: readonly RiskCategory[] = [
  { label: 'Very safe', minScore: -Infinity, maxScore: 30, color: '#4CAF50' },
  { label: 'Safe', minScore: 30, maxScore: 43.5, color: '#8BC34A' },
  { label: 'Average', minScore: 43.5, maxScore: 51.8, color: '#FFEB3B' },
  { label: 'Elevated', minScore: 51.8, maxScore: 57.6, color: '#FF9800' },
  { label: 'Risky', minScore: 57.6, maxScore: 69, color: '#FF5722' },
  { label: 'Very risky', minScore: 69, maxScore: 101.8, color: '#F44336' },
  { label: 'Extreme', minScore: 101.8, maxScore: Infinity, color: '#000000' },
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

const classifyScore = (score: number): RiskCategory =>
  RISK_CATEGORIES.find(
    (cat) => score >= cat.minScore && score < cat.maxScore,
  ) ?? RISK_CATEGORIES[RISK_CATEGORIES.length - 1];

/**
 * Compute the distance-weighted risk distribution for a set of risk segments.
 *
 * Returns only categories that have a non-zero share, sorted from safest to
 * most dangerous (matching the order of `RISK_CATEGORIES`).
 */
export const computeRiskDistribution = (
  riskSegments: readonly RiskSegment[],
): readonly RiskDistributionEntry[] => {
  if (riskSegments.length === 0) {
    return [];
  }

  const buckets = new Map<RiskCategory, number>();

  for (const segment of riskSegments) {
    const category = classifyScore(segment.riskScore);
    const distance = segmentDistanceMeters(segment);
    buckets.set(category, (buckets.get(category) ?? 0) + distance);
  }

  const totalDistance = [...buckets.values()].reduce((sum, d) => sum + d, 0);

  if (totalDistance === 0) {
    return [];
  }

  return RISK_CATEGORIES.filter((cat) => (buckets.get(cat) ?? 0) > 0).map(
    (cat) => {
      const distance = buckets.get(cat) ?? 0;
      return {
        category: cat,
        distanceMeters: distance,
        percentage: Math.round((distance / totalDistance) * 100),
      };
    },
  );
};
