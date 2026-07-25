// @vitest-environment happy-dom
/**
 * Pins the static-camera target decision, in particular the recenter
 * mechanism that "use current location as start" now shares with the
 * recenter FAB (route-planning `clearStartOverride`): bumping `recenterKey`
 * with a known user location must pin the camera target to the rider,
 * overriding the destination fallback that would otherwise keep the camera
 * parked wherever custom-start editing left it.
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { DEFAULT_CENTER } from './constants';
import type { DecodedRoute } from './types';
import { useCameraConfig } from './useCameraConfig';

const user = { lat: 44.4268, lon: 26.1025 };
const destination = { lat: 44.45, lon: 26.05 };

const baseParams = {
  recenterKey: 0,
  userLocation: null,
  followUser: false,
  selectedRoute: null,
  trailCoordinates: undefined,
  destination: undefined,
} as const;

const run = (overrides: Partial<Parameters<typeof useCameraConfig>[0]>) =>
  renderHook(() => useCameraConfig({ ...baseParams, ...overrides })).result.current;

describe('useCameraConfig', () => {
  it('targets the destination when no route/trail exists and recenter has not fired (planning baseline)', () => {
    expect(run({ destination, userLocation: user })).toEqual([
      destination.lon,
      destination.lat,
    ]);
  });

  it('targets the rider once recenterKey fires, even with a destination set — the clearStartOverride fix', () => {
    // Selecting "Current location" as start bumps recenterKey; without this
    // the destination fallback wins and the camera never moves to the rider.
    expect(run({ recenterKey: 1, destination, userLocation: user })).toEqual([
      user.lon,
      user.lat,
    ]);
  });

  it('falls back to the chain when recenterKey fired but the GPS fix is missing', () => {
    expect(run({ recenterKey: 1, destination, userLocation: null })).toEqual([
      destination.lon,
      destination.lat,
    ]);
  });

  it('targets the selected route midpoint on preview when routes are displayed', () => {
    const selectedRoute = {
      coordinates: [
        [26.1, 44.42],
        [26.08, 44.43],
        [26.05, 44.45],
      ],
    } as unknown as DecodedRoute;
    expect(run({ selectedRoute, destination })).toEqual([26.08, 44.43]);
  });

  it('targets the destination on preview while stale routes are suppressed (routeMatchesEndpoints companion)', () => {
    // route-preview passes routes=undefined while the stored preview belongs
    // to different endpoints — the camera must frame the destination rather
    // than the old route's midpoint until the fresh calculation lands.
    expect(run({ selectedRoute: null, destination })).toEqual([
      destination.lon,
      destination.lat,
    ]);
  });

  it('falls back to the user location, then DEFAULT_CENTER, when nothing else is known', () => {
    expect(run({ userLocation: user })).toEqual([user.lon, user.lat]);
    expect(run({})).toEqual(DEFAULT_CENTER);
  });
});
