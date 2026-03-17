import { describe, expect, it } from 'vitest';

import { buildRerouteRequest, getPreviewOrigin, hasStartOverride } from './routeRequest';

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
