import type {
  GeoJsonFeatureCollection,
  GeoJsonLineString,
  RiskSegment,
} from '@defensivepedal/core';
import type { BaseLogger } from 'pino';

import { supabaseAdmin } from './supabaseAdmin';

type MinimalLogger = Pick<BaseLogger, 'error' | 'warn'>;

const fallbackLogger: MinimalLogger = {
  error: (obj: unknown, msg?: string, ...args: unknown[]) => {
    console.error(msg ?? obj, ...args);
  },
  warn: (obj: unknown, msg?: string, ...args: unknown[]) => {
    console.warn(msg ?? obj, ...args);
  },
};

/** Risk bucket: score thresholds, display color, category label, and quantized midpoint. */
interface RiskBucket {
  readonly maxScore: number;
  readonly color: string;
  readonly label: string;
  readonly midpoint: number;
}

/**
 * Risk buckets — the ONLY place score thresholds are defined.
 * These are server-side only; the client receives category labels + colors.
 *
 * Re-anchored 2026-09-04 for the b46v1 score generation (OSRM_Server repo,
 * BAND_REANCHOR_B46V1.md): the validated claim structure is THREE tiers
 * (Safer <42 / Typical 42-80 / High risk >80); the extra buckets within a
 * tier are display shades only (hue changes at tier cuts, lightness within).
 * All user-facing language groups by `label` (the tier); never present two
 * shades of the same tier as different risk levels.
 */
const RISK_BUCKETS: readonly RiskBucket[] = [
  { maxScore: 0,     color: '#3b82f6', label: 'No data',   midpoint: 0 },
  // Safer tier (<42)
  { maxScore: 32,    color: '#2E9E43', label: 'Safer',     midpoint: 16 },
  { maxScore: 42,    color: '#79BC4E', label: 'Safer',     midpoint: 37 },
  // Typical tier (42-80)
  { maxScore: 50,    color: '#EFD124', label: 'Typical',   midpoint: 46 },
  { maxScore: 60,    color: '#EDB320', label: 'Typical',   midpoint: 55 },
  { maxScore: 70,    color: '#E8921B', label: 'Typical',   midpoint: 65 },
  { maxScore: 80,    color: '#E17114', label: 'Typical',   midpoint: 75 },
  // High-risk tier (>80)
  { maxScore: 90,    color: '#D5482D', label: 'High risk', midpoint: 85 },
  { maxScore: 105,   color: '#BB2B20', label: 'High risk', midpoint: 97 },
  { maxScore: 130,   color: '#851D16', label: 'High risk', midpoint: 117 },
  { maxScore: Infinity, color: '#000000', label: 'High risk', midpoint: 150 },
];

const classifyRiskScore = (score: number): RiskBucket => {
  for (const bucket of RISK_BUCKETS) {
    if (score <= bucket.maxScore) return bucket;
  }
  return RISK_BUCKETS[RISK_BUCKETS.length - 1];
};

type RiskFeatureProperties = {
  risk_score?: number;
  riskScore?: number;
};

/**
 * Enrich a raw road-risk GeoJSON FeatureCollection (as returned by the
 * `get_road_risk_geojson` Supabase RPC, which only carries `riskScore` per
 * feature) with the same server-side bucket mapping used for `/risk-segments`:
 * a quantized score, a category label, and the display colour.
 *
 * This keeps the score thresholds server-side only (security principle from
 * the 2026-04-13 hardening) while giving the client everything it needs to
 * paint the map directly via `lineColor: ['get', 'color']`.
 */
export const enrichRiskGeoJson = (
  raw: GeoJsonFeatureCollection<any, RiskFeatureProperties> | null | undefined,
): GeoJsonFeatureCollection<any, { riskScore: number; riskCategory: string; color: string }> => {
  if (!raw || !Array.isArray(raw.features)) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: raw.features.map((feature) => {
      const rawScore = Number(feature.properties?.riskScore ?? feature.properties?.risk_score ?? 0);
      const bucket = classifyRiskScore(rawScore);
      return {
        ...feature,
        properties: {
          riskScore: bucket.midpoint,
          riskCategory: bucket.label,
          color: bucket.color,
        },
      };
    }),
  };
};

export const fetchRiskSegments = async (
  routeGeometry: GeoJsonLineString,
  logger: MinimalLogger = fallbackLogger,
): Promise<RiskSegment[]> => {
  if (!supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc('get_segmented_risk_route', {
    route_geojson: routeGeometry,
  });

  if (error) {
    logger.error({ code: error.code }, '[risk] Supabase RPC error: %s', error.message);
    return [];
  }

  if (!data) {
    logger.warn('[risk] Supabase RPC returned null/undefined data');
    return [];
  }

  const featureCollection =
    data as GeoJsonFeatureCollection<any, RiskFeatureProperties>;

  return featureCollection.features.map((feature, index) => {
    const rawScore = Number(feature.properties?.risk_score ?? 0);
    const bucket = classifyRiskScore(rawScore);

    return {
      id: `risk-${index}`,
      riskScore: bucket.midpoint,
      riskCategory: bucket.label,
      color: bucket.color,
      geometry: feature.geometry,
    };
  });
};
