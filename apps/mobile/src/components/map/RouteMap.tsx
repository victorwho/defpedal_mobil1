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
import type { NearbyHazard } from '@defensivepedal/core';
import Mapbox from '@rnmapbox/maps';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brandColors, safetyColors } from '../../design-system/tokens/colors';
import { radii } from '../../design-system/tokens/radii';
import { space } from '../../design-system/tokens/spacing';
import { fontFamily, textSm } from '../../design-system/tokens/typography';
import { HazardDetailSheet } from '../../design-system/organisms/HazardDetailSheet';
import { useHazardVote } from '../../hooks/useHazardVote';
import { useT } from '../../hooks/useTranslation';
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
import { ScreenReaderMapSummary } from './ScreenReaderMapSummary';
import type { RouteMapProps, SelectedPoiState } from './types';
import { useCameraConfig } from './useCameraConfig';
import { useFeatureCollections } from './useFeatureCollections';
import { useMapA11ySummary } from './useMapA11ySummary';
import { useShieldMode } from './useShieldMode';

if (mobileEnv.mapboxPublicToken) {
  Mapbox.setAccessToken(mobileEnv.mapboxPublicToken);
}

/** Hoisted Mapbox layer style — avoids re-creating the object on every render. */
const riskOverlayLineStyle = {
  lineWidth: 4,
  lineColor: ['get', 'color'] as any,
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
  a11yContext,
}: RouteMapProps) => {
  const t = useT();
  const mapViewRef = useRef<Mapbox.MapView | null>(null);
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<SelectedPoiState>(null);
  const [selectedHazard, setSelectedHazard] = useState<NearbyHazard | null>(null);
  const hazardVote = useHazardVote();

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
    (hazard: NearbyHazard) => {
      setSelectedHazard(hazard);
      setSelectedPoi(null);
    },
    [],
  );

  const handleHazardVote = useCallback(
    (direction: 'up' | 'down') => {
      if (!selectedHazard) return;
      hazardVote.vote({ hazardId: selectedHazard.id, direction }).catch(() => {
        // Rollback + error surfacing handled inside useHazardVote.
      });
    },
    [hazardVote, selectedHazard],
  );

  // `selectedHazard` is a useState snapshot captured at tap time. After a vote,
  // the TanStack cache updates (optimistically + post-success) but that snapshot
  // stays stale, so the sheet keeps rendering pre-vote score/userVote. Resolve
  // against the live list on every render so the sheet reflects cache truth.
  const displayedHazard = useMemo(() => {
    if (!selectedHazard) return null;
    return nearbyHazards.find((h) => h.id === selectedHazard.id) ?? selectedHazard;
  }, [selectedHazard, nearbyHazards]);

  const parkingVisible = poiVisibility?.bikeParking ?? false;
  const rentalVisible = poiVisibility?.bikeRental ?? false;
  const repairVisible = poiVisibility?.repair ?? false;

  const isDecorative = a11yContext?.decorative === true;
  const a11ySummary = useMapA11ySummary({
    mode: isDecorative || !a11yContext ? 'empty' : a11yContext.mode,
    selectedRoute: selectedRoute?.route ?? null,
    hazardsOnRoute: !isDecorative ? a11yContext?.hazardsOnRoute : undefined,
    nearestApproachingHazard: !isDecorative
      ? a11yContext?.nearestApproachingHazard
      : null,
    isOffRoute: !isDecorative ? a11yContext?.isOffRoute : false,
    remainingDistanceMeters: !isDecorative
      ? a11yContext?.remainingDistanceMeters
      : undefined,
    userLocationKnown: Boolean(userLocation),
    suppressHazardLive: !isDecorative ? a11yContext?.suppressHazardLive : false,
  });

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
    <View
      style={[styles.container, fullBleed ? styles.containerFullBleed : null, containerStyle]}
      accessibilityElementsHidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'auto'}
    >
      <Mapbox.MapView
        ref={mapViewRef as any}
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE_URL}
        onCameraChanged={onCenterChange ? handleCameraChanged : undefined}
        onPress={onMapTap ? handleMapTap : undefined}
        onLongPress={onMapLongPress ? handleMapLongPress : undefined}
        accessibilityLabel={a11ySummary.label}
        accessibilityHint={t('mapA11y.hint')}
      >
        <Mapbox.StyleImport id="basemap" existing config={shieldModeConfig} />

        {followUser && userLocation ? (
          <Mapbox.Camera
            ref={cameraRef as any}
            followUserLocation
            followUserMode={'course' as Mapbox.UserTrackingMode}
            followZoomLevel={17.5}
            followPitch={45}
            animationMode="easeTo"
            animationDuration={300}
          />
        ) : (
          <Mapbox.Camera
            ref={cameraRef as any}
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
          cameraRef={cameraRef}
          suppressClusterTaps={followUser}
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

      <HazardDetailSheet
        hazard={displayedHazard}
        visible={selectedHazard != null}
        onDismiss={dismissHazard}
        onVote={handleHazardVote}
        voteState={hazardVote.isVoting ? 'pending' : 'idle'}
      />

      {showRouteOverlay ? (
        <RouteInfoOverlay
          selectedRoute={selectedRoute}
          routeCount={routes.length}
          followUser={followUser}
          userLocation={userLocation}
        />
      ) : null}

      {!isDecorative ? (
        <ScreenReaderMapSummary
          label={a11ySummary.label}
          liveRegionText={a11ySummary.liveRegionText}
        />
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
