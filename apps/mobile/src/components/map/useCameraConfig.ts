import type { Coordinate, SupportedCountry } from '@defensivepedal/core';
import { ROUTING_COVERED_COUNTRIES, getCountryCenter } from '@defensivepedal/core';
import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { DEFAULT_CENTER } from './constants';
import type { DecodedRoute } from './types';

type UseCameraConfigParams = {
  recenterKey: number;
  userLocation?: Coordinate | null;
  followUser: boolean;
  selectedRoute: DecodedRoute | null;
  trailCoordinates?: readonly [number, number][];
  /**
   * The planned/recorded route line, for callers that draw a route WITHOUT a
   * GPS trail — historical trips (`trip/[id]`, `TripCard`) are the live case.
   */
  plannedRouteCoordinates?: readonly [number, number][];
  destination?: Coordinate;
  focusCoordinate?: Coordinate | null;
};

/**
 * Derives the camera center coordinate based on follow state,
 * selected route, trail midpoint, and destination.
 */
export const useCameraConfig = ({
  recenterKey,
  userLocation,
  followUser,
  selectedRoute,
  trailCoordinates,
  plannedRouteCoordinates,
  destination,
  focusCoordinate,
}: UseCameraConfigParams): [number, number] => {
  const trailMidpoint = useMemo<[number, number] | null>(() => {
    if (!trailCoordinates || trailCoordinates.length < 2) return null;
    const mid = trailCoordinates[Math.floor(trailCoordinates.length / 2)];
    return mid ?? null;
  }, [trailCoordinates]);

  /**
   * ⚠️ Without this the camera had no idea where a trail-less trip WAS.
   *
   * `trip/[id]` and `TripCard` draw a historical ride via
   * `plannedRouteCoordinates`, and pass no route, no trail, no destination and
   * no user location. Every one of those is a miss, so the chain below fell
   * through to the region fallback or `DEFAULT_CENTER` — which is Bucharest.
   * A rider in Brașov opening a ride they took in Brașov was shown Bucharest,
   * with their route drawn somewhere off-screen. It only looked correct for
   * trips that happened to have a GPS trail, which is why it survived.
   *
   * Placed after `trailMidpoint` deliberately: when both exist the trail is
   * what the rider actually rode, and it is the line drawn on top.
   */
  const plannedMidpoint = useMemo<[number, number] | null>(() => {
    if (!plannedRouteCoordinates || plannedRouteCoordinates.length < 2) return null;
    const mid = plannedRouteCoordinates[Math.floor(plannedRouteCoordinates.length / 2)];
    return mid ?? null;
  }, [plannedRouteCoordinates]);

  // Cold-start fallback: before the first GPS fix (or forever, if location
  // permission is denied) there is no route/trail/destination/user location.
  // Seed from the region gate's persisted country so the map opens on the
  // rider's own country instead of the hardcoded Bucharest default (review
  // 2026-08-13 G-17). DEFAULT_CENTER remains the last resort for the sliver
  // of users with no resolved gate country.
  const gateCountryCode = useAppStore((s) => s.regionGate.countryCode);
  const regionFallback = useMemo<[number, number] | null>(() => {
    const code = gateCountryCode?.toUpperCase();
    if (!code || !(ROUTING_COVERED_COUNTRIES as readonly string[]).includes(code)) {
      return null;
    }
    const center = getCountryCenter(code as SupportedCountry);
    return [center.lon, center.lat];
  }, [gateCountryCode]);

  // An explicit focus request outranks everything except live follow: the
  // rider asked to look at a specific place, so route framing must yield.
  const cameraCoordinate =
    focusCoordinate && !(followUser && userLocation)
      ? ([focusCoordinate.lon, focusCoordinate.lat] as [number, number])
      : recenterKey > 0 && userLocation
      ? ([userLocation.lon, userLocation.lat] as [number, number])
      : followUser && userLocation
        ? ([userLocation.lon, userLocation.lat] as [number, number])
        : selectedRoute?.coordinates[Math.floor(selectedRoute.coordinates.length / 2)] ??
          trailMidpoint ??
          plannedMidpoint ??
          (destination ? ([destination.lon, destination.lat] as [number, number]) : null) ??
          (userLocation ? ([userLocation.lon, userLocation.lat] as [number, number]) : null) ??
          regionFallback ??
          DEFAULT_CENTER;

  return cameraCoordinate;
};
