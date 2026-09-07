import { describe, expect, it, vi } from 'vitest';

import { beginLoopRide, type LoopRideStore } from './loop-ride';

const route = {
  id: 'loop-1',
  source: 'generated_loop',
  distanceMeters: 24_000,
} as never;

const start = { lat: 45.59, lon: 25.46 };

const args = {
  route,
  start,
  distanceMeters: 24_000,
  loopName: '24 km loop',
  startedAt: '2026-09-07T10:00:00.000Z',
  sessionId: 'session-1',
  clientTripId: 'client-trip-1',
};

const makeStore = (appState = 'IDLE') => {
  const store: LoopRideStore = {
    appState,
    setRouteRequest: vi.fn(),
    setRoutePreview: vi.fn(),
    enqueueMutation: vi.fn(),
    setActiveTripClientId: vi.fn(),
    startNavigation: vi.fn(),
  };
  return store;
};

describe('beginLoopRide', () => {
  it('REGRESSION: actually starts a ride', () => {
    // What shipped instead fired telemetry and showed a toast. The button
    // reacted, so it looked wired; nothing downstream ever ran and the rider
    // reported "tap Start ride, nothing happens".
    const store = makeStore();
    expect(beginLoopRide(store, args)).toBe('started');
    expect(store.startNavigation).toHaveBeenCalledWith(route, 'session-1');
  });

  it('publishes the loop where navigation looks for it', () => {
    // navigation.tsx reads its route from routePreview.routes, not from the
    // session — publishing is what makes the HUD render the right line.
    const store = makeStore();
    beginLoopRide(store, args);
    const [preview, options] = (store.setRoutePreview as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(preview.routes).toEqual([route]);
    expect(options.preferredRouteId).toBe('loop-1');
  });

  it('queues trip_start so the ride is recorded even without a session', () => {
    const store = makeStore();
    beginLoopRide(store, args);
    const [kind, payload] = (store.enqueueMutation as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(kind).toBe('trip_start');
    expect(payload.clientTripId).toBe('client-trip-1');
    expect(payload.distanceMeters).toBe(24_000);
    expect(payload.destinationText).toBe('24 km loop');
    expect(store.setActiveTripClientId).toHaveBeenCalledWith('client-trip-1');
  });

  it('routes a loop back to where it started', () => {
    // The one way a loop differs from every other route in the app.
    const store = makeStore();
    beginLoopRide(store, args);
    const [request] = (store.setRouteRequest as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(request.origin).toEqual(start);
    expect(request.destination).toEqual(start);
    expect(request.waypoints).toEqual([]);
  });

  it('does not start a second ride on top of one already running', () => {
    // Backing out of /navigation onto the planner and tapping again would
    // otherwise orphan the first trip with a duplicate clientTripId.
    const store = makeStore('NAVIGATING');
    expect(beginLoopRide(store, args)).toBe('already-navigating');
    expect(store.enqueueMutation).not.toHaveBeenCalled();
    expect(store.startNavigation).not.toHaveBeenCalled();
    expect(store.setRoutePreview).not.toHaveBeenCalled();
  });

  it('keeps the generated_loop marker, which suppresses auto-reroute', () => {
    // Losing it replaces the rider's loop with an OSRM route home mid-ride —
    // for a loop, that means silently ending the ride.
    const store = makeStore();
    beginLoopRide(store, args);
    const [, sessionId] = (store.startNavigation as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(sessionId).toBe('session-1');
    const [preview] = (store.setRoutePreview as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(preview.routes[0].source).toBe('generated_loop');
  });
});
