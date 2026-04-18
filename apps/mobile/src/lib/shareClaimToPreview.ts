/**
 * Map a successful route-share claim into the store shape expected by
 * `/route-preview`. Fills in routing-engine metadata with placeholder
 * values since the claim payload doesn't carry it — the invitee can't
 * re-route from the claimed route until they explicitly edit it, but
 * the preview screen will render the map + distance + duration + CTAs.
 *
 * Known gaps (intentional, not bugs):
 *   - `riskSegments`: claim's [{startIndex, endIndex, riskCategory}] shape
 *     doesn't match the store's {id, riskScore, color, GeoJSON geometry}
 *     shape. Mapping requires polyline6 decode + slicing + palette lookup;
 *     that's real work and lands in a follow-up. For now we emit an empty
 *     array — the route renders as a single-color line without per-segment
 *     safety coloring. Distance/duration/origin/destination are correct.
 *   - `steps`: no turn-by-turn data in share payload. Empty array.
 *     Navigation from a claimed route would need a reroute call; preview
 *     screen doesn't need steps.
 *   - `totalClimbMeters` / `elevationProfile`: not in share payload. Null
 *     / undefined. Climb chart hides.
 *
 * Source version strings are placeholders (`'shared'`) so tests can
 * identify claimed-from-share routes when debugging.
 */
import type {
  CoverageRegion,
  RoutePreviewRequest,
  RoutePreviewResponse,
  RouteOption,
  RoutingMode,
} from '@defensivepedal/core';

import type { RouteShareClaimResponseBody } from './api';

const PLACEHOLDER_VERSION = 'shared';
const PLACEHOLDER_COVERAGE: CoverageRegion = {
  // Neutral default — the preview screen doesn't strictly gate on coverage
  // when a routePreview is already present; leaving countryCode empty
  // skips any routing re-evaluation that depends on it.
  countryCode: '',
  status: 'supported',
  safeRouting: true,
  fastRouting: true,
};

type ShareClaim = Pick<RouteShareClaimResponseBody, 'code' | 'routePayload'>;

export type MappedShareClaim = {
  request: Partial<RoutePreviewRequest>;
  response: RoutePreviewResponse;
  selectedRouteId: string;
};

/**
 * Convert the claim payload into the `Partial<RoutePreviewRequest>` that
 * `setRouteRequest` wants (for origin/destination/mode display) plus the
 * full `RoutePreviewResponse` that `setRoutePreview` wants (for routes
 * list, selected mode, coverage).
 */
export const mapShareClaimToPreview = (claim: ShareClaim): MappedShareClaim => {
  const { routePayload, code } = claim;
  const {
    origin,
    destination,
    geometryPolyline6,
    distanceMeters,
    durationSeconds,
    routingMode,
  } = routePayload;

  // The store's RoutingMode is 'safe' | 'fast'. The share payload's
  // routingMode is 'safe' | 'fast' | 'flat' — 'flat' is a refinement of
  // 'safe' via the avoidHills flag. Collapse here and set avoidHills in
  // the request.
  const storeMode: RoutingMode = routingMode === 'fast' ? 'fast' : 'safe';
  const avoidHills = routingMode === 'flat';

  // Single synthesized RouteOption. `id` is stable per claim code so the
  // store's `selectedRouteId` stays pointing at the same object across
  // re-renders (the preview screen reads by id).
  const routeId = `share-${code}`;

  const routeOption: RouteOption = {
    id: routeId,
    source: storeMode === 'fast' ? 'mapbox' : 'custom_osrm',
    routingEngineVersion: PLACEHOLDER_VERSION,
    routingProfileVersion: PLACEHOLDER_VERSION,
    mapDataVersion: PLACEHOLDER_VERSION,
    riskModelVersion: PLACEHOLDER_VERSION,
    geometryPolyline6,
    distanceMeters,
    durationSeconds,
    adjustedDurationSeconds: durationSeconds,
    totalClimbMeters: null,
    steps: [],
    riskSegments: [],
    warnings: [],
  };

  const response: RoutePreviewResponse = {
    routes: [routeOption],
    selectedMode: storeMode,
    coverage: PLACEHOLDER_COVERAGE,
    generatedAt: new Date().toISOString(),
  };

  const request: Partial<RoutePreviewRequest> = {
    origin,
    destination,
    mode: storeMode,
    avoidHills,
    avoidUnpaved: false,
  };

  return { request, response, selectedRouteId: routeId };
};
