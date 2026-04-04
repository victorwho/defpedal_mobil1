import type { AutocompleteSuggestion, Coordinate, HazardType, SavedRoute } from '@defensivepedal/core';
import { hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/map';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { useBicycleParking } from '../src/hooks/useBicycleParking';
// Bike lanes now use Mapbox vector tiles directly (no hook needed)
import { useBicycleRental } from '../src/hooks/useBicycleRental';
import { useBikeShops } from '../src/hooks/useBikeShops';
import { useNearbyHazards } from '../src/hooks/useNearbyHazards';
import { usePoiSearch } from '../src/hooks/usePoiSearch';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useWeather } from '../src/hooks/useWeather';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { SearchBar } from '../src/design-system/molecules';
import { WeatherWidget } from '../src/design-system/molecules/WeatherWidget';
import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { Button } from '../src/design-system/atoms/Button';
import { IconButton } from '../src/design-system/atoms/IconButton';
import { Toast } from '../src/design-system/molecules/Toast';
import { brandColors, darkTheme, gray } from '../src/design-system/tokens/colors';
import { layout, space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { fontFamily } from '../src/design-system/tokens/typography';
import { duration, easing } from '../src/design-system/tokens/motion';

type ActiveField = 'startOverride' | 'destination' | `waypoint-${number}` | null;

const MAX_WAYPOINTS = 3;

const formatCoordinateLabel = (coordinate: Coordinate) =>
  `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;

const coordinatesMatch = (left: Coordinate, right: Coordinate, precision = 0.000001) =>
  Math.abs(left.lat - right.lat) <= precision && Math.abs(left.lon - right.lon) <= precision;

export default function RoutePlanningScreen() {
  const routeRequest = useAppStore((state) => state.routeRequest);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const setRoutingMode = useAppStore((state) => state.setRoutingMode);
  const setRouteRequest = useAppStore((state) => state.setRouteRequest);
  const addWaypoint = useAppStore((state) => state.addWaypoint);
  const removeWaypoint = useAppStore((state) => state.removeWaypoint);
  const reorderWaypoints = useAppStore((state) => state.reorderWaypoints);
  const customStartEnabled = hasStartOverride(routeRequest);
  const waypoints = routeRequest.waypoints ?? [];
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const backgroundSnapshot = useBackgroundNavigationSnapshot();

  const {
    location: currentLocation,
    accuracyMeters,
    permissionStatus,
    isLoading: isLocating,
    error: locationError,
    refreshLocation,
  } = useCurrentLocation();
  const fallbackUserLocation = backgroundSnapshot.latestLocation?.coordinate ?? null;
  const mapUserLocation = currentLocation ?? fallbackUserLocation;
  const hasValidDestination = routeRequest.destination.lat !== 0 && routeRequest.destination.lon !== 0;
  const { parkingLocations } = useBicycleParking(
    mapUserLocation ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null),
    hasValidDestination ? routeRequest.destination : null,
  );
  const { rentalLocations } = useBicycleRental(
    mapUserLocation ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null),
    hasValidDestination ? routeRequest.destination : null,
  );
  const { shops: bikeShopLocations } = useBikeShops(
    mapUserLocation ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null),
    hasValidDestination ? routeRequest.destination : null,
    poiVisibility?.repair ?? false,
  );
  const { searchedPois } = usePoiSearch(
    mapUserLocation ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null),
    hasValidDestination ? routeRequest.destination : null,
    poiVisibility,
  );
  const showBikeLanes = useAppStore((state) => state.showBicycleLanes);
  const planningOrigin = mapUserLocation ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null);
  const { weather, isLoading: weatherLoading } = useWeather(
    planningOrigin?.lat ?? null,
    planningOrigin?.lon ?? null,
  );
  const { hazards: nearbyHazards } = useNearbyHazards(planningOrigin, true, 2000);

  const [startOverrideQuery, setStartOverrideQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState(
    formatCoordinateLabel(routeRequest.destination),
  );
  const [waypointQueries, setWaypointQueries] = useState<string[]>([]);
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [destinationHydrated, setDestinationHydrated] = useState(false);
  const syncedOriginKeyRef = useRef<string | null>(null);

  const [recenterKey, setRecenterKey] = useState(0);

  // Hazard reporting state
  const [hazardPickerOpen, setHazardPickerOpen] = useState(false);
  const [hazardPlacementMode, setHazardPlacementMode] = useState(false);
  const [selectedHazardType, setSelectedHazardType] = useState<HazardType | null>(null);
  const [pendingHazardCoordinate, setPendingHazardCoordinate] = useState<Coordinate | null>(null);
  const [mapCenterCoordinate, setMapCenterCoordinate] = useState<Coordinate | null>(null);
  const [hazardToast, setHazardToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);

  // Collapsible UI — tap map to toggle FABs, weather, bottom nav
  const [uiCollapsed, setUiCollapsed] = useState(false);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const { user } = useAuthSession();

  // Saved routes — show when destination is empty and user is signed in
  const savedRoutesQuery = useQuery({
    queryKey: ['saved-routes'],
    queryFn: () => mobileApi.getSavedRoutes(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const handleLoadSavedRoute = useCallback((route: SavedRoute) => {
    setRouteRequest({
      destination: route.destination,
      origin: route.origin,
      mode: route.mode,
      avoidUnpaved: route.avoidUnpaved,
    });
    if (route.waypoints.length > 0) {
      // Clear then add each waypoint
      useAppStore.getState().clearWaypoints();
      const labels: string[] = [];
      for (const wp of route.waypoints) {
        useAppStore.getState().addWaypoint(wp);
        labels.push(formatCoordinateLabel(wp));
      }
      setWaypointQueries(labels);
    }
    setDestinationQuery(route.name);
    setDestinationHydrated(true);
    // Touch last_used_at
    void mobileApi.useSavedRoute(route.id);
    router.push('/route-preview');
  }, [setRouteRequest, setDestinationQuery, setDestinationHydrated, setWaypointQueries]);

  const handleMapTap = useCallback(() => {
    // Don't toggle while in hazard placement mode
    if (hazardPlacementMode) return;
    const next = !uiCollapsed;
    setUiCollapsed(next);
    Animated.timing(uiOpacity, {
      toValue: next ? 0 : 1,
      duration: duration.fast,
      easing: easing.default,
      useNativeDriver: true,
    }).start();
  }, [hazardPlacementMode, uiCollapsed, uiOpacity]);

  const handleMapLongPress = (coordinate: Coordinate) => {
    setPendingHazardCoordinate(coordinate);
    setHazardPickerOpen(true);
  };

  const handleHazardTypeSelect = (hazardType: HazardType) => {
    // If long-press initiated, submit directly at that coordinate
    if (pendingHazardCoordinate) {
      enqueueMutation('hazard', {
        coordinate: pendingHazardCoordinate,
        reportedAt: new Date().toISOString(),
        source: 'manual',
        hazardType,
      });
      setPendingHazardCoordinate(null);
      setHazardPickerOpen(false);
      setHazardToast({ type: 'success', message: 'Reported! Other cyclists will be warned.' });
      setTimeout(() => setHazardToast(null), 3000);
      return;
    }

    // FAB-initiated: enter placement mode
    setHazardPickerOpen(false);
    setSelectedHazardType(hazardType);
    setHazardPlacementMode(true);
  };

  const handleHazardPlacementConfirm = () => {
    if (!selectedHazardType || !mapCenterCoordinate) return;

    enqueueMutation('hazard', {
      coordinate: mapCenterCoordinate,
      reportedAt: new Date().toISOString(),
      source: 'manual',
      hazardType: selectedHazardType,
    });

    setHazardPlacementMode(false);
    setSelectedHazardType(null);
    setHazardToast({ type: 'success', message: 'Reported! Other cyclists will be warned.' });
    setTimeout(() => setHazardToast(null), 3000);
  };

  const toggleHazardMode = () => {
    if (hazardPlacementMode) {
      setHazardPlacementMode(false);
      setSelectedHazardType(null);
    } else {
      setHazardPickerOpen(true);
    }
  };

  const deferredStartOverrideQuery = useDeferredValue(startOverrideQuery.trim());
  const deferredDestinationQuery = useDeferredValue(destinationQuery.trim());

  // Active waypoint search query (reused for whichever waypoint field is active)
  const activeWaypointIndex = activeField?.startsWith('waypoint-')
    ? parseInt(activeField.split('-')[1], 10)
    : -1;
  const activeWaypointQuery = activeWaypointIndex >= 0
    ? (waypointQueries[activeWaypointIndex] ?? '').trim()
    : '';
  const deferredWaypointQuery = useDeferredValue(activeWaypointQuery);

  // Sync GPS origin into route request
  useEffect(() => {
    if (!currentLocation) return;
    const originKey = `${currentLocation.lat.toFixed(6)}:${currentLocation.lon.toFixed(6)}`;
    if (coordinatesMatch(currentLocation, routeRequest.origin)) {
      syncedOriginKeyRef.current = originKey;
      return;
    }
    if (syncedOriginKeyRef.current === originKey) return;
    syncedOriginKeyRef.current = originKey;
    setRouteRequest({ origin: currentLocation });
  }, [currentLocation, routeRequest.origin, setRouteRequest]);

  // Reverse-geocode current location label
  const currentLocationLabelQuery = useQuery({
    queryKey: ['reverse-geocode', 'current-origin', planningOrigin],
    queryFn: () =>
      mobileApi.reverseGeocode({
        coordinate: planningOrigin!,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mapboxPublicToken) && Boolean(planningOrigin),
    retry: false,
  });

  // Hydrate destination label
  const destinationLabelQuery = useQuery({
    queryKey: ['reverse-geocode', 'destination', routeRequest.destination],
    queryFn: () =>
      mobileApi.reverseGeocode({
        coordinate: routeRequest.destination,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mapboxPublicToken) && !destinationHydrated,
    retry: false,
  });

  // Autocomplete queries
  const startOverrideAutocompleteQuery = useQuery({
    queryKey: [
      'autocomplete', 'start-override', deferredStartOverrideQuery,
      routeRequest.origin, routeRequest.locale, routeRequest.countryHint,
    ],
    queryFn: () =>
      mobileApi.autocomplete({
        query: deferredStartOverrideQuery,
        proximity: routeRequest.origin,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
        limit: 5,
      }),
    enabled:
      Boolean(mobileEnv.mapboxPublicToken) &&
      activeField === 'startOverride' &&
      deferredStartOverrideQuery.length >= 2,
  });

  const destinationAutocompleteQuery = useQuery({
    queryKey: [
      'autocomplete', 'destination', deferredDestinationQuery,
      routeRequest.origin, routeRequest.locale, routeRequest.countryHint,
    ],
    queryFn: () =>
      mobileApi.autocomplete({
        query: deferredDestinationQuery,
        proximity: routeRequest.origin,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
        limit: 5,
      }),
    enabled:
      Boolean(mobileEnv.mapboxPublicToken) &&
      activeField === 'destination' &&
      deferredDestinationQuery.length >= 2,
  });

  // Waypoint autocomplete (shared query for whichever waypoint field is active)
  const waypointAutocompleteQuery = useQuery({
    queryKey: [
      'autocomplete', 'waypoint', deferredWaypointQuery,
      routeRequest.origin, routeRequest.locale, routeRequest.countryHint,
    ],
    queryFn: () =>
      mobileApi.autocomplete({
        query: deferredWaypointQuery,
        proximity: routeRequest.origin,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
        limit: 5,
      }),
    enabled:
      Boolean(mobileEnv.mapboxPublicToken) &&
      activeWaypointIndex >= 0 &&
      deferredWaypointQuery.length >= 2,
  });

  // Coverage check
  const coverageQuery = useQuery({
    queryKey: ['coverage', routeRequest.destination, routeRequest.countryHint],
    queryFn: () =>
      mobileApi.getCoverage(
        routeRequest.destination.lat,
        routeRequest.destination.lon,
        routeRequest.countryHint,
      ),
    enabled: Boolean(mobileEnv.mapboxPublicToken),
  });

  useEffect(() => {
    if (!destinationHydrated && destinationLabelQuery.data) {
      setDestinationQuery(
        destinationLabelQuery.data.label ?? formatCoordinateLabel(routeRequest.destination),
      );
      setDestinationHydrated(true);
    }
  }, [destinationHydrated, destinationLabelQuery.data, routeRequest.destination]);

  // --- Handlers ---

  const handleStartOverrideSelect = (suggestion: AutocompleteSuggestion) => {
    setRouteRequest({ startOverride: suggestion.coordinates });
    setStartOverrideQuery(suggestion.label);
    setActiveField(null);
  };

  const handleDestinationSelect = (suggestion: AutocompleteSuggestion) => {
    Keyboard.dismiss();
    setRouteRequest({ destination: suggestion.coordinates });
    setDestinationQuery(suggestion.label);
    setDestinationHydrated(true);
    setActiveField(null);
  };

  const clearStartOverride = () => {
    setRouteRequest({ startOverride: undefined });
    setStartOverrideQuery('');
    setActiveField(null);
  };

  const handleAddStop = () => {
    if (waypoints.length >= MAX_WAYPOINTS) return;
    setWaypointQueries((prev) => [...prev, '']);
    setActiveField(`waypoint-${waypoints.length}` as ActiveField);
  };

  const handleWaypointSelect = (index: number, suggestion: AutocompleteSuggestion) => {
    Keyboard.dismiss();
    addWaypoint(suggestion.coordinates);
    setWaypointQueries((prev) => {
      const next = [...prev];
      next[index] = suggestion.label;
      return next;
    });
    setActiveField(null);
  };

  const handleRemoveWaypoint = (index: number) => {
    removeWaypoint(index);
    setWaypointQueries((prev) => prev.filter((_, i) => i !== index));
    setActiveField(null);
  };

  /** Swap waypoint at `index` with the current destination. */
  const handleSwapWithDestination = (index: number) => {
    const wp = waypoints[index];
    if (!wp) return;
    const oldDest = routeRequest.destination;
    const oldDestLabel = destinationQuery;
    // Set the waypoint as the new destination
    setRouteRequest({ destination: wp });
    setDestinationQuery(waypointQueries[index] || formatCoordinateLabel(wp));
    setDestinationHydrated(true);
    // Replace the waypoint with the old destination
    removeWaypoint(index);
    // Re-add old destination as waypoint at the same index
    // We need to do this via store directly since addWaypoint appends
    const currentWps = [...(useAppStore.getState().routeRequest.waypoints ?? [])];
    currentWps.splice(index, 0, oldDest);
    setRouteRequest({ waypoints: currentWps });
    setWaypointQueries((prev) => {
      const next = [...prev];
      next[index] = oldDestLabel;
      return next;
    });
  };

  const toggleVoiceGuidance = () => {
    const nextEnabled = !voiceGuidanceEnabled;
    setVoiceGuidanceEnabled(nextEnabled);
    if (!nextEnabled) {
      void Speech.stop();
      return;
    }
    Speech.speak('Voice guidance on. Route instructions will play during navigation.', {
      language: routeRequest.locale,
    });
  };

  // --- Derived ---

  const canPreview =
    Boolean(mobileEnv.mobileApiUrl || mobileEnv.mapboxPublicToken) &&
    (Boolean(currentLocation) || customStartEnabled);

  const currentLocationLabel = useMemo(() => {
    if (!currentLocation) {
      if (permissionStatus === 'denied') return 'Location permission denied';
      if (isLocating) return 'Resolving location...';
      return planningOrigin ? formatCoordinateLabel(planningOrigin) : 'Waiting for GPS...';
    }
    return currentLocationLabelQuery.data?.label ?? (planningOrigin ? formatCoordinateLabel(planningOrigin) : 'Waiting for GPS...');
  }, [currentLocation, currentLocationLabelQuery.data?.label, isLocating, planningOrigin, permissionStatus]);

  const handleTabPress = (tab: TabKey) => {
    if (tab === 'history') router.push('/history');
    else if (tab === 'community') router.push('/community');
    else if (tab === 'profile') router.push('/profile');
  };

  // --- Render ---

  return (
    <View style={styles.rootWrapper}>
    <MapStageScreen
      map={
        <RouteMap
          origin={mapUserLocation ?? undefined}
          destination={hasValidDestination ? routeRequest.destination : undefined}
          waypoints={waypoints.length > 0 ? waypoints : undefined}
          userLocation={mapUserLocation}
          followUser={false}
          fullBleed
          showRouteOverlay={false}
          bicycleParkingLocations={parkingLocations}
          bicycleRentalLocations={rentalLocations}
          bikeShopLocations={bikeShopLocations}
          searchedPois={searchedPois}
          showBicycleLanes={showBikeLanes}
          poiVisibility={poiVisibility}
          nearbyHazards={nearbyHazards}
          recenterKey={recenterKey}
          onMapTap={handleMapTap}
          onMapLongPress={handleMapLongPress}
          hazardPlacementMode={hazardPlacementMode}
          onCenterChange={hazardPlacementMode ? setMapCenterCoordinate : undefined}
        />
      }
      topOverlay={
        <View style={styles.topContainer}>
          {/* Origin card — full width, aligned with destination */}
          {activeField === 'startOverride' ? (
            /* Start override search (expanded) */
            <View style={styles.originCard}>
              <SearchBar
                label="Custom start"
                value={startOverrideQuery}
                placeholder="Search a different start point"
                active
                isLoading={startOverrideAutocompleteQuery.isPending}
                errorMessage={
                  startOverrideAutocompleteQuery.isError
                    ? startOverrideAutocompleteQuery.error.message
                    : null
                }
                suggestions={startOverrideAutocompleteQuery.data?.suggestions ?? []}
                onFocus={() => setActiveField('startOverride')}
                onChangeText={(value) => {
                  setStartOverrideQuery(value);
                  setActiveField('startOverride');
                }}
                onClear={() => {
                  clearStartOverride();
                  setActiveField(null);
                }}
                onSelectSuggestion={(suggestion) => {
                  handleStartOverrideSelect(suggestion);
                  setActiveField(null);
                }}
              />
              <Pressable
                style={styles.cancelButton}
                onPress={() => setActiveField(null)}
                accessibilityLabel="Cancel editing start point"
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonLabel}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            /* Normal origin display */
            <View style={styles.originCard}>
              <View style={styles.originContent}>
                <View style={styles.originDot} />
                <View style={styles.originTextWrap}>
                  <Text style={styles.originTitle} numberOfLines={1}>
                    From: {customStartEnabled ? 'Custom Start' : 'Current Location'}
                  </Text>
                  <Text style={styles.originSubtitle} numberOfLines={1}>
                    {currentLocationLabel}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.editButton}
                onPress={() => setActiveField('startOverride')}
                accessibilityLabel="Edit start point"
                accessibilityRole="button"
              >
                <Text style={styles.editButtonLabel}>EDIT</Text>
              </Pressable>
            </View>
          )}

          {/* Destination search bar */}
          <View style={styles.destinationCard}>
            <SearchBar
              label="Destination"
              value={destinationQuery}
              placeholder="Where to?"
              active={activeField === 'destination'}
              isLoading={destinationAutocompleteQuery.isPending}
              errorMessage={
                destinationAutocompleteQuery.isError
                  ? destinationAutocompleteQuery.error.message
                  : null
              }
              suggestions={destinationAutocompleteQuery.data?.suggestions ?? []}
              onFocus={() => setActiveField('destination')}
              onChangeText={(value) => {
                setDestinationQuery(value);
                setDestinationHydrated(true);
                setActiveField('destination');
              }}
              onClear={() => {
                setDestinationQuery('');
                setDestinationHydrated(true);
                setActiveField('destination');
              }}
              onSelectSuggestion={handleDestinationSelect}
            />
          </View>

          {/* Waypoint stops — shown between destination and weather */}
          {waypoints.map((wp, index) => (
            <View key={`waypoint-${index}`} style={styles.waypointRow}>
              <View style={styles.waypointDot}>
                <Text style={styles.waypointDotText}>{index + 1}</Text>
              </View>
              {activeField === `waypoint-${index}` ? (
                <View style={styles.waypointSearchWrap}>
                  <SearchBar
                    label={`Stop ${index + 1}`}
                    value={waypointQueries[index] ?? ''}
                    placeholder="Search for a stop"
                    active
                    isLoading={waypointAutocompleteQuery.isPending}
                    suggestions={waypointAutocompleteQuery.data?.suggestions ?? []}
                    onFocus={() => setActiveField(`waypoint-${index}` as ActiveField)}
                    onChangeText={(value) => {
                      setWaypointQueries((prev) => {
                        const next = [...prev];
                        next[index] = value;
                        return next;
                      });
                      setActiveField(`waypoint-${index}` as ActiveField);
                    }}
                    onClear={() => handleRemoveWaypoint(index)}
                    onSelectSuggestion={(s) => handleWaypointSelect(index, s)}
                  />
                </View>
              ) : (
                <View style={styles.waypointLabel}>
                  <Text style={styles.waypointLabelText} numberOfLines={1}>
                    {waypointQueries[index] || formatCoordinateLabel(wp)}
                  </Text>
                </View>
              )}
              {index > 0 ? (
                <Pressable
                  style={styles.waypointReorder}
                  onPress={() => {
                    reorderWaypoints(index, index - 1);
                    setWaypointQueries((prev) => {
                      const next = [...prev];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    });
                  }}
                  hitSlop={8}
                  accessibilityLabel={`Move stop ${index + 1} up`}
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-up" size={16} color={gray[200]} />
                </Pressable>
              ) : null}
              {index < waypoints.length - 1 ? (
                <Pressable
                  style={styles.waypointReorder}
                  onPress={() => {
                    reorderWaypoints(index, index + 1);
                    setWaypointQueries((prev) => {
                      const next = [...prev];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      return next;
                    });
                  }}
                  hitSlop={8}
                  accessibilityLabel={`Move stop ${index + 1} down`}
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-down" size={16} color={gray[200]} />
                </Pressable>
              ) : hasValidDestination ? (
                <Pressable
                  style={styles.waypointReorder}
                  onPress={() => handleSwapWithDestination(index)}
                  hitSlop={8}
                  accessibilityLabel={`Swap stop ${index + 1} with destination`}
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-down" size={16} color={gray[200]} />
                </Pressable>
              ) : null}
              <Pressable
                style={styles.waypointRemove}
                onPress={() => handleRemoveWaypoint(index)}
                hitSlop={8}
                accessibilityLabel={`Remove stop ${index + 1}`}
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={18} color={gray[200]} />
              </Pressable>
            </View>
          ))}

          {/* Pending waypoint being searched (not yet added to store) */}
          {waypointQueries.length > waypoints.length ? (
            <View style={styles.waypointRow}>
              <View style={styles.waypointDot}>
                <Text style={styles.waypointDotText}>{waypoints.length + 1}</Text>
              </View>
              <View style={styles.waypointSearchWrap}>
                <SearchBar
                  label={`Stop ${waypoints.length + 1}`}
                  value={waypointQueries[waypoints.length] ?? ''}
                  placeholder="Search for a stop"
                  active
                  isLoading={waypointAutocompleteQuery.isPending}
                  suggestions={waypointAutocompleteQuery.data?.suggestions ?? []}
                  onFocus={() => setActiveField(`waypoint-${waypoints.length}` as ActiveField)}
                  onChangeText={(value) => {
                    setWaypointQueries((prev) => {
                      const next = [...prev];
                      next[waypoints.length] = value;
                      return next;
                    });
                    setActiveField(`waypoint-${waypoints.length}` as ActiveField);
                  }}
                  onClear={() => {
                    setWaypointQueries((prev) => prev.slice(0, -1));
                    setActiveField(null);
                  }}
                  onSelectSuggestion={(s) => handleWaypointSelect(waypoints.length, s)}
                />
              </View>
            </View>
          ) : null}

          {/* Add stop button — discrete, only when not at max */}
          {!activeField && waypoints.length < MAX_WAYPOINTS && waypointQueries.length <= waypoints.length ? (
            <Pressable
              style={styles.addStopButton}
              onPress={handleAddStop}
              accessibilityLabel="Add a stop"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={16} color={gray[400]} />
              <Text style={styles.addStopText}>Add stop</Text>
            </Pressable>
          ) : null}

          {/* Weather widget — hidden while typing or when UI collapsed */}
          {!activeField && !uiCollapsed ? (
            <WeatherWidget weather={weather} isLoading={weatherLoading} hasLocation={planningOrigin != null} />
          ) : null}

          {/* Safe / Fast routing toggle */}
          <View style={styles.modeToggleRow}>
            <Pressable
              style={[
                styles.modeTogglePill,
                routeRequest.mode === 'safe' && styles.modeTogglePillActive,
              ]}
              onPress={() => setRoutingMode('safe')}
              accessibilityLabel="Safe routing"
              accessibilityRole="button"
              accessibilityState={{ selected: routeRequest.mode === 'safe' }}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={routeRequest.mode === 'safe' ? '#3B82F6' : gray[400]}
              />
              <Text
                style={[
                  styles.modeToggleLabel,
                  routeRequest.mode === 'safe' && styles.modeToggleLabelActive,
                ]}
              >
                Safe
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeTogglePill,
                routeRequest.mode === 'fast' && styles.modeTogglePillActive,
              ]}
              onPress={() => setRoutingMode('fast')}
              accessibilityLabel="Fast routing"
              accessibilityRole="button"
              accessibilityState={{ selected: routeRequest.mode === 'fast' }}
            >
              <Ionicons
                name="flash-outline"
                size={14}
                color={routeRequest.mode === 'fast' ? '#3B82F6' : gray[400]}
              />
              <Text
                style={[
                  styles.modeToggleLabel,
                  routeRequest.mode === 'fast' && styles.modeToggleLabelActive,
                ]}
              >
                Fast
              </Text>
            </Pressable>
          </View>
        </View>
      }
      rightOverlay={
        <Animated.View style={[styles.fabColumn, { opacity: uiOpacity }]} pointerEvents={uiCollapsed ? 'none' : 'auto'}>
          <Pressable
            style={styles.fabButton}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Menu"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={22} color={gray[700]} />
          </Pressable>
          <Pressable
            style={styles.fabButton}
            onPress={toggleVoiceGuidance}
            accessibilityLabel={voiceGuidanceEnabled ? 'Disable voice guidance' : 'Enable voice guidance'}
            accessibilityRole="button"
          >
            <Ionicons
              name={voiceGuidanceEnabled ? 'volume-high' : 'volume-mute'}
              size={22}
              color={gray[700]}
            />
          </Pressable>
          <Pressable
            style={styles.fabButton}
            onPress={() => router.push('/faq')}
            accessibilityLabel="Frequently asked questions"
            accessibilityRole="button"
          >
            <Ionicons name="help-circle-outline" size={22} color={gray[700]} />
          </Pressable>
          <Pressable
            style={[styles.fabButton, hazardPlacementMode && { backgroundColor: darkTheme.accent }]}
            onPress={toggleHazardMode}
            accessibilityLabel={hazardPlacementMode ? 'Cancel hazard report' : 'Report hazard'}
            accessibilityRole="button"
          >
            <Ionicons
              name={hazardPlacementMode ? 'close' : 'warning'}
              size={22}
              color={hazardPlacementMode ? '#000' : darkTheme.accent}
            />
          </Pressable>
          <Pressable
            style={styles.fabButton}
            onPress={() => { void refreshLocation(); setRecenterKey((k) => k + 1); }}
            accessibilityLabel="Center on current location"
            accessibilityRole="button"
          >
            <Ionicons name="locate" size={22} color={gray[700]} />
          </Pressable>
          {user && (savedRoutesQuery.data?.length ?? 0) > 0 ? (
            <Pressable
              style={styles.fabButton}
              onPress={() => setSavedRoutesOpen(true)}
              accessibilityLabel="Saved routes"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark" size={22} color={brandColors.accent} />
            </Pressable>
          ) : null}
        </Animated.View>
      }
      footer={
        hazardPlacementMode ? (
          <View style={styles.hazardPlacementFooter}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleHazardPlacementConfirm}
            >
              Report here
            </Button>
            <Button
              variant="ghost"
              size="md"
              onPress={() => { setHazardPlacementMode(false); setSelectedHazardType(null); }}
            >
              Cancel
            </Button>
          </View>
        ) : canPreview ? (
          <View style={uiCollapsed ? styles.footerCollapsed : undefined}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => {
                setActiveField(null);
                router.push('/route-preview');
              }}
            >
              Preview route
            </Button>
          </View>
        ) : null
      }
    />
    <BottomNav activeTab="map" onTabPress={handleTabPress} hidden={uiCollapsed} />

    {/* Hazard quick-pick grid overlay (same style as navigation) */}
    {hazardPickerOpen ? (
      <Pressable
        style={styles.hazardGridOverlay}
        onPress={() => setHazardPickerOpen(false)}
      >
        <Pressable style={styles.hazardGridCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.hazardGridTitle}>Report hazard</Text>
          <View style={styles.hazardGrid}>
            {([
              { value: 'illegally_parked_car' as HazardType, label: 'Parked car', icon: 'car-outline' as const },
              { value: 'blocked_bike_lane' as HazardType, label: 'Blocked lane', icon: 'remove-circle-outline' as const },
              { value: 'pothole' as HazardType, label: 'Pothole', icon: 'alert-circle-outline' as const },
              { value: 'construction' as HazardType, label: 'Construction', icon: 'construct-outline' as const },
              { value: 'aggressive_traffic' as HazardType, label: 'Aggro traffic', icon: 'speedometer-outline' as const },
              { value: 'other' as HazardType, label: 'Other', icon: 'ellipsis-horizontal' as const },
            ]).map((item) => (
              <Pressable
                key={item.value}
                style={({ pressed }) => [
                  styles.hazardGridItem,
                  pressed && styles.hazardGridItemPressed,
                ]}
                onPress={() => handleHazardTypeSelect(item.value)}
                accessibilityRole="button"
                accessibilityLabel={`Report ${item.label}`}
              >
                <Ionicons name={item.icon} size={24} color={brandColors.accent} />
                <Text style={styles.hazardGridLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.hazardGridCancel}
            onPress={() => setHazardPickerOpen(false)}
          >
            <Text style={styles.hazardGridCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    ) : null}

    {/* Hazard toast */}
    {hazardToast ? (
      <View style={styles.hazardToastContainer}>
        <Toast
          message={hazardToast.message}
          variant={hazardToast.type === 'success' ? 'success' : 'error'}
          onDismiss={() => setHazardToast(null)}
        />
      </View>
    ) : null}

    {/* Saved routes modal */}
    {savedRoutesOpen ? (
      <Pressable style={styles.savedRoutesOverlay} onPress={() => setSavedRoutesOpen(false)}>
        <Pressable style={styles.savedRoutesModal} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.savedRoutesTitle}>Saved Routes</Text>
          {(savedRoutesQuery.data ?? []).map((route) => (
            <Pressable
              key={route.id}
              style={styles.savedRouteRow}
              onPress={() => {
                setSavedRoutesOpen(false);
                handleLoadSavedRoute(route);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Load saved route: ${route.name}`}
            >
              <Ionicons name="bookmark" size={16} color={brandColors.accent} />
              <View style={styles.savedRouteTextWrap}>
                <Text style={styles.savedRouteName} numberOfLines={1}>{route.name}</Text>
                <Text style={styles.savedRouteMode}>
                  {route.mode === 'safe' ? 'Safe' : 'Fast'}
                  {route.waypoints.length > 0 ? ` · ${route.waypoints.length} stop${route.waypoints.length > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={gray[500]} />
            </Pressable>
          ))}
          <Pressable style={styles.savedRoutesCancel} onPress={() => setSavedRoutesOpen(false)}>
            <Text style={styles.savedRoutesCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
  },
  topContainer: {
    gap: space[2],
  },
  originCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.md,
  },
  originContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 48,
    paddingRight: 44,
  },
  originTextWrap: {
    flex: 1,
    gap: 2,
  },
  originDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  originTitle: {
    color: gray[800],
    fontFamily: fontFamily.body.bold,
    fontSize: 15,
  },
  originSubtitle: {
    color: gray[500],
    fontSize: 13,
  },
  editButton: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: space[1],
    right: space[1],
  },
  editButtonLabel: {
    color: gray[500],
    fontFamily: fontFamily.body.bold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cancelButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: 36,
    justifyContent: 'center',
  },
  cancelButtonLabel: {
    color: gray[500],
    fontFamily: fontFamily.body.bold,
    fontSize: 13,
  },
  destinationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.md,
  },
  modeToggleRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: space[1],
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radii.full,
    padding: 3,
    ...shadows.sm,
  },
  modeTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  modeTogglePillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.10)',
  },
  modeToggleLabel: {
    fontSize: 12,
    fontFamily: fontFamily.body.bold,
    color: gray[400],
  },
  modeToggleLabelActive: {
    color: '#3B82F6',
  },
  searchOverlay: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    padding: space[3],
    ...shadows.md,
  },
  fabColumn: {
    gap: space[2],
  },
  fabButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  hazardOptionList: {
    gap: space[2],
  },
  footerCollapsed: {
    marginBottom: layout.bottomNavHeight,
  },
  hazardPlacementFooter: {
    gap: space[2],
    alignItems: 'center',
  },
  hazardToastContainer: {
    position: 'absolute',
    bottom: '20%',
    left: space[4],
    right: space[4],
    zIndex: 200,
  },
  hazardGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: space[4],
    paddingBottom: space[6],
    zIndex: 100,
  },
  hazardGridCard: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii['2xl'],
    padding: space[4],
    gap: space[3],
    ...shadows.lg,
  },
  hazardGridTitle: {
    fontFamily: fontFamily.heading.semiBold,
    fontSize: 14,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  hazardGridItem: {
    width: '31%' as unknown as number,
    alignItems: 'center',
    gap: space[1],
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.lg,
    paddingVertical: space[3],
    paddingHorizontal: space[1],
  },
  hazardGridItemPressed: {
    backgroundColor: darkTheme.bgTertiary,
  },
  hazardGridLabel: {
    fontSize: 11,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  hazardGridCancel: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  hazardGridCancelText: {
    fontFamily: fontFamily.body.medium,
    fontSize: 14,
    color: darkTheme.textMuted,
  },
  // Waypoint styles
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[1],
  },
  waypointDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: gray[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointDotText: {
    fontSize: 11,
    fontFamily: fontFamily.mono.bold,
    color: '#FFFFFF',
  },
  waypointSearchWrap: {
    flex: 1,
  },
  waypointLabel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    ...shadows.sm,
  },
  waypointLabelText: {
    fontSize: 14,
    fontFamily: fontFamily.body.medium,
    color: gray[800],
  },
  waypointReorder: {
    padding: 2,
  },
  waypointRemove: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    alignSelf: 'flex-start',
    paddingVertical: space[1],
    paddingHorizontal: space[2],
  },
  addStopText: {
    fontSize: 13,
    fontFamily: fontFamily.body.medium,
    color: gray[400],
  },
  savedRoutesOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  savedRoutesModal: {
    width: '85%',
    maxHeight: '70%',
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    padding: space[4],
    gap: space[2],
  },
  savedRoutesTitle: {
    fontSize: 18,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.textPrimary,
    marginBottom: space[1],
  },
  savedRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.md,
  },
  savedRouteTextWrap: {
    flex: 1,
    gap: 2,
  },
  savedRouteName: {
    fontSize: 14,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textPrimary,
  },
  savedRouteMode: {
    fontSize: 12,
    fontFamily: fontFamily.body.regular,
    color: gray[400],
  },
  savedRoutesCancel: {
    alignItems: 'center',
    paddingVertical: space[2],
    marginTop: space[1],
  },
  savedRoutesCancelText: {
    fontSize: 14,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textMuted,
  },
});
