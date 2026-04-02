import type { Coordinate, NearbyHazard, RouteOption } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';
import { useMemo } from 'react';
import type { BicycleParkingLocation } from '../../lib/bicycle-parking';
import type { BicycleRentalLocation } from '../../lib/bicycle-rental';
import type { BikeShopLocation } from '../../lib/bicycle-shops';
import type { SearchedPoi } from '../../lib/poi-search';
import { CATEGORY_TO_LABEL, CATEGORY_TO_VIS_KEY, DEFAULT_CENTER, toMarkerFeature } from './constants';
import type { DecodedRoute, PoiVisibility } from './types';

type UseFeatureCollectionsParams = {
  routes: RouteOption[];
  selectedRouteId?: string | null;
  origin?: Coordinate;
  destination?: Coordinate;
  userLocation?: Coordinate | null;
  offRouteDetails?: { user: Coordinate; snapped: Coordinate } | null;
  bicycleParkingLocations: readonly BicycleParkingLocation[];
  bicycleRentalLocations: readonly BicycleRentalLocation[];
  bikeShopLocations: readonly BikeShopLocation[];
  searchedPois: readonly SearchedPoi[];
  poiVisibility?: PoiVisibility;
  nearbyHazards: readonly NearbyHazard[];
  trailCoordinates?: readonly [number, number][];
  plannedRouteCoordinates?: readonly [number, number][];
};

export const useFeatureCollections = ({
  routes,
  selectedRouteId,
  origin,
  destination,
  userLocation,
  offRouteDetails,
  bicycleParkingLocations,
  bicycleRentalLocations,
  bikeShopLocations,
  searchedPois,
  poiVisibility,
  nearbyHazards,
  trailCoordinates,
  plannedRouteCoordinates,
}: UseFeatureCollectionsParams) => {
  const decodedRoutes = useMemo<DecodedRoute[]>(
    () =>
      routes.map((route, index) => ({
        route,
        coordinates: decodePolyline(route.geometryPolyline6),
        isSelected: route.id === (selectedRouteId ?? routes[0]?.id),
        sortKey: index + 1,
      })),
    [routes, selectedRouteId],
  );

  const selectedRoute =
    decodedRoutes.find((candidate: DecodedRoute) => candidate.isSelected) ?? decodedRoutes[0] ?? null;

  const routeFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: decodedRoutes
        .filter((route: DecodedRoute) => route.coordinates.length > 1)
        .map((route: DecodedRoute) => ({
          type: 'Feature' as const,
          properties: {
            id: route.route.id,
            selected: route.isSelected,
            sortKey: route.sortKey,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: route.coordinates,
          },
        })),
    }),
    [decodedRoutes],
  );

  const riskFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features:
        selectedRoute?.route.riskSegments.map((segment, index) => ({
          type: 'Feature' as const,
          properties: {
            id: segment.id,
            color: segment.color,
            riskScore: segment.riskScore,
            sortKey: index + 1,
          },
          geometry: segment.geometry,
        })) ?? [],
    }),
    [selectedRoute],
  );

  const bicycleParkingFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: bicycleParkingLocations.map((loc) => ({
        type: 'Feature' as const,
        properties: { id: loc.id, name: loc.name ?? '' },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.lon, loc.lat] as [number, number],
        },
      })),
    }),
    [bicycleParkingLocations],
  );

  const bicycleRentalFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: bicycleRentalLocations.map((loc) => ({
        type: 'Feature' as const,
        properties: { id: loc.id, name: loc.name ?? '' },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.lon, loc.lat] as [number, number],
        },
      })),
    }),
    [bicycleRentalLocations],
  );

  const bikeShopFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: bikeShopLocations.map((loc) => ({
        type: 'Feature' as const,
        properties: {
          id: loc.id,
          name: loc.name ?? '',
          repair: loc.repairService ? 'yes' : 'no',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.lon, loc.lat] as [number, number],
        },
      })),
    }),
    [bikeShopLocations],
  );

  const searchedPoiFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: searchedPois
        .filter((poi) => {
          const visKey = CATEGORY_TO_VIS_KEY[poi.category];
          return visKey ? (poiVisibility?.[visKey] ?? false) : false;
        })
        .map((poi) => ({
          type: 'Feature' as const,
          properties: {
            id: poi.id,
            name: poi.name,
            label: CATEGORY_TO_LABEL[poi.category] ?? '•',
            address: poi.address ?? '',
            website: poi.website ?? '',
            type: poi.category,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [poi.lon, poi.lat] as [number, number],
          },
        })),
    }),
    [searchedPois, poiVisibility],
  );

  const hazardFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: nearbyHazards.map((h) => ({
        type: 'Feature' as const,
        properties: { id: h.id, type: h.hazardType },
        geometry: {
          type: 'Point' as const,
          coordinates: [h.lon, h.lat] as [number, number],
        },
      })),
    }),
    [nearbyHazards],
  );

  const hazardZoneFeatureCollection = useMemo(() => {
    const routeCoords = selectedRoute?.coordinates;
    if (!routeCoords || routeCoords.length < 2 || nearbyHazards.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] as any[] };
    }

    const features = nearbyHazards.map((hazard) => {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < routeCoords.length; i++) {
        const dx = routeCoords[i][0] - hazard.lon;
        const dy = routeCoords[i][1] - hazard.lat;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      const SPREAD = 8;
      const startIdx = Math.max(0, closestIdx - SPREAD);
      const endIdx = Math.min(routeCoords.length - 1, closestIdx + SPREAD);
      const segment = routeCoords.slice(startIdx, endIdx + 1);

      if (segment.length < 2) return null;

      return {
        type: 'Feature' as const,
        properties: { id: hazard.id },
        geometry: {
          type: 'LineString' as const,
          coordinates: segment,
        },
      };
    }).filter(Boolean);

    return { type: 'FeatureCollection' as const, features };
  }, [selectedRoute, nearbyHazards]);

  const trailFeatureCollection = useMemo(
    () =>
      trailCoordinates && trailCoordinates.length >= 2
        ? {
            type: 'FeatureCollection' as const,
            features: [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                  type: 'LineString' as const,
                  coordinates: trailCoordinates as [number, number][],
                },
              },
            ],
          }
        : null,
    [trailCoordinates],
  );

  const plannedRouteFeatureCollection = useMemo(
    () =>
      plannedRouteCoordinates && plannedRouteCoordinates.length >= 2
        ? {
            type: 'FeatureCollection' as const,
            features: [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                  type: 'LineString' as const,
                  coordinates: plannedRouteCoordinates as [number, number][],
                },
              },
            ],
          }
        : null,
    [plannedRouteCoordinates],
  );

  const markerFeatureCollection = useMemo(() => {
    const fallbackOrigin =
      origin ??
      (selectedRoute
        ? {
            lon: selectedRoute.coordinates[0]?.[0] ?? DEFAULT_CENTER[0],
            lat: selectedRoute.coordinates[0]?.[1] ?? DEFAULT_CENTER[1],
          }
        : undefined);
    const fallbackDestination =
      destination ??
      (selectedRoute
        ? {
            lon:
              selectedRoute.coordinates[selectedRoute.coordinates.length - 1]?.[0] ?? DEFAULT_CENTER[0],
            lat:
              selectedRoute.coordinates[selectedRoute.coordinates.length - 1]?.[1] ?? DEFAULT_CENTER[1],
          }
        : undefined);

    return {
      type: 'FeatureCollection' as const,
      features: [
        toMarkerFeature(fallbackOrigin, 'origin'),
        toMarkerFeature(fallbackDestination, 'destination'),
        toMarkerFeature(userLocation ?? undefined, 'user'),
      ].filter((feature): feature is NonNullable<typeof feature> => Boolean(feature)),
    };
  }, [destination, origin, selectedRoute, userLocation]);

  const offRouteFeatureCollection = useMemo(() => {
    if (!offRouteDetails) {
      return {
        type: 'FeatureCollection' as const,
        features: [],
      };
    }

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {
            id: 'off-route-connector',
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [offRouteDetails.user.lon, offRouteDetails.user.lat] as [number, number],
              [offRouteDetails.snapped.lon, offRouteDetails.snapped.lat] as [number, number],
            ],
          },
        },
      ],
    };
  }, [offRouteDetails]);

  return {
    decodedRoutes,
    selectedRoute,
    routeFeatureCollection,
    riskFeatureCollection,
    bicycleParkingFeatureCollection,
    bicycleRentalFeatureCollection,
    bikeShopFeatureCollection,
    searchedPoiFeatureCollection,
    hazardFeatureCollection,
    hazardZoneFeatureCollection,
    trailFeatureCollection,
    plannedRouteFeatureCollection,
    markerFeatureCollection,
    offRouteFeatureCollection,
  };
};
