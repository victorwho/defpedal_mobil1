import type {
  GeoJsonFeatureCollection,
  GeoJsonLineString,
  RiskSegment,
} from '@defensivepedal/core';

import { supabaseAdmin } from './supabaseAdmin';

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

type RiskFeatureProperties = {
  risk_score?: number;
};

export const fetchRiskSegments = async (
  routeGeometry: GeoJsonLineString,
): Promise<RiskSegment[]> => {
  if (!supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc('get_segmented_risk_route', {
    route_geojson: routeGeometry,
  });

  if (error || !data) {
    return [];
  }

  const featureCollection =
    data as GeoJsonFeatureCollection<any, RiskFeatureProperties>;

  return featureCollection.features.map((feature, index) => {
    const riskScore = Number(feature.properties?.risk_score ?? 0);

    return {
      id: `risk-${index}`,
      riskScore,
      color: getRiskColor(riskScore),
      geometry: feature.geometry,
    };
  });
};
