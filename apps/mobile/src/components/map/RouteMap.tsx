/**
 * RouteMap — Orchestrator component for all map rendering.
 *
 * LAYER RENDER ORDER (must be preserved):
 * 1. StyleImport (basemap with Shield Mode)
 * 2. Camera (follow or static)
 * 3. LocationPuck (follow mode only)
 * 4. HistoryLayers — planned route + GPS trail
 * 5. VectorTileLayers — bike lanes + 6 POI pairs from mapbox-streets-v8
 * 6. RouteLayers — route alternatives + risk segments
 * 7. OverpassPoiLayers — parking, rental, bike shops (Overpass API)
 * 8. SearchedPoiLayer — POIs from Mapbox Search Box API
 * 9. HazardLayers — hazard zones + hazard markers
 * 10. MarkerLayers — origin/dest/user markers + off-route connector
 * 11. Overlays — crosshair, POI card, route info
 */
import Mapbox from '@rnmapbox/maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { brandColors, darkTheme, safetyColors } from '../../design-system/tokens/colors';
import { shadows } from '../../design-system/tokens/shadows';
import { radii } from '../../design-system/tokens/radii';
import { space } from '../../design-system/tokens/spacing';
import { fontFamily, textSm } from '../../design-system/tokens/typography';
import { mobileEnv } from '../../lib/env';
import { STANDARD_STYLE_URL } from './constants';
import { HazardLayers } from './layers/HazardLayers';
import { HistoryLayers } from './layers/HistoryLayers';
import { MarkerLayers } from './layers/MarkerLayers';
import { OverpassPoiLayers } from './layers/OverpassPoiLayers';
import { RouteLayers } from './layers/RouteLayers';
import { SearchedPoiLayer } from './layers/SearchedPoiLayer';
import { VectorTileLayers } from './layers/VectorTileLayers';
import { CrosshairOverlay } from './overlays/CrosshairOverlay';
import { PoiCard, usePoiCardHandler } from './overlays/PoiCard';
import { RouteInfoOverlay } from './overlays/RouteInfoOverlay';
import type { RouteMapProps, SelectedPoiState } from './types';
import { useCameraConfig } from './useCameraConfig';
import { useFeatureCollections } from './useFeatureCollections';
import { useShieldMode } from './useShieldMode';

if (mobileEnv.mapboxPublicToken) {
  Mapbox.setAccessToken(mobileEnv.mapboxPublicToken);
}

/** Hoisted Mapbox layer style — avoids re-creating the object on every render. */
const riskOverlayLineStyle = {
  lineWidth: 4,
  lineColor: [
    'interpolate',
    ['linear'],
    ['get', 'riskScore'],
    0, safetyColors.safe,
    33, safetyColors.safe,
    43.5, '#8BC34A',
    51.8, safetyColors.caution,
    57.6, '#FF9800',
    69, '#FF5722',
    101.8, safetyColors.danger,
    120, brandColors.bgDeep,
  ] as any,
  lineOpacity: 0.8,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
  lineEmissiveStrength: 1,
};

export const RouteMap = ({
  routes = [],
  selectedRouteId,
  origin,
  destination,
  waypoints,
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
  onMapLongPress,
  hazardPlacementMode = false,
  onCenterChange,
  historyTrails,
  riskOverlay,
  containerStyle,
}: RouteMapProps) => {
  const mapViewRef = useRef<Mapbox.MapView | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<SelectedPoiState>(null);
  const [selectedHazard, setSelectedHazard] = useState<{
    id: string; type: string; confirmCount: number; denyCount: number;
  } | null>(null);

  const shieldModeConfig = useShieldMode();

  const {
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
  } = useFeatureCollections({
    routes,
    selectedRouteId,
    origin,
    destination,
    waypoints,
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
  });

  const cameraCoordinate = useCameraConfig({
    recenterKey,
    userLocation,
    followUser,
    selectedRoute,
    trailCoordinates,
    destination,
  });

  const handlePoiPress = usePoiCardHandler(mapViewRef, selectedPoi, setSelectedPoi);

  const dismissPoi = useCallback(() => setSelectedPoi(null), []);
  const dismissHazard = useCallback(() => setSelectedHazard(null), []);

  const handleCameraChanged = useCallback(
    (state: any) => {
      const center = state?.properties?.center;
      if (Array.isArray(center) && center.length >= 2) {
        onCenterChange?.({ lat: center[1], lon: center[0] });
      }
    },
    [onCenterChange],
  );

  const handleMapTap = useCallback(
    (event: any) => {
      const coords = event?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        onMapTap?.({ lat: coords[1], lon: coords[0] });
      }
    },
    [onMapTap],
  );

  const handleMapLongPress = useCallback(
    (event: any) => {
      const coords = event?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        onMapLongPress?.({ lat: coords[1], lon: coords[0] });
      }
    },
    [onMapLongPress],
  );

  const handleHazardPress = useCallback(
    (props: { id: string; type: string; confirmCount: number; denyCount: number }) => {
      setSelectedHazard(props);
      setSelectedPoi(null);
    },
    [],
  );

  const parkingVisible = poiVisibility?.bikeParking ?? false;
  const rentalVisible = poiVisibility?.bikeRental ?? false;
  const repairVisible = poiVisibility?.repair ?? false;

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
        onCameraChanged={onCenterChange ? handleCameraChanged : undefined}
        onPress={onMapTap ? handleMapTap : undefined}
        onLongPress={onMapLongPress ? handleMapLongPress : undefined}
      >
        <Mapbox.StyleImport id="basemap" existing config={shieldModeConfig} />

        {followUser && userLocation ? (
          <Mapbox.Camera
            followUserLocation
            followUserMode={'course' as Mapbox.UserTrackingMode}
            followZoomLevel={17.5}
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
            puckBearing={'course' as const}
            visible
          />
        ) : null}

        <HistoryLayers
          trailFeatureCollection={trailFeatureCollection}
          plannedRouteFeatureCollection={plannedRouteFeatureCollection}
          plannedRouteColor={plannedRouteColor}
          historyTrails={historyTrails}
        />

        <VectorTileLayers
          showBicycleLanes={showBicycleLanes}
          poiVisibility={poiVisibility}
          onPoiPress={handlePoiPress}
        />

        <Mapbox.ShapeSource
          id="risk-overlay"
          key={riskOverlay && riskOverlay.features.length > 0 ? 'risk-on' : 'risk-off'}
          shape={riskOverlay ?? { type: 'FeatureCollection', features: [] }}
        >
          <Mapbox.LineLayer
            id="risk-overlay-line"
            style={riskOverlayLineStyle}
          />
        </Mapbox.ShapeSource>

        <RouteLayers
          routeFeatureCollection={routeFeatureCollection}
          riskFeatureCollection={riskFeatureCollection}
        />

        <OverpassPoiLayers
          parkingVisible={parkingVisible}
          rentalVisible={rentalVisible}
          repairVisible={repairVisible}
          bicycleParkingFeatureCollection={bicycleParkingFeatureCollection}
          bicycleRentalFeatureCollection={bicycleRentalFeatureCollection}
          bikeShopFeatureCollection={bikeShopFeatureCollection}
        />

        <SearchedPoiLayer
          searchedPoiFeatureCollection={searchedPoiFeatureCollection}
          onPoiPress={handlePoiPress}
        />

        <HazardLayers
          hazardZoneFeatureCollection={hazardZoneFeatureCollection}
          hazardFeatureCollection={hazardFeatureCollection}
          onHazardPress={handleHazardPress}
        />

        <MarkerLayers
          markerFeatureCollection={markerFeatureCollection}
          offRouteFeatureCollection={offRouteFeatureCollection}
        />
      </Mapbox.MapView>

      {hazardPlacementMode ? <CrosshairOverlay /> : null}

      {selectedPoi ? (
        <PoiCard selectedPoi={selectedPoi} onDismiss={dismissPoi} />
      ) : null}

      {selectedHazard ? (
        <Pressable
          style={styles.hazardCardOverlay}
          onPress={dismissHazard}
          accessibilityRole="button"
          accessibilityLabel={`${HAZARD_LABELS[selectedHazard.type] ?? selectedHazard.type}, ${selectedHazard.confirmCount} confirmed, ${selectedHazard.denyCount} denied. Tap to dismiss.`}
        >
          <View style={styles.hazardCard}>
            <View style={styles.hazardCardRow}>
              <Ionicons name="warning" size={20} color={safetyColors.caution} />
              <Text style={styles.hazardCardType}>
                {HAZARD_LABELS[selectedHazard.type] ?? selectedHazard.type}
              </Text>
            </View>
            <View style={styles.hazardCardRow}>
              <Ionicons name="thumbs-up-outline" size={16} color={safetyColors.safe} />
              <Text style={styles.hazardCardCount}>{selectedHazard.confirmCount} confirmed</Text>
              <Ionicons name="thumbs-down-outline" size={16} color={safetyColors.danger} style={{ marginLeft: 12 }} />
              <Text style={styles.hazardCardCount}>{selectedHazard.denyCount} denied</Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {showRouteOverlay ? (
        <RouteInfoOverlay
          selectedRoute={selectedRoute}
          routeCount={routes.length}
          followUser={followUser}
          userLocation={userLocation}
        />
      ) : null}
    </View>
  );
};

const HAZARD_LABELS: Record<string, string> = {
  illegally_parked_car: 'Parked car',
  blocked_bike_lane: 'Blocked lane',
  missing_bike_lane: 'Missing bike lane',
  pothole: 'Pothole',
  poor_surface: 'Poor surface',
  narrow_street: 'Narrow street',
  dangerous_intersection: 'Dangerous intersection',
  construction: 'Construction',
  aggressive_traffic: 'Aggressive traffic',
  other: 'Other hazard',
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
  hazardCardOverlay: {
    position: 'absolute',
    bottom: '25%',
    alignSelf: 'center',
  },
  hazardCard: {
    backgroundColor: 'rgba(31, 41, 55, 0.95)',
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[1],
    ...shadows.lg,
  },
  hazardCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  hazardCardType: {
    fontFamily: fontFamily.body.semiBold,
    fontSize: 15,
    color: brandColors.textPrimary,
  },
  hazardCardCount: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 14,
    color: brandColors.textPrimary,
  },
  hazardCardHint: {
    fontSize: 11,
    color: darkTheme.textMuted,
    textAlign: 'center',
  },
});
