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

const getRiskColor = (score: number): string => {
  if (score <= 0) return '#3b82f6';
  if (score < 33) return '#4CAF50';
  if (score < 43.5) return '#8BC34A';
  if (score < 51.8) return '#FFEB3B';
  if (score < 57.6) return '#FF9800';
  if (score < 69) return '#FF5722';
  if (score <= 101.8) return '#F44336';
  return '#000000';
};

/**
 * Quantize a raw risk score to its bucket midpoint.
 * Preserves category ordering and relative comparison but strips the precision
 * needed to reverse-engineer the scoring algorithm.
 */
const quantizeRiskScore = (score: number): number => {
  if (score <= 0) return 0;
  if (score < 33) return 16;
  if (score < 43.5) return 38;
  if (score < 51.8) return 48;
  if (score < 57.6) return 55;
  if (score < 69) return 63;
  if (score <= 101.8) return 85;
  return 110;
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
    const riskScore = Number(feature.properties?.risk_score ?? 0);

    return {
      id: `risk-${index}`,
      riskScore: quantizeRiskScore(riskScore),
      color: getRiskColor(riskScore),
      geometry: feature.geometry,
    };
  });
};
