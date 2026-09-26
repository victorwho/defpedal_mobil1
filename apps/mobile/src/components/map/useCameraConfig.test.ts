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
  plannedRouteCoordinates: undefined,
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

  // -------------------------------------------------------------------------
  // Historical trips: reported from the device on preview 0.2.174 as "opening a
  // trip in history centers on Bucharest instead of on the trip".
  //
  // `trip/[id]` and `TripCard` draw a ride via plannedRouteCoordinates and pass
  // no route, no trail, no destination and no user location — so every branch
  // missed and the chain fell through to DEFAULT_CENTER (which IS Bucharest) or
  // the region fallback. It looked fine only for trips that happened to have a
  // GPS trail, which is how it survived.
  // -------------------------------------------------------------------------

  const plannedRoute: [number, number][] = [
    [25.6, 45.65],
    [25.61, 45.66],
    [25.62, 45.67],
  ];

  it('targets the planned route when a trip has no GPS trail (was Bucharest)', () => {
    const target = run({ plannedRouteCoordinates: plannedRoute });

    expect(target).toEqual(plannedRoute[1]);
    // The actual defect, stated as the assertion: not the Bucharest default.
    expect(target).not.toEqual(DEFAULT_CENTER);
  });

  it('prefers the GPS trail over the planned route when both exist', () => {
    // The trail is what the rider actually rode, and it is the line drawn on
    // top — so it must win, not merely be considered.
    const trail: [number, number][] = [
      [26.0, 44.4],
      [26.01, 44.41],
      [26.02, 44.42],
    ];

    expect(
      run({ trailCoordinates: trail, plannedRouteCoordinates: plannedRoute }),
    ).toEqual(trail[1]);
  });

  it('still falls back to DEFAULT_CENTER when there is genuinely nothing to show', () => {
    // Guards against the fix turning a one-point degenerate route into a
    // camera target: a single coordinate cannot frame a ride.
    expect(run({ plannedRouteCoordinates: [[25.6, 45.65]] })).toEqual(DEFAULT_CENTER);
  });
});
