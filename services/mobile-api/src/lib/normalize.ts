import type {
  CoverageRegion,
  RouteDebugInfo,
  NavigationStep,
  RiskSegment,
  RoutePreviewResponse,
  RouteResponse,
  RoutingMode,
} from '@defensivepedal/core';
import {
  encodePolyline,
  formatInstruction,
  getAdjustedDuration,
} from '@defensivepedal/core';

import { config } from '../config';

const toNavigationSteps = (routeResponse: RouteResponse, routeIndex: number): NavigationStep[] =>
  (routeResponse.routes[routeIndex]?.legs[0]?.steps ?? []).map((step, index) => ({
    id: `route-${routeIndex}-step-${index}`,
    instruction: formatInstruction(step),
    streetName: step.name,
    distanceMeters: step.distance,
    durationSeconds: step.duration,
    maneuver: step.maneuver,
    geometry: step.geometry,
    mode: step.mode,
  }));

export const normalizeRoutePreviewResponse = (options: {
  routeResponse: RouteResponse;
  mode: RoutingMode;
  coverage: CoverageRegion;
  elevationsByRoute: Array<number[] | null>;
  riskByRoute: RiskSegment[][];
  warningsByRoute: string[][];
  includeDebug?: boolean;
}): RoutePreviewResponse => {
  const routes = options.routeResponse.routes.map((route, index) => {
    const elevationProfile = options.elevationsByRoute[index] ?? null;
    const adjusted = getAdjustedDuration(route.duration, elevationProfile);
    const source: RoutePreviewResponse['routes'][number]['source'] =
      options.mode === 'safe' ? 'custom_osrm' : 'mapbox';
    const routingEngineVersion =
      options.mode === 'safe'
        ? config.versions.safeRoutingEngineVersion
        : config.versions.fastRoutingEngineVersion;
    const routingProfileVersion =
      options.mode === 'safe'
        ? config.versions.safeRoutingProfileVersion
        : config.versions.fastRoutingProfileVersion;

    return {
      id: `${options.mode}-${index + 1}`,
      source,
      routingEngineVersion,
      routingProfileVersion,
      mapDataVersion: config.versions.mapDataVersion,
      riskModelVersion: config.versions.riskModelVersion,
      geometryPolyline6: encodePolyline(route.geometry.coordinates),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      adjustedDurationSeconds: adjusted.adjustedDuration,
      totalClimbMeters: elevationProfile ? adjusted.elevationGain : null,
      steps: toNavigationSteps(options.routeResponse, index),
      riskSegments: options.riskByRoute[index] ?? [],
      warnings: options.warningsByRoute[index] ?? [],
    };
  });

  const debug: RouteDebugInfo[] | undefined = options.includeDebug
    ? routes.map((route, index) => ({
        routeId: route.id,
        source: route.source,
        routingProfileVersion: route.routingProfileVersion,
        selectedAlternativeIndex: index,
        totalRiskScore: options.routeResponse.routes[index]?.weight ?? 0,
        fallbackReason:
          route.source === 'mapbox' && options.mode === 'safe'
            ? 'Mapbox route returned for safe mode fallback.'
            : undefined,
      }))
    : undefined;

  return {
    routes,
    selectedMode: options.mode,
    coverage: options.coverage,
    generatedAt: new Date().toISOString(),
    debug,
  };
};
