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
 */
const RISK_BUCKETS: readonly RiskBucket[] = [
  { maxScore: 0,     color: '#3b82f6', label: 'No data',    midpoint: 0 },
  { maxScore: 33,    color: '#4CAF50', label: 'Very safe',   midpoint: 16 },
  { maxScore: 43.5,  color: '#8BC34A', label: 'Safe',        midpoint: 38 },
  { maxScore: 51.8,  color: '#FFEB3B', label: 'Average',     midpoint: 48 },
  { maxScore: 57.6,  color: '#FF9800', label: 'Elevated',    midpoint: 55 },
  { maxScore: 69,    color: '#FF5722', label: 'Risky',       midpoint: 63 },
  { maxScore: 101.8, color: '#F44336', label: 'Very risky',  midpoint: 85 },
  { maxScore: Infinity, color: '#000000', label: 'Extreme',  midpoint: 110 },
];

const classifyRiskScore = (score: number): RiskBucket => {
  for (const bucket of RISK_BUCKETS) {
    if (score <= bucket.maxScore) return bucket;
  }
  return RISK_BUCKETS[RISK_BUCKETS.length - 1];
};

type RiskFeatureProperties = {
  risk_score?: number;
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
