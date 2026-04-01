import type { Coordinate, NearbyHazard, RouteOption } from '@defensivepedal/core';
import type { BicycleParkingLocation } from '../lib/bicycle-parking';
// Bike lanes now use Mapbox vector tiles (no Overpass API needed)
import type { BicycleRentalLocation } from '../lib/bicycle-rental';
import type { BikeShopLocation } from '../lib/bicycle-shops';
import type { SearchedPoi } from '../lib/poi-search';
import { decodePolyline } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import Mapbox from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Dimensions, Linking, Pressable } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, darkTheme, gray, safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  textSm,
  textXs,
} from '../design-system/tokens/typography';
import { mobileEnv } from '../lib/env';

if (mobileEnv.mapboxPublicToken) {
  Mapbox.setAccessToken(mobileEnv.mapboxPublicToken);
}

type RouteMapProps = {
  routes?: RouteOption[];
  selectedRouteId?: string | null;
  origin?: Coordinate;
  destination?: Coordinate;
  userLocation?: Coordinate | null;
  followUser?: boolean;
  offRouteDetails?: {
    user: Coordinate;
    snapped: Coordinate;
  } | null;
  fullBleed?: boolean;
  showRouteOverlay?: boolean;
  bicycleParkingLocations?: readonly BicycleParkingLocation[];
  bicycleRentalLocations?: readonly BicycleRentalLocation[];
  bikeShopLocations?: readonly BikeShopLocation[];
  searchedPois?: readonly SearchedPoi[];
  showBicycleLanes?: boolean;
  poiVisibility?: {
    hydration: boolean;
    repair: boolean;
    restroom: boolean;
    medical: boolean;
    transit: boolean;
    supplies: boolean;
  };
  nearbyHazards?: readonly NearbyHazard[];
  /** Bumped to force camera re-center (e.g. when user taps locate button) */
  recenterKey?: number;
  /** GPS trail line (actual ride path) — rendered as a blue line */
  trailCoordinates?: readonly [number, number][];
  /** Planned route line — rendered in the specified color */
  plannedRouteCoordinates?: readonly [number, number][];
  /** Color for the planned route line (default: green) */
  plannedRouteColor?: string;
  /** Called when user taps the map (used for hazard placement) */
  onMapTap?: (coordinate: Coordinate) => void;
  /** When true, shows a crosshair overlay for hazard placement */
  hazardPlacementMode?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

type DecodedRoute = {
  route: RouteOption;
  coordinates: [number, number][];
  isSelected: boolean;
  sortKey: number;
};

const DEFAULT_CENTER: [number, number] = [26.1025, 44.4268];

// --- Shield Mode basemap ---
const STANDARD_STYLE_URL = 'mapbox://styles/mapbox/standard';

const getLightPreset = (): string => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 8) return 'dawn';
  if (hour >= 18 && hour < 20) return 'dusk';
  if (hour >= 20 || hour < 6) return 'night';
  return 'day';
};

const LIGHT_REFRESH_MS = 30 * 60 * 1000; // 30 minutes

const toMarkerFeature = (
  coordinate: Coordinate | undefined,
  kind: 'origin' | 'destination' | 'user',
) => {
  if (!coordinate) {
    return null;
  }

  return {
    type: 'Feature' as const,
    properties: {
      kind,
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [coordinate.lon, coordinate.lat] as [number, number],
    },
  };
};

export const RouteMap = ({
  routes = [],
  selectedRouteId,
  origin,
  destination,
  userLocation,
  followUser = false,
  offRouteDetails,
  fullBleed = false,
  showRouteOverlay = true,
  bicycleParkingLocations = [],
  bicycleRentalLocations = [],
  bikeShopLocations = [],
  searchedPois = [],
  showBicycleLanes = false,
  poiVisibility,
  nearbyHazards = [],
  recenterKey = 0,
  trailCoordinates,
  plannedRouteCoordinates,
  plannedRouteColor = safetyColors.safe,
  onMapTap,
  hazardPlacementMode = false,
  containerStyle,
}: RouteMapProps) => {
  const [lightPreset, setLightPreset] = useState(getLightPreset);
  const mapViewRef = useRef<Mapbox.MapView | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<{
    name: string;
    type: string;
    website?: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  const makiToType: Record<string, string> = useMemo(() => ({
    'drinking-water': 'Water Fountain',
    'cafe': 'Café',
    'bicycle': 'Bike Shop',
    'toilet': 'Restroom',
    'bicycle-share': 'Bike Rental',
    'convenience': 'Convenience Store',
    'grocery': 'Grocery Store',
  }), []);

  const handlePoiPress = useCallback(async (event: any) => {
    try {
      const feature = event?.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      const name = props.name ?? 'Unknown';

      // Toggle off if same POI tapped again
      if (selectedPoi && selectedPoi.name === name) {
        setSelectedPoi(null);
        return;
      }

      // Convert geo coords to screen position
      let screenX = 200;
      let screenY = 300;
      try {
        const mapRef = mapViewRef.current;
        if (mapRef) {
          const point = await (mapRef as any).getPointInView([coords[0], coords[1]]);
          if (Array.isArray(point) && point.length >= 2) {
            screenX = point[0];
            screenY = point[1];
          }
        }
      } catch {
        // fallback to defaults
      }

      setSelectedPoi({
        name,
        type: makiToType[props.maki] ?? props.type ?? 'Point of Interest',
        website: props.website_url || undefined,
        screenX,
        screenY,
      });
    } catch {
      // ignore
    }
  }, [makiToType, selectedPoi]);

  // Refresh light preset every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setLightPreset(getLightPreset());
    }, LIGHT_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const shieldModeConfig = useMemo(() => ({
    lightPreset,
    font: 'Montserrat',
    showPointOfInterestLabels: 'false',
    showTransitLabels: 'false',
    show3dObjects: 'false',
    showPedestrianRoads: 'false',
    showRoadLabels: 'true',
    showPlaceLabels: 'true',
    colorLand: '#E8E4DE',
    colorWater: '#B8C5CC',
    colorGreenspace: '#8DB580',
    colorMotorways: '#A0695A',
    colorTrunks: '#B8917E',
    colorRoads: '#D4C9A8',
    colorIndustrial: '#DDD8D0',
    colorCommercial: '#DDD8D0',
    colorEducation: '#DDD8D0',
    colorMedical: '#DDD8D0',
  }), [lightPreset]);

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

  const parkingVisible = poiVisibility?.bikeParking ?? false;
  const rentalVisible = poiVisibility?.bikeRental ?? false;
  const repairVisible = poiVisibility?.repair ?? false;

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

  // Map Mapbox Search category to our label letter
  const categoryToLabel: Record<string, string> = {
    fountain: 'W', cafe: 'W', coffee_shop: 'W',
    convenience_store: 'S', supermarket: 'S', grocery: 'S',
  };

  // Map Mapbox Search categories to our visibility keys
  const categoryToVisKey: Record<string, keyof NonNullable<typeof poiVisibility>> = {
    fountain: 'hydration', cafe: 'hydration', coffee_shop: 'hydration',
    convenience_store: 'supplies', supermarket: 'supplies', grocery: 'supplies',
  };

  const searchedPoiFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: searchedPois
        .filter((poi) => {
          const visKey = categoryToVisKey[poi.category];
          return visKey ? (poiVisibility?.[visKey] ?? false) : false;
        })
        .map((poi) => ({
          type: 'Feature' as const,
          properties: {
            id: poi.id,
            name: poi.name,
            label: categoryToLabel[poi.category] ?? '•',
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

  // Build striped hazard zone line segments along the route
  const hazardZoneFeatureCollection = useMemo(() => {
    const routeCoords = selectedRoute?.coordinates;
    if (!routeCoords || routeCoords.length < 2 || nearbyHazards.length === 0) {
      return { type: 'FeatureCollection' as const, features: [] as any[] };
    }

    const features = nearbyHazards.map((hazard) => {
      // Find closest point on route to this hazard
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

      // Extract ~50m before and after (approx 5-10 route points each direction)
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

  const trailMidpoint = useMemo<[number, number] | null>(() => {
    if (!trailCoordinates || trailCoordinates.length < 2) return null;
    const mid = trailCoordinates[Math.floor(trailCoordinates.length / 2)];
    return mid ?? null;
  }, [trailCoordinates]);

  const cameraCoordinate =
    // When recenter is requested, prioritize user location
    recenterKey > 0 && userLocation
      ? ([userLocation.lon, userLocation.lat] as [number, number])
      : followUser && userLocation
        ? ([userLocation.lon, userLocation.lat] as [number, number])
        : selectedRoute?.coordinates[Math.floor(selectedRoute.coordinates.length / 2)] ??
          trailMidpoint ??
          (destination ? ([destination.lon, destination.lat] as [number, number]) : null) ??
        (userLocation ? ([userLocation.lon, userLocation.lat] as [number, number]) : null) ??
        DEFAULT_CENTER;


  if (!mobileEnv.mapboxPublicToken) {
    return (
      <View
        style={[
          styles.container,
          fullBleed ? styles.containerFullBleed : null,
          containerStyle,
          styles.fallback,
        ]}
      >
        <Text style={styles.fallbackTitle}>Mapbox token missing</Text>
        <Text style={styles.fallbackText}>
          Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable native map previews.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, fullBleed ? styles.containerFullBleed : null, containerStyle]}>
      <Mapbox.MapView
        ref={mapViewRef as any}
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE_URL}
        onPress={onMapTap ? (event: any) => {
          const coords = event?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            onMapTap({ lat: coords[1], lon: coords[0] });
          }
        } : undefined}
      >
        <Mapbox.StyleImport id="basemap" existing config={shieldModeConfig} />

        {followUser && userLocation ? (
          <Mapbox.Camera
            followUserLocation
            followUserMode="course"
            followZoomLevel={16}
            followPitch={45}
            animationMode="easeTo"
            animationDuration={300}
          />
        ) : (
          <Mapbox.Camera
            key={`cam-${cameraCoordinate[0].toFixed(4)}-${cameraCoordinate[1].toFixed(4)}-${recenterKey}`}
            zoomLevel={12.5}
            centerCoordinate={cameraCoordinate}
            pitch={0}
            animationMode="easeTo"
            animationDuration={600}
          />
        )}

        {followUser && userLocation ? (
          <Mapbox.LocationPuck
            puckBearingEnabled
            puckBearing="course"
            visible
          />
        ) : null}

        {plannedRouteFeatureCollection ? (
          <Mapbox.ShapeSource id="history-planned-route" shape={plannedRouteFeatureCollection}>
            <Mapbox.LineLayer
              id="history-planned-route-layer"
              style={{
                lineColor: plannedRouteColor,
                lineWidth: 4,
                lineOpacity: 0.7,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {trailFeatureCollection ? (
          <Mapbox.ShapeSource id="history-trail" shape={trailFeatureCollection}>
            <Mapbox.LineLayer
              id="history-trail-layer"
              style={{
                lineColor: '#2196F3',
                lineWidth: 4,
                lineOpacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {/* Single VectorSource for bike lanes + POIs from Mapbox Streets v8 */}
        <Mapbox.VectorSource
          id="mapbox-streets-overlay"
          url="mapbox://mapbox.mapbox-streets-v8"
          onPress={handlePoiPress}
        >
          {showBicycleLanes ? (
            <>
              <Mapbox.LineLayer
                id="bike-lanes-cycleway"
                sourceLayerID="road"
                filter={['all',
                  ['==', ['get', 'class'], 'path'],
                  ['==', ['get', 'type'], 'cycleway'],
                ]}
                style={{
                  lineColor: '#4A9EAF',
                  lineWidth: 3,
                  lineOpacity: 0.85,
                  lineJoin: 'round',
                  lineCap: 'round',
                  lineEmissiveStrength: 1,
                }}
              />
              <Mapbox.LineLayer
                id="bike-lanes-onroad"
                sourceLayerID="road"
                filter={['==', ['get', 'bike_lane'], 'yes']}
                style={{
                  lineColor: '#4A9EAF',
                  lineWidth: 2,
                  lineOpacity: 0.7,
                  lineJoin: 'round',
                  lineCap: 'round',
                  lineDasharray: [2, 1],
                  lineEmissiveStrength: 1,
                }}
              />
            </>
          ) : null}
          <Mapbox.CircleLayer
            id="poi-hydration"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.hydration ? ['in', ['get', 'maki'], ['literal', ['drinking-water', 'cafe']]] : ['==', ['get', 'maki'], '__off__']}
            style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
          />
          <Mapbox.SymbolLayer
            id="poi-hydration-icon"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.hydration ? ['in', ['get', 'maki'], ['literal', ['drinking-water', 'cafe']]] : ['==', ['get', 'maki'], '__off__']}
            style={{ textField: 'W', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
          />
          <Mapbox.CircleLayer
            id="poi-repair"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.repair ? ['any',
              ['==', ['get', 'maki'], 'bicycle'],
              ['all', ['==', ['get', 'maki'], 'shop'], ['match', ['get', 'type'], ['Bicycle', 'Bicycle Shop', 'Bike', 'Bike Shop', 'Bicycle Repair'], true, false]],
            ] : ['==', ['get', 'maki'], '__off__']}
            style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
          />
          <Mapbox.SymbolLayer
            id="poi-repair-icon"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.repair ? ['any',
              ['==', ['get', 'maki'], 'bicycle'],
              ['all', ['==', ['get', 'maki'], 'shop'], ['match', ['get', 'type'], ['Bicycle', 'Bicycle Shop', 'Bike', 'Bike Shop', 'Bicycle Repair'], true, false]],
            ] : ['==', ['get', 'maki'], '__off__']}
            style={{ textField: 'B', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
          />
          <Mapbox.CircleLayer
            id="poi-restroom"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.restroom ? ['==', ['get', 'maki'], 'toilet'] : ['==', ['get', 'maki'], '__off__']}
            style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
          />
          <Mapbox.SymbolLayer
            id="poi-restroom-icon"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.restroom ? ['==', ['get', 'maki'], 'toilet'] : ['==', ['get', 'maki'], '__off__']}
            style={{ textField: 'WC', textSize: 9, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
          />
          <Mapbox.CircleLayer
            id="poi-bike-rental-vt"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.bikeRental ? ['==', ['get', 'maki'], 'bicycle-share'] : ['==', ['get', 'maki'], '__off__']}
            style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
          />
          <Mapbox.SymbolLayer
            id="poi-bike-rental-vt-icon"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.bikeRental ? ['==', ['get', 'maki'], 'bicycle-share'] : ['==', ['get', 'maki'], '__off__']}
            style={{ textField: 'R', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
          />
          <Mapbox.CircleLayer
            id="poi-supplies"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.supplies ? ['in', ['get', 'maki'], ['literal', ['convenience', 'grocery']]] : ['==', ['get', 'maki'], '__off__']}
            style={{ circleColor: '#D4A843', circleRadius: 10, circleStrokeColor: '#FFFFFF', circleStrokeWidth: 1.5, circleEmissiveStrength: 1 }}
          />
          <Mapbox.SymbolLayer
            id="poi-supplies-icon"
            sourceLayerID="poi_label"
            minZoomLevel={14}
            filter={poiVisibility?.supplies ? ['in', ['get', 'maki'], ['literal', ['convenience', 'grocery']]] : ['==', ['get', 'maki'], '__off__']}
            style={{ textField: 'S', textSize: 11, textColor: '#1A1A1A', textAllowOverlap: true, textIgnorePlacement: true, textEmissiveStrength: 1 }}
          />
        </Mapbox.VectorSource>

        {routeFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="route-alternatives" shape={routeFeatureCollection}>
            <Mapbox.LineLayer
              id="route-alternatives-unselected"
              filter={['!=', ['get', 'selected'], true]}
              style={{
                lineColor: gray[400],
                lineOpacity: 0.6,
                lineWidth: 4,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
            <Mapbox.LineLayer
              id="route-alternatives-selected"
              filter={['==', ['get', 'selected'], true]}
              style={{
                lineColor: brandColors.accent,
                lineWidth: 6,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {riskFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="risk-segments" shape={riskFeatureCollection}>
            <Mapbox.LineLayer
              id="risk-segments-layer"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: 5,
                lineOpacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {parkingVisible && bicycleParkingFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource
            key="bicycle-parking-visible"
            id="bicycle-parking"
            shape={bicycleParkingFeatureCollection}
          >
            <Mapbox.CircleLayer
              id="bicycle-parking-bg"
              minZoomLevel={12}
              style={{
                circleColor: '#D4A843',
                circleRadius: parkingVisible ? 10 : 0,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: parkingVisible ? 1.5 : 0,
                circleOpacity: parkingVisible ? 0.9 : 0,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.SymbolLayer
              id="bicycle-parking-label"
              minZoomLevel={12}
              style={{
                textField: 'P',
                textSize: 11,
                textColor: '#1A1A1A',
                textOpacity: parkingVisible ? 1 : 0,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {rentalVisible && bicycleRentalFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource
            key="bicycle-rental-visible"
            id="bicycle-rental"
            shape={bicycleRentalFeatureCollection}
          >
            <Mapbox.CircleLayer
              id="bicycle-rental-bg"
              minZoomLevel={12}
              style={{
                circleColor: '#D4A843',
                circleRadius: rentalVisible ? 10 : 0,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: rentalVisible ? 1.5 : 0,
                circleOpacity: rentalVisible ? 0.9 : 0,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.SymbolLayer
              id="bicycle-rental-label"
              minZoomLevel={12}
              style={{
                textField: 'R',
                textSize: 11,
                textColor: '#1A1A1A',
                textOpacity: rentalVisible ? 1 : 0,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {repairVisible && bikeShopFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource key="bike-shops-visible" id="bike-shops" shape={bikeShopFeatureCollection}>
            <Mapbox.CircleLayer
              id="bike-shop-bg"
              minZoomLevel={12}
              style={{
                circleColor: '#D4A843',
                circleRadius: repairVisible ? 10 : 0,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: repairVisible ? 1.5 : 0,
                circleOpacity: repairVisible ? 0.9 : 0,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.SymbolLayer
              id="bike-shop-label"
              minZoomLevel={12}
              style={{
                textField: 'B',
                textSize: 11,
                textColor: '#1A1A1A',
                textOpacity: repairVisible ? 1 : 0,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {searchedPoiFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource
            key={`searched-pois-${searchedPoiFeatureCollection.features.length}`}
            id="searched-pois"
            shape={searchedPoiFeatureCollection}
            onPress={handlePoiPress}
          >
            <Mapbox.CircleLayer
              id="searched-poi-bg"
              minZoomLevel={11}
              style={{
                circleColor: '#D4A843',
                circleRadius: 10,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 1.5,
                circleOpacity: 0.9,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.SymbolLayer
              id="searched-poi-label"
              minZoomLevel={11}
              style={{
                textField: ['get', 'label'],
                textSize: 11,
                textColor: '#1A1A1A',
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {hazardZoneFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="hazard-zones" shape={hazardZoneFeatureCollection}>
            <Mapbox.LineLayer
              id="hazard-zone-black"
              style={{
                lineColor: '#000000',
                lineWidth: 8,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
                lineEmissiveStrength: 1,
              }}
            />
            <Mapbox.LineLayer
              id="hazard-zone-red"
              style={{
                lineColor: '#DC2626',
                lineWidth: 6,
                lineDasharray: [1, 1.5],
                lineOpacity: 0.95,
                lineCap: 'butt',
                lineJoin: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {hazardFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="hazards" shape={hazardFeatureCollection}>
            <Mapbox.CircleLayer
              id="hazards-bg"
              style={{
                circleColor: '#FF6B00',
                circleRadius: 9,
                circleStrokeColor: '#FFFFFF',
                circleStrokeWidth: 2,
                circleOpacity: 0.9,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.SymbolLayer
              id="hazards-label"
              style={{
                textField: '!',
                textSize: 13,
                textColor: '#FFFFFF',
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {markerFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="route-markers" shape={markerFeatureCollection}>
            <Mapbox.CircleLayer
              id="route-marker-origin"
              filter={['==', ['get', 'kind'], 'origin']}
              style={{
                circleColor: safetyColors.safe,
                circleRadius: 6,
                circleStrokeColor: gray[50],
                circleStrokeWidth: 2,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.CircleLayer
              id="route-marker-destination"
              filter={['==', ['get', 'kind'], 'destination']}
              style={{
                circleColor: safetyColors.info,
                circleRadius: 6,
                circleStrokeColor: gray[50],
                circleStrokeWidth: 2,
                circleEmissiveStrength: 1,
              }}
            />
            <Mapbox.CircleLayer
              id="route-marker-user"
              filter={['==', ['get', 'kind'], 'user']}
              style={{
                circleColor: safetyColors.info,
                circleRadius: 7,
                circleStrokeColor: brandColors.textPrimary,
                circleStrokeWidth: 3,
                circleEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {offRouteFeatureCollection.features.length > 0 ? (
          <Mapbox.ShapeSource id="off-route-connector" shape={offRouteFeatureCollection}>
            <Mapbox.LineLayer
              id="off-route-connector-layer"
              style={{
                lineColor: safetyColors.caution,
                lineWidth: 3,
                lineDasharray: [1.2, 1.2],
                lineOpacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {/* POI layers are inside mapbox-streets-overlay VectorSource above */}
      </Mapbox.MapView>

      {hazardPlacementMode ? (
        <View style={styles.crosshairOverlay} pointerEvents="none">
          <Ionicons name="add-circle-outline" size={40} color={darkTheme.accent} />
          <Text style={styles.crosshairLabel}>Tap map to place hazard</Text>
        </View>
      ) : null}

      {selectedPoi ? (() => {
        const screenW = Dimensions.get('window').width;
        const screenH = Dimensions.get('window').height;
        const cardW = screenW * 0.44;
        const cardH = 60;
        // Position card to the right of dot, or left if too close to right edge
        const toRight = selectedPoi.screenX < screenW * 0.55;
        const cardLeft = toRight
          ? Math.min(selectedPoi.screenX + 16, screenW - cardW - 8)
          : Math.max(selectedPoi.screenX - cardW - 16, 8);
        // Vertically center on the dot, clamped to screen
        const cardTop = Math.max(8, Math.min(selectedPoi.screenY - cardH / 2, screenH - cardH - 8));

        return (
          <Pressable
            style={[styles.poiCard, { left: cardLeft, top: cardTop, width: cardW }]}
            onPress={() => setSelectedPoi(null)}
          >
            <View style={styles.poiCardContent}>
              <View style={styles.poiCardHeader}>
                <Text style={styles.poiCardType}>{selectedPoi.type}</Text>
                <Pressable onPress={() => setSelectedPoi(null)} hitSlop={8}>
                  <Ionicons name="close" size={12} color={gray[400]} />
                </Pressable>
              </View>
              <Text style={styles.poiCardName} numberOfLines={1}>{selectedPoi.name}</Text>
              {selectedPoi.website ? (
                <Pressable onPress={() => { void Linking.openURL(selectedPoi.website!); }}>
                  <Text style={styles.poiCardLink}>website ↗</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        );
      })() : null}

      {showRouteOverlay ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>
            {selectedRoute ? `${selectedRoute.route.id} selected` : 'Preview pending'}
          </Text>
          <Text style={styles.overlaySubtitle}>
            {selectedRoute
              ? `${routes.length} alternative${routes.length === 1 ? '' : 's'} · ${selectedRoute.route.riskSegments.length} risk overlays · ${
                  followUser && userLocation ? 'Following rider' : 'Manual camera'
                }`
              : 'Load a route preview to render alternatives and risk segments.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 340,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderStrong,
    backgroundColor: brandColors.bgSecondary,
  },
  containerFullBleed: {
    ...StyleSheet.absoluteFillObject,
    height: undefined,
    borderRadius: 0,
    borderWidth: 0,
  },
  overlay: {
    position: 'absolute',
    right: space[3],
    bottom: space[3],
    left: space[3],
    borderRadius: radii['2xl'],
    backgroundColor: 'rgba(11, 16, 32, 0.92)',
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
  },
  overlayTitle: {
    color: brandColors.accent,
    ...textSm,
    fontFamily: fontFamily.heading.extraBold,
  },
  overlaySubtitle: {
    color: brandColors.textSecondary,
    ...textXs,
    lineHeight: 18,
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space[6],
    gap: space[2],
  },
  fallbackTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 18,
    color: brandColors.textPrimary,
  },
  fallbackText: {
    textAlign: 'center',
    ...textSm,
    color: brandColors.textSecondary,
  },
  parkingCallout: {
    backgroundColor: 'rgba(11, 16, 32, 0.92)',
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderWidth: 1,
    borderColor: brandColors.borderStrong,
  },
  parkingCalloutText: {
    color: '#FFFFFF',
    ...textSm,
    fontFamily: fontFamily.heading.bold,
  },
  crosshairOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[2],
  },
  crosshairLabel: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.accent,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  poiCard: {
    position: 'absolute',
    zIndex: 25,
  },
  poiCardContent: {
    backgroundColor: 'rgba(11, 16, 32, 0.93)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[2] + space[0.5],
    paddingVertical: space[2],
    gap: 2,
  },
  poiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poiCardType: {
    fontSize: 8,
    fontFamily: fontFamily.heading.bold,
    color: '#D4A843',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  poiCardName: {
    fontSize: 11,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  poiCardLink: {
    fontSize: 10,
    color: '#4A9EAF',
    fontFamily: fontFamily.body.medium,
  },
});
