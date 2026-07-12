import { useEffect, useMemo } from 'react';
import type { Coordinate, SupportedCountry } from '@defensivepedal/core';
import {
  SUPPORTED_APP_COUNTRIES,
  getPreviewOrigin,
  isRouteSupported,
  resolveCountryFromCoord,
} from '@defensivepedal/core';

import { reverseGeocodeCountryCode } from '../lib/regionGate';
import { useAppStore } from '../store/appStore';

export type UnsupportedReason =
  | 'origin_unsupported'
  | 'destination_unsupported'
  | 'cross_border';

export interface ResolvedCountry {
  /** Country resolved from the current planning origin. `null` outside RO/ES. */
  readonly originCountry: SupportedCountry | null;
  /** Country resolved from the planning destination. `null` if unset/unsupported. */
  readonly destinationCountry: SupportedCountry | null;
  /**
   * `true` only when both endpoints resolve to the same supported country.
   * Drives Safe/Flat pill visibility and OSRM dispatch.
   */
  readonly routeSupported: boolean;
  /** `null` when supported, or when destination isn't set yet. */
  readonly unsupportedReason: UnsupportedReason | null;
}

const ZERO_COORD = (c: Coordinate | undefined): boolean =>
  !c || (c.lat === 0 && c.lon === 0);

/**
 * Derives country support for the current planning origin + destination, and
 * keeps `routeRequest.countryHint` in sync as a defense-in-depth signal for
 * any downstream consumer that still reads the legacy hint.
 *
 * The OSRM dispatcher in `mapbox-routing.ts` does the same resolution
 * independently — this hook is for UI gating, not for picking the server.
 */
export const useResolvedCountry = (): ResolvedCountry => {
  const physicalOrigin = useAppStore((s) => s.routeRequest.origin);
  const startOverride = useAppStore((s) => s.routeRequest.startOverride);
  const destination = useAppStore((s) => s.routeRequest.destination);
  const countryHint = useAppStore((s) => s.routeRequest.countryHint);
  const setRouteRequest = useAppStore((s) => s.setRouteRequest);

  // Effective origin = what the router will actually use. When the rider has
  // tapped "Change start" and entered a custom address, `startOverride` wins;
  // otherwise the physical GPS origin. This matters for the cross_border
  // check: a Romanian rider testing intra-Spain routes via Change-Start
  // would otherwise see origin=Bucharest + destination=Madrid and trip the
  // cross_border banner, even though the routed ride is Madrid → Barcelona.
  const routingOrigin = useMemo(
    () => getPreviewOrigin({ origin: physicalOrigin, startOverride }),
    [physicalOrigin, startOverride],
  );

  const resolved = useMemo<ResolvedCountry>(() => {
    const originReady = !ZERO_COORD(routingOrigin);
    const destinationReady = !ZERO_COORD(destination);

    const originCountry = originReady ? resolveCountryFromCoord(routingOrigin) : null;

    // No destination yet: the planning screen still needs to know whether the
    // rider is even in a supported country, so we honor the origin resolution
    // alone and surface a synthetic `destination_unsupported` reason only when
    // a destination has been set and failed to resolve.
    if (!destinationReady) {
      return {
        originCountry,
        destinationCountry: null,
        routeSupported: false,
        unsupportedReason: originCountry === null ? 'origin_unsupported' : null,
      };
    }

    const support = isRouteSupported(routingOrigin, destination);
    if (support.supported) {
      return {
        originCountry: support.country,
        destinationCountry: support.country,
        routeSupported: true,
        unsupportedReason: null,
      };
    }

    return {
      originCountry: support.originCountry,
      destinationCountry: support.destinationCountry,
      routeSupported: false,
      unsupportedReason: support.reason,
    };
  }, [routingOrigin, destination]);

  // Mirror the PHYSICAL origin country onto `routeRequest.countryHint`. Search
  // biasing follows where the rider actually IS (proximity / Mapbox country
  // filter), not the custom map origin they may be planning from.
  // `mapbox-search.ts` expands any supported-country hint to the full
  // EU-27+EEA+CH list, so the hint's job is just "is the rider inside a
  // supported country, and which one".
  //
  // - Physical origin in RO or ES → the routing bboxes answer synchronously.
  // - Elsewhere with a real fix → resolve via the (cached, on-device)
  //   reverse geocoder so riders in the other supported countries also get
  //   the supported-list search filter (global-availability gate follow-up).
  // - Unsupported country / unresolvable / GPS pending → clear, so search
  //   falls back to global proximity-biased results — a waitlisted rider who
  //   continued anyway must still be able to search at home. The explicit
  //   clear also stops a persisted hint from a previous session locking a
  //   traveler's search to the wrong region.
  const physicalOriginCountry = useMemo(
    () => (!ZERO_COORD(physicalOrigin) ? resolveCountryFromCoord(physicalOrigin) : null),
    [physicalOrigin],
  );
  useEffect(() => {
    if (physicalOriginCountry !== null) {
      if (countryHint?.toUpperCase() === physicalOriginCountry) return;
      setRouteRequest({ countryHint: physicalOriginCountry });
      return;
    }

    if (ZERO_COORD(physicalOrigin)) {
      if (countryHint === undefined) return;
      setRouteRequest({ countryHint: undefined });
      return;
    }

    let cancelled = false;
    void reverseGeocodeCountryCode(physicalOrigin.lat, physicalOrigin.lon).then((code) => {
      if (cancelled) return;
      const next =
        code !== null && SUPPORTED_APP_COUNTRIES.has(code) ? code : undefined;
      const current = useAppStore.getState().routeRequest.countryHint;
      if (next === undefined ? current === undefined : current?.toUpperCase() === next) {
        return;
      }
      setRouteRequest({ countryHint: next });
    });
    return () => {
      cancelled = true;
    };
  }, [physicalOriginCountry, physicalOrigin, countryHint, setRouteRequest]);

  return resolved;
};
