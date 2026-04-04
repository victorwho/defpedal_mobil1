import { describe, expect, it } from 'vitest';

import { buildRerouteRequest, getPreviewOrigin, hasStartOverride } from './routeRequest';
import { encodePolyline } from './index';

describe('routeRequest helpers', () => {
  it('prefers the custom start override when building a preview origin', () => {
    expect(
      getPreviewOrigin({
        origin: {
          lat: 44.4268,
          lon: 26.1025,
        },
        startOverride: {
          lat: 44.435,
          lon: 26.09,
        },
      }),
    ).toEqual({
      lat: 44.435,
      lon: 26.09,
    });
  });

  it('falls back to the live origin when no custom override is set', () => {
    expect(
      getPreviewOrigin({
        origin: {
          lat: 44.4268,
          lon: 26.1025,
        },
      }),
    ).toEqual({
      lat: 44.4268,
      lon: 26.1025,
    });
  });

  it('drops the custom start override when building a reroute request', () => {
    expect(
      buildRerouteRequest(
        {
          origin: {
            lat: 44.4268,
            lon: 26.1025,
          },
          destination: {
            lat: 44.4378,
            lon: 26.0946,
          },
          startOverride: {
            lat: 44.435,
            lon: 26.09,
          },
          mode: 'safe',
          avoidUnpaved: false,
          locale: 'en',
          countryHint: 'RO',
        },
        'safe-1',
        {
          lat: 44.428,
          lon: 26.099,
        },
      ),
    ).toEqual({
      origin: {
        lat: 44.428,
        lon: 26.099,
      },
      destination: {
        lat: 44.4378,
        lon: 26.0946,
      },
      startOverride: undefined,
      mode: 'safe',
      avoidUnpaved: false,
      locale: 'en',
      countryHint: 'RO',
      activeRouteId: 'safe-1',
    });
  });

  it('reports whether a custom start override exists', () => {
    expect(hasStartOverride({ startOverride: undefined })).toBe(false);
    expect(
      hasStartOverride({
        startOverride: {
          lat: 44.435,
          lon: 26.09,
        },
      }),
    ).toBe(true);
  });
});

describe('multi-stop reroute — waypoint stripping', () => {
  // Route: A(26.10,44.42) → WP1(26.08,44.43) → WP2(26.06,44.44) → D(26.04,44.45)
  const routeCoordinates: [number, number][] = [
    [26.10, 44.42],
    [26.09, 44.425],
    [26.08, 44.43],   // near WP1
    [26.07, 44.435],
    [26.06, 44.44],   // near WP2
    [26.05, 44.445],
    [26.04, 44.45],
  ];

  const baseRequest = {
    origin: { lat: 44.42, lon: 26.10 },
    destination: { lat: 44.45, lon: 26.04 },
    waypoints: [
      { lat: 44.43, lon: 26.08 },  // WP1
      { lat: 44.44, lon: 26.06 },  // WP2
    ] as const,
    mode: 'safe' as const,
    avoidUnpaved: false,
    locale: 'en',
  };

  it('strips waypoints behind the rider during reroute', () => {
    // Rider is past WP1, between WP1 and WP2
    const riderPosition = { lat: 44.435, lon: 26.07 };
    const result = buildRerouteRequest(baseRequest, 'route-1', riderPosition, routeCoordinates);

    // WP1 is behind → stripped. WP2 is ahead → kept.
    expect(result.waypoints).toEqual([{ lat: 44.44, lon: 26.06 }]);
  });

  it('strips all waypoints when rider is past all of them', () => {
    // Rider is past WP2, near destination
    const riderPosition = { lat: 44.445, lon: 26.05 };
    const result = buildRerouteRequest(baseRequest, 'route-1', riderPosition, routeCoordinates);

    expect(result.waypoints).toEqual([]);
  });

  it('keeps all waypoints when rider is before all of them', () => {
    // Rider is near the start
    const riderPosition = { lat: 44.42, lon: 26.10 };
    const result = buildRerouteRequest(baseRequest, 'route-1', riderPosition, routeCoordinates);

    expect(result.waypoints).toEqual([
      { lat: 44.43, lon: 26.08 },
      { lat: 44.44, lon: 26.06 },
    ]);
  });

  it('passes waypoints through unchanged when no route coordinates provided', () => {
    const riderPosition = { lat: 44.435, lon: 26.07 };
    const result = buildRerouteRequest(baseRequest, 'route-1', riderPosition);

    // Without routeCoordinates, can't determine which are passed → keep all
    expect(result.waypoints).toEqual([
      { lat: 44.43, lon: 26.08 },
      { lat: 44.44, lon: 26.06 },
    ]);
  });
});
