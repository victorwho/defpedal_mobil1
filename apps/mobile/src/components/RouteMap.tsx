import type { Coordinate, RouteOption } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';
import Mapbox from '@rnmapbox/maps';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, gray, safetyColors } from '../design-system/tokens/colors';
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
  containerStyle?: StyleProp<ViewStyle>;
};

type DecodedRoute = {
  route: RouteOption;
  coordinates: [number, number][];
  isSelected: boolean;
  sortKey: number;
};

const DEFAULT_CENTER: [number, number] = [26.1025, 44.4268];

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
  containerStyle,
}: RouteMapProps) => {
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

  const cameraCoordinate =
    followUser && userLocation
      ? ([userLocation.lon, userLocation.lat] as [number, number])
      : selectedRoute?.coordinates[Math.floor(selectedRoute.coordinates.length / 2)] ??
        (origin ? ([origin.lon, origin.lat] as [number, number]) : null) ??
        (destination ? ([destination.lon, destination.lat] as [number, number]) : null) ??
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
      <Mapbox.MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Outdoors}>
        <Mapbox.Camera
          zoomLevel={followUser && userLocation ? 14 : 12.5}
          centerCoordinate={cameraCoordinate}
          animationMode="easeTo"
          animationDuration={600}
        />

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
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
      </Mapbox.MapView>

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
});
