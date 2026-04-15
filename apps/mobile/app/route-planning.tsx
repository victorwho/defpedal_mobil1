import type { AutocompleteSuggestion, Coordinate, HazardType, SavedRoute } from '@defensivepedal/core';
import { hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
import { NearbySheet } from '../src/design-system/organisms/NearbySheet';
import { Button } from '../src/design-system/atoms/Button';
import { IconButton } from '../src/design-system/atoms/IconButton';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { layout, space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { fontFamily, textXs } from '../src/design-system/tokens/typography';
import { duration, easing } from '../src/design-system/tokens/motion';
import { safetyTints, surfaceTints } from '../src/design-system/tokens/tints';
import { zIndex } from '../src/design-system/tokens/zIndex';
import { useT } from '../src/hooks/useTranslation';
import { usePersonaT } from '../src/hooks/usePersonaT';
import { useRecentRideDestinations } from '../src/hooks/useRecentRideDestinations';
import { useMiaJourney } from '../src/hooks/useMiaJourney';
import { MiaJourneyBar } from '../src/design-system/atoms/MiaJourneyBar';
import { MiaEmptyState } from '../src/design-system/molecules/MiaEmptyState';

type ActiveField = 'startOverride' | 'destination' | `waypoint-${number}` | null;

const MAX_WAYPOINTS = 3;

const isDefaultCoordinate = (coordinate: Coordinate) =>
  coordinate.lat === 0 && coordinate.lon === 0;

const formatCoordinateLabel = (coordinate: Coordinate) =>
  `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;

const coordinatesMatch = (left: Coordinate, right: Coordinate, precision = 0.000001) =>
  Math.abs(left.lat - right.lat) <= precision && Math.abs(left.lon - right.lon) <= precision;

export default function RoutePlanningScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const routeRequest = useAppStore((state) => state.routeRequest);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const setRoutingMode = useAppStore((state) => state.setRoutingMode);
  const avoidHills = useAppStore((state) => state.avoidHills);
  const setAvoidHills = useAppStore((state) => state.setAvoidHills);
  const setRouteRequest = useAppStore((state) => state.setRouteRequest);
  const addWaypoint = useAppStore((state) => state.addWaypoint);
  const removeWaypoint = useAppStore((state) => state.removeWaypoint);
  const reorderWaypoints = useAppStore((state) => state.reorderWaypoints);
  const customStartEnabled = hasStartOverride(routeRequest);
  const waypoints = routeRequest.waypoints ?? [];
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const setPoiVisibility = useAppStore((state) => state.setPoiVisibility);
  const setShowBicycleLanes = useAppStore((state) => state.setShowBicycleLanes);
  const addRecentDestination = useAppStore((state) => state.addRecentDestination);
  const recentRideDestinations = useRecentRideDestinations();
  const backgroundSnapshot = useBackgroundNavigationSnapshot();

  // ── Mia Persona Journey ──
  const persona = useAppStore((state) => state.persona);
  const miaJourneyLevel = useAppStore((state) => state.miaJourneyLevel);
  const miaJourneyStatus = useAppStore((state) => state.miaJourneyStatus);
  const isMia = persona === 'mia' && miaJourneyStatus === 'active';
  const { data: miaJourney } = useMiaJourney();
  const pt = usePersonaT();

  // Mia ride-count lookups: rides needed per level
  const MIA_RIDES_NEEDED: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 12 };
  const miaRidesCompleted = miaJourney?.totalRides ?? 0;
  const miaRidesNeeded = MIA_RIDES_NEEDED[miaJourneyLevel] ?? 12;

  // ── map_browse_session telemetry ──
  const browseStartRef = useRef<number>(Date.now());
  const browseActionCountRef = useRef<number>(0);

  // Emit map_browse_session event on unmount
  useEffect(() => {
    browseStartRef.current = Date.now();
    browseActionCountRef.current = 0;
    return () => {
      const durationSeconds = Math.round((Date.now() - browseStartRef.current) / 1000);
      const state = useAppStore.getState();
      const home = state.homeLocation;
      // Approximate max distance from home using the current map center or route destination
      let maxDistFromHome = 0;
      if (home) {
        const dest = state.routeRequest.destination;
        if (dest.lat !== 0 || dest.lon !== 0) {
          // Haversine approximation (km)
          const dLat = (dest.lat - home.lat) * Math.PI / 180;
          const dLon = (dest.lon - home.lon) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(home.lat * Math.PI / 180) * Math.cos(dest.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          maxDistFromHome = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
      }
      state.enqueueTelemetryEvent({
        eventType: 'map_browse_session',
        properties: {
          duration_seconds: durationSeconds,
          actions_taken: browseActionCountRef.current,
          max_distance_from_home_km: Math.round(maxDistFromHome * 10) / 10,
        },
        timestamp: new Date().toISOString(),
      });
    };
  }, []);

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

  // Set homeLocation on first GPS fix if not already set (used by telemetry)
  const homeLocation = useAppStore((state) => state.homeLocation);
  const setHomeLocation = useAppStore((state) => state.setHomeLocation);
  useEffect(() => {
    if (!homeLocation && currentLocation) {
      setHomeLocation({ lat: currentLocation.lat, lon: currentLocation.lon });
    }
  }, [homeLocation, currentLocation, setHomeLocation]);
  const { weather, isLoading: weatherLoading } = useWeather(
    planningOrigin?.lat ?? null,
    planningOrigin?.lon ?? null,
  );
  const { hazards: nearbyHazards } = useNearbyHazards(planningOrigin, true, 2000);

  const [startOverrideQuery, setStartOverrideQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState(
    isDefaultCoordinate(routeRequest.destination) ? '' : formatCoordinateLabel(routeRequest.destination),
  );
  const [waypointQueries, setWaypointQueries] = useState<string[]>([]);
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [destinationHydrated, setDestinationHydrated] = useState(false);
  const syncedOriginKeyRef = useRef<string | null>(null);
  const hazardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeNonceRef = useRef(0);

  const [recenterKey, setRecenterKey] = useState(0);

  // Hazard reporting state
  const [hazardPickerOpen, setHazardPickerOpen] = useState(false);
  const [hazardPlacementMode, setHazardPlacementMode] = useState(false);
  const [selectedHazardType, setSelectedHazardType] = useState<HazardType | null>(null);
  const [pendingHazardCoordinate, setPendingHazardCoordinate] = useState<Coordinate | null>(null);
  const [mapCenterCoordinate, setMapCenterCoordinate] = useState<Coordinate | null>(null);
  const [hazardToast, setHazardToast] = useState<{ type: 'success' | 'error'; message: string; coordinate?: Coordinate; hazardType?: string } | null>(null);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  const [nearbySheetOpen, setNearbySheetOpen] = useState(false);

  // Collapsible UI — tap map to toggle FABs, weather, bottom nav
  const [uiCollapsed, setUiCollapsed] = useState(false);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  // Long-press discoverability hint — show briefly on first render, auto-dismiss
  const [showLongPressHint, setShowLongPressHint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowLongPressHint(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup hazard toast timer on unmount
  useEffect(() => {
    return () => {
      if (hazardToastTimerRef.current) {
        clearTimeout(hazardToastTimerRef.current);
      }
    };
  }, []);

  // Mia: force safe mode for levels 1-3
  useEffect(() => {
    if (isMia && miaJourneyLevel <= 3 && routeRequest.mode !== 'safe') {
      setRoutingMode('safe');
    }
  }, [isMia, miaJourneyLevel, routeRequest.mode, setRoutingMode]);

  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const { user } = useAuthSession();
  const t = useT();

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
      avoidHills: route.avoidHills,
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

  const handleMapLongPress = async (coordinate: Coordinate) => {
    // If hazard placement FAB is active, open hazard picker
    if (hazardPlacementMode) {
      setPendingHazardCoordinate(coordinate);
      setHazardPickerOpen(true);
      return;
    }

    // Otherwise, set as destination
    setShowLongPressHint(false);
    setRouteRequest({ destination: coordinate });
    setDestinationQuery(`${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`);
    setDestinationHydrated(true);
    setActiveField(null);

    // Reverse geocode to get a readable address (non-blocking).
    // Track a nonce so that a stale geocode result from an earlier long-press
    // doesn't overwrite the label set by a more recent one.
    const nonce = ++geocodeNonceRef.current;
    try {
      const { reverseGeocodeAddress } = await import('../src/lib/mapbox-search');
      const result = await reverseGeocodeAddress(coordinate.lat, coordinate.lon);
      if (result && geocodeNonceRef.current === nonce) {
        setDestinationQuery(result.label);
      }
    } catch {
      // Keep coordinate label as fallback
    }
  };

  const handleHazardTypeSelect = (hazardType: HazardType) => {
    browseActionCountRef.current += 1;
    // If long-press initiated, submit directly at that coordinate
    if (pendingHazardCoordinate) {
      enqueueMutation('hazard', {
        coordinate: pendingHazardCoordinate,
        reportedAt: new Date().toISOString(),
        source: 'armchair',
        hazardType,
      });
      setPendingHazardCoordinate(null);
      setHazardPickerOpen(false);
      setHazardToast({ type: 'success', message: t('hazard.reported'), coordinate: pendingHazardCoordinate, hazardType });
      if (hazardToastTimerRef.current) clearTimeout(hazardToastTimerRef.current);
      hazardToastTimerRef.current = setTimeout(() => setHazardToast(null), 5000);
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
    setHazardToast({ type: 'success', message: t('hazard.reported'), coordinate: mapCenterCoordinate, hazardType: selectedHazardType });
    if (hazardToastTimerRef.current) clearTimeout(hazardToastTimerRef.current);
    hazardToastTimerRef.current = setTimeout(() => setHazardToast(null), 5000);
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
    enabled: Boolean(mobileEnv.mapboxPublicToken) && !destinationHydrated && !isDefaultCoordinate(routeRequest.destination),
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

  // Merge matching recent ride destinations into autocomplete results.
  // When user has typed >= 2 chars, matching recents appear first (clock icon),
  // then Mapbox results (deduplicated by proximity to recent coordinates).
  const mergedDestinationSuggestions = useMemo(() => {
    const mapboxResults = destinationAutocompleteQuery.data?.suggestions ?? [];
    const query = deferredDestinationQuery.toLowerCase();
    if (query.length < 2) return mapboxResults;

    // Find recents whose label contains the query
    const matchingRecents = recentRideDestinations.filter((r) =>
      r.label.toLowerCase().includes(query),
    );
    if (matchingRecents.length === 0) return mapboxResults;

    // Deduplicate: drop Mapbox results within 200m of a matching recent
    const isNearRecent = (s: AutocompleteSuggestion) =>
      matchingRecents.some((r) => {
        const dlat = s.coordinates.lat - r.coordinates.lat;
        const dlon = s.coordinates.lon - r.coordinates.lon;
        // ~200m threshold (rough degree approximation)
        return Math.abs(dlat) < 0.002 && Math.abs(dlon) < 0.003;
      });

    const dedupedMapbox = mapboxResults.filter((s) => !isNearRecent(s));
    return [...matchingRecents, ...dedupedMapbox];
  }, [destinationAutocompleteQuery.data, deferredDestinationQuery, recentRideDestinations]);

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
    browseActionCountRef.current += 1;
    // Save to recent destinations
    addRecentDestination({
      ...suggestion,
      selectedAt: new Date().toISOString(),
    });
  };

  const clearStartOverride = () => {
    setRouteRequest({ startOverride: undefined });
    setStartOverrideQuery('');
    setActiveField(null);
  };

  const handleAddStop = () => {
    if (waypoints.length >= MAX_WAYPOINTS) return;
    setWaypointQueries((prev) => {
      // Pad to match persisted waypoints — waypointQueries resets to []
      // on screen remount but waypoints survive in Zustand.
      const aligned = prev.length >= waypoints.length
        ? prev
        : [...prev, ...new Array<string>(waypoints.length - prev.length).fill('')];
      return [...aligned, ''];
    });
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
        <View style={{ flex: 1 }}>
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
          {showLongPressHint ? (
            <View style={styles.longPressHint} pointerEvents="none">
              <Ionicons name="hand-left-outline" size={14} color="white" />
              <Text style={styles.longPressHintText}>Long-press map to drop a pin</Text>
            </View>
          ) : null}
        </View>
      }
      topOverlay={
        <View style={styles.topContainer}>
          {/* Mia Journey progress bar */}
          {isMia ? (
            <MiaJourneyBar
              level={miaJourneyLevel}
              levelName={pt(`journey.levelNames.${miaJourneyLevel}`)}
              ridesCompleted={miaRidesCompleted}
              ridesNeeded={miaRidesNeeded}
              onInfoPress={() => router.push('/achievements')}
            />
          ) : null}

          {/* Origin card — shown only after destination is set (progressive disclosure) */}
          {(hasValidDestination || activeField === 'startOverride') && (activeField === 'startOverride' ? (
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={16} color={gray[500]} />
              </Pressable>
            </View>
          ))}

          {/* Destination search bar — hidden for Mia levels 1-2 (auto-route instead) */}
          {isMia && miaJourneyLevel <= 2 ? (
            <Pressable
              style={styles.miaAutoRouteButton}
              onPress={() => router.push('/route-preview')}
              accessibilityLabel={pt('planning.autoRouteButton')}
              accessibilityRole="button"
            >
              <Ionicons name="navigate-outline" size={20} color={colors.textInverse} />
              <Text style={styles.miaAutoRouteLabel}>{pt('planning.autoRouteButton')}</Text>
            </Pressable>
          ) : (
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
                suggestions={mergedDestinationSuggestions}
                recentDestinations={recentRideDestinations}
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
          )}

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
                    errorMessage={
                      waypointAutocompleteQuery.isError
                        ? waypointAutocompleteQuery.error.message
                        : null
                    }
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
                  errorMessage={
                    waypointAutocompleteQuery.isError
                      ? waypointAutocompleteQuery.error.message
                      : null
                  }
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
              <Text style={styles.addStopText}>{t('planning.addStop')}</Text>
            </Pressable>
          ) : null}

          {/* Weather widget — shown when destination set, or when weather is severe (rain >30% or wind >25km/h) */}
          {!activeField && !uiCollapsed && (hasValidDestination || (weather && (weather.precipitationProbability > 30 || weather.windSpeed > 25))) ? (
            <WeatherWidget weather={weather} isLoading={weatherLoading} hasLocation={planningOrigin != null} />
          ) : null}

          {/* Safe / Fast / Flat routing toggle — hidden for Mia levels 1-3, shown with tooltip at 4+ */}
          {hasValidDestination && !(isMia && miaJourneyLevel <= 3) ? (
            <View>
              {isMia && miaJourneyLevel >= 4 ? (
                <Text style={styles.miaToggleTooltip}>You've earned this control</Text>
              ) : null}
              <View style={styles.modeToggleRow}>
                <Pressable
                  style={[
                    styles.modeTogglePill,
                    routeRequest.mode === 'safe' && !avoidHills && styles.modeTogglePillActive,
                  ]}
                  onPress={() => { setAvoidHills(false); setRoutingMode('safe'); }}
                  accessibilityLabel="Safe routing"
                  accessibilityRole="button"
                  accessibilityState={{ selected: routeRequest.mode === 'safe' && !avoidHills }}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={routeRequest.mode === 'safe' && !avoidHills ? colors.info : gray[400]}
                  />
                  <Text
                    style={[
                      styles.modeToggleLabel,
                      routeRequest.mode === 'safe' && !avoidHills && styles.modeToggleLabelActive,
                    ]}
                  >
                    {t('planning.safe')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeTogglePill,
                    routeRequest.mode === 'fast' && styles.modeTogglePillActive,
                  ]}
                  onPress={() => { setAvoidHills(false); setRoutingMode('fast'); }}
                  accessibilityLabel="Fast routing"
                  accessibilityRole="button"
                  accessibilityState={{ selected: routeRequest.mode === 'fast' }}
                >
                  <Ionicons
                    name="flash-outline"
                    size={14}
                    color={routeRequest.mode === 'fast' ? colors.info : gray[400]}
                  />
                  <Text
                    style={[
                      styles.modeToggleLabel,
                      routeRequest.mode === 'fast' && styles.modeToggleLabelActive,
                    ]}
                  >
                    {t('planning.fast')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeTogglePill,
                    avoidHills && routeRequest.mode === 'safe' && styles.modeTogglePillFlat,
                  ]}
                  onPress={() => { setAvoidHills(true); setRoutingMode('safe'); }}
                  accessibilityLabel="Flat routing — avoid hills"
                  accessibilityRole="button"
                  accessibilityState={{ selected: avoidHills && routeRequest.mode === 'safe' }}
                >
                  <Ionicons
                    name="trending-down-outline"
                    size={14}
                    color={avoidHills && routeRequest.mode === 'safe' ? colors.safe : gray[400]}
                  />
                  <Text
                    style={[
                      styles.modeToggleLabel,
                      avoidHills && routeRequest.mode === 'safe' && styles.modeToggleLabelFlat,
                    ]}
                  >
                    {t('planning.flat')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      }
      rightOverlay={
        <Animated.View style={[styles.fabColumn, { opacity: uiOpacity }]} pointerEvents={uiCollapsed ? 'none' : 'auto'}>
          <Pressable
            style={styles.fabButton}
            onPress={() => { void refreshLocation(); setRecenterKey((k) => k + 1); }}
            accessibilityLabel="Center on current location"
            accessibilityRole="button"
          >
            <Ionicons name="locate" size={22} color={gray[700]} />
          </Pressable>
          <Pressable
            style={[styles.fabButton, hazardPlacementMode && { backgroundColor: colors.accent }]}
            onPress={toggleHazardMode}
            accessibilityLabel={hazardPlacementMode ? 'Cancel hazard report' : 'Report hazard'}
            accessibilityRole="button"
          >
            <Ionicons
              name={hazardPlacementMode ? 'close' : 'warning'}
              size={22}
              color={hazardPlacementMode ? '#000' : colors.accent}
            />
          </Pressable>
          <Pressable
            style={styles.fabButton}
            onPress={() => setNearbySheetOpen(true)}
            accessibilityLabel="Show nearby places"
            accessibilityRole="button"
          >
            <Ionicons name="layers-outline" size={22} color={gray[700]} />
          </Pressable>
          {user && (savedRoutesQuery.data?.length ?? 0) > 0 ? (
            <Pressable
              style={styles.fabButton}
              onPress={() => setSavedRoutesOpen(true)}
              accessibilityLabel="Saved routes"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark" size={22} color={colors.accent} />
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
                browseActionCountRef.current += 1;
                setActiveField(null);
                router.push('/route-preview');
              }}
            >
              {t('planning.previewRoute')}
            </Button>
          </View>
        ) : null
      }
    />
    <BottomNav activeTab="map" onTabPress={handleTabPress} hidden={uiCollapsed} />

    {/* "Show nearby" quick-pick sheet */}
    <NearbySheet
      visible={nearbySheetOpen}
      onDismiss={() => setNearbySheetOpen(false)}
      poiVisibility={poiVisibility}
      showBicycleLanes={showBikeLanes}
      onTogglePoi={setPoiVisibility}
      onToggleBikeLanes={setShowBicycleLanes}
    />

    {/* Hazard quick-pick grid overlay (same style as navigation) */}
    {hazardPickerOpen ? (
      <Pressable
        style={styles.hazardGridOverlay}
        onPress={() => setHazardPickerOpen(false)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Dismiss hazard picker"
      >
        <Pressable style={styles.hazardGridCard} onPress={(e) => e.stopPropagation()} accessible={false}>
          <Text style={styles.hazardGridTitle}>{t('hazard.title')}</Text>
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
                <Ionicons name={item.icon} size={24} color={colors.accent} />
                <Text style={styles.hazardGridLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.hazardGridCancel}
            onPress={() => setHazardPickerOpen(false)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Cancel hazard report"
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
        {hazardToast.type === 'success' && hazardToast.coordinate ? (
          <Pressable
            style={styles.shareHazardButton}
            onPress={() => {
              const label = hazardToast.hazardType ?? 'hazard';
              const loc = hazardToast.coordinate!;
              void Share.share({
                message: `⚠️ Cycling hazard reported: ${label} near ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}. Stay safe! — Defensive Pedal`,
              });
            }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Share hazard alert"
          >
            <Ionicons name="share-social-outline" size={16} color={colors.accent} />
            <Text style={styles.shareHazardText}>{t('communityScreen.shareRide').replace('ride', 'alert')}</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}

    {/* Saved routes modal */}
    {savedRoutesOpen ? (
      <Pressable
        style={styles.savedRoutesOverlay}
        onPress={() => setSavedRoutesOpen(false)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Dismiss saved routes"
      >
        <Pressable style={styles.savedRoutesModal} onPress={(e) => e.stopPropagation()} accessible={false}>
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
              <Ionicons name="bookmark" size={16} color={colors.accent} />
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
          <Pressable
            style={styles.savedRoutesCancel}
            onPress={() => setSavedRoutesOpen(false)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.savedRoutesCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed style factory — colors come from useTheme(), layout stays static
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: colors.info,
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
      backgroundColor: surfaceTints.glassLight,
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
      backgroundColor: safetyTints.infoLight,
    },
    modeTogglePillFlat: {
      backgroundColor: safetyTints.safeGreenLight,
    },
    modeToggleLabel: {
      fontSize: 12,
      fontFamily: fontFamily.body.bold,
      color: gray[400],
    },
    modeToggleLabelActive: {
      color: colors.info,
    },
    modeToggleLabelFlat: {
      color: colors.safe,
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
      zIndex: zIndex.toast,
    },
    shareHazardButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[1],
      paddingVertical: space[2],
      marginTop: space[1],
    },
    shareHazardText: {
      ...textXs,
      fontFamily: fontFamily.body.bold,
      color: colors.accent,
    },
    hazardGridOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: surfaceTints.overlaySubtle,
      justifyContent: 'flex-end',
      paddingHorizontal: space[4],
      paddingBottom: space[6],
      zIndex: zIndex.modal,
    },
    hazardGridCard: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      padding: space[4],
      gap: space[3],
      ...shadows.lg,
    },
    hazardGridTitle: {
      fontFamily: fontFamily.heading.semiBold,
      fontSize: 14,
      color: colors.textMuted,
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
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingVertical: space[3],
      paddingHorizontal: space[1],
    },
    hazardGridItemPressed: {
      backgroundColor: colors.bgTertiary,
    },
    hazardGridLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    hazardGridCancel: {
      alignItems: 'center',
      paddingVertical: space[2],
    },
    hazardGridCancelText: {
      fontFamily: fontFamily.body.medium,
      fontSize: 14,
      color: colors.textMuted,
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
      backgroundColor: surfaceTints.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: zIndex.modal,
    },
    savedRoutesModal: {
      width: '85%',
      maxHeight: '70%',
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      padding: space[4],
      gap: space[2],
    },
    savedRoutesTitle: {
      fontSize: 18,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      marginBottom: space[1],
    },
    savedRouteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[2],
      paddingHorizontal: space[2],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.md,
    },
    savedRouteTextWrap: {
      flex: 1,
      gap: 2,
    },
    savedRouteName: {
      fontSize: 14,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
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
      color: colors.textMuted,
    },
    longPressHint: {
      position: 'absolute',
      bottom: 120,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      backgroundColor: 'rgba(0, 0, 0, 0.62)',
      borderRadius: radii.full,
      paddingVertical: space[2],
      paddingHorizontal: space[4],
    },
    longPressHintText: {
      ...textXs,
      color: 'white',
      fontFamily: fontFamily.body.medium,
    },

    // ── Mia persona styles ──
    miaAutoRouteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      backgroundColor: colors.accent,
      borderRadius: radii.full,
      paddingVertical: space[3],
      paddingHorizontal: space[5],
      ...shadows.md,
    },
    miaAutoRouteLabel: {
      ...textXs,
      fontFamily: fontFamily.heading.bold,
      color: colors.textInverse,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    miaToggleTooltip: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.safe,
      textAlign: 'center',
      marginBottom: space[1],
    },
  });
