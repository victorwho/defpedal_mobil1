// @vitest-environment node
/**
 * shareClaimToPreview — Unit Tests
 */
import { describe, expect, it } from 'vitest';

import { mapShareClaimToPreview } from '../shareClaimToPreview';
import type { RouteShareClaimResponseBody } from '../api';

const baseClaim = (overrides: Partial<RouteShareClaimResponseBody['routePayload']> = {}): {
  code: string;
  routePayload: RouteShareClaimResponseBody['routePayload'];
} => ({
  code: 'abcd1234',
  routePayload: {
    origin: { lat: 44.4268, lon: 26.1025 },
    destination: { lat: 44.4378, lon: 26.1083 },
    geometryPolyline6: '_ibE_seK_seK_seK',
    distanceMeters: 2500,
    durationSeconds: 540,
    routingMode: 'safe',
    riskSegments: [],
    safetyScore: null,
    ...overrides,
  },
});

describe('mapShareClaimToPreview', () => {
  it('builds a minimal RoutePreviewResponse from a safe-mode claim', () => {
    const { response, selectedRouteId } = mapShareClaimToPreview(baseClaim());

    expect(response.routes).toHaveLength(1);
    const route = response.routes[0]!;
    expect(route.id).toBe('share-abcd1234');
    expect(route.source).toBe('custom_osrm');
    expect(route.geometryPolyline6).toBe('_ibE_seK_seK_seK');
    expect(route.distanceMeters).toBe(2500);
    expect(route.durationSeconds).toBe(540);
    expect(route.adjustedDurationSeconds).toBe(540);
    expect(route.totalClimbMeters).toBeNull();
    expect(route.steps).toEqual([]);
    expect(route.riskSegments).toEqual([]);
    expect(route.warnings).toEqual([]);
    expect(response.selectedMode).toBe('safe');
    expect(selectedRouteId).toBe('share-abcd1234');
  });

  it('maps routingMode="fast" to selectedMode=fast and source=mapbox', () => {
    const { response, request } = mapShareClaimToPreview(
      baseClaim({ routingMode: 'fast' }),
    );
    expect(response.selectedMode).toBe('fast');
    expect(response.routes[0]?.source).toBe('mapbox');
    expect(request.mode).toBe('fast');
    expect(request.avoidHills).toBe(false);
  });

  it('collapses routingMode="flat" to safe + avoidHills=true', () => {
    const { response, request } = mapShareClaimToPreview(
      baseClaim({ routingMode: 'flat' }),
    );
    // Store's RoutingMode enum is 'safe' | 'fast' — flat becomes safe here.
    expect(response.selectedMode).toBe('safe');
    expect(response.routes[0]?.source).toBe('custom_osrm');
    expect(request.mode).toBe('safe');
    expect(request.avoidHills).toBe(true);
  });

  it('emits a Partial<RoutePreviewRequest> with origin/destination/mode/avoid flags', () => {
    const { request } = mapShareClaimToPreview(baseClaim());
    expect(request.origin).toEqual({ lat: 44.4268, lon: 26.1025 });
    expect(request.destination).toEqual({ lat: 44.4378, lon: 26.1083 });
    expect(request.mode).toBe('safe');
    expect(request.avoidHills).toBe(false);
    expect(request.avoidUnpaved).toBe(false);
  });

  it('drops riskSegments from the claim into an empty array (known gap)', () => {
    // Claim's riskSegments use {startIndex, endIndex, riskCategory}; the
    // store expects {id, riskScore, color, geometry}. Mapping is deferred;
    // empty array for now.
    const { response } = mapShareClaimToPreview(
      baseClaim({
        riskSegments: [
          { startIndex: 0, endIndex: 5, riskCategory: 'safe' },
          { startIndex: 5, endIndex: 10, riskCategory: 'dangerous' },
        ],
      }),
    );
    expect(response.routes[0]?.riskSegments).toEqual([]);
  });

  it('sets generatedAt to an ISO8601 string', () => {
    const { response } = mapShareClaimToPreview(baseClaim());
    expect(response.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('emits placeholder version strings so debuggers can spot shared routes', () => {
    const { response } = mapShareClaimToPreview(baseClaim());
    const route = response.routes[0]!;
    expect(route.routingEngineVersion).toBe('shared');
    expect(route.routingProfileVersion).toBe('shared');
    expect(route.mapDataVersion).toBe('shared');
    expect(route.riskModelVersion).toBe('shared');
  });
});
