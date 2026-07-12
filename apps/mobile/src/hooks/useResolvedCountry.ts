import { useEffect, useMemo } from 'react';
import type { Coordinate, SupportedCountry } from '@defensivepedal/core';
import {
  getPreviewOrigin,
  isRouteSupported,
  resolveCountryFromCoord,
} from '@defensivepedal/core';

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
  // filter), not the custom map origin they may be planning from. Since the
  // supported-country expansion in `mapbox-search.ts` (RO+ES in v0.2.81, all
  // EU-27+EEA+CH after the global-availability gate), this only changes which
  // single ISO code is stored — autocomplete expands a supported hint to the
  // full supported list regardless.
  //
  // - Physical origin in RO or ES → write that ISO code.
  // - Outside, or GPS pending → clear so search falls back to global
  //   proximity-biased results. Without the explicit clear, a persisted RO
  //   from a previous session would lock a Spanish rider's search until
  //   the hook's first write.
  const physicalOriginCountry = useMemo(
    () => (!ZERO_COORD(physicalOrigin) ? resolveCountryFromCoord(physicalOrigin) : null),
    [physicalOrigin],
  );
  useEffect(() => {
    if (physicalOriginCountry === null) {
      if (countryHint === undefined) return;
      setRouteRequest({ countryHint: undefined });
      return;
    }
    if (countryHint?.toUpperCase() === physicalOriginCountry) return;
    setRouteRequest({ countryHint: physicalOriginCountry });
  }, [physicalOriginCountry, countryHint, setRouteRequest]);

  return resolved;
};
