import type { AutocompleteSuggestion, Coordinate, HazardType, SavedRoute } from '@defensivepedal/core';
import { hasStartOverride, matchSavedPlaceKeyword, PLAY_STORE_URL } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { ModeTogglePill } from '../src/components/ModeTogglePill';
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
import { useLockOrientation } from '../src/hooks/useLockOrientation';
import { useResolvedCountry } from '../src/hooks/useResolvedCountry';
import { useWeather } from '../src/hooks/useWeather';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { loadCachedRoute } from '../src/lib/offlineRouteCache';
import { useConnectivity } from '../src/providers/ConnectivityMonitor';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { SearchBar, SelectedLocationPill } from '../src/design-system/molecules';
import { OfflineBanner } from '../src/design-system/molecules/OfflineBanner';
import { WeatherWidget } from '../src/design-system/molecules/WeatherWidget';
import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { CitySuggestionSheet } from '../src/design-system/organisms/CitySuggestionSheet';
import { NearbySheet } from '../src/design-system/organisms/NearbySheet';
import { Button } from '../src/design-system/atoms/Button';
import { Surface } from '../src/design-system/atoms/Card';
import { IconButton } from '../src/design-system/atoms/IconButton';
import { PressableScale } from '../src/design-system/atoms/PressableScale';
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
import { useRecentRideDestinations } from '../src/hooks/useRecentRideDestinations';
import { useSubmitCitySuggestion } from '../src/hooks/useCitySuggestions';

type ActiveField = 'startOverride' | 'destination' | `waypoint-${number}` | null;

const MAX_WAYPOINTS = 3;

/** Format a date as a human-readable "time ago" string. */
const formatTimeAgo = (date: Date): string => {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const isDefaultCoordinate = (coordinate: Coordinate) =>
  coordinate.lat === 0 && coordinate.lon === 0;

const formatCoordinateLabel = (coordinate: Coordinate) =>
  `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;

const coordinatesMatch = (left: Coordinate, right: Coordinate, precision = 0.000001) =>
  Math.abs(left.lat - right.lat) <= precision && Math.abs(left.lon - right.lon) <= precision;

/**
 * Two-line structured display derived from a single-line address label.
 * Fallback for code paths where we only have a cleaned label string
 * (e.g., server-routed reverse geocode) and need to populate the
 * SelectedLocationPill's primary/secondary rows.
 */
interface LocationDisplay {
  primary: string;
  secondary: string;
}

/** Split a cleaned single-line label into "primary, secondary" on the first comma. */
const splitDisplayLabel = (label: string): LocationDisplay => {
  const trimmed = label.trim();
  const firstComma = trimmed.indexOf(',');
  if (firstComma === -1) return { primary: trimmed, secondary: '' };
  return {
    primary: trimmed.slice(0, firstComma).trim(),
    secondary: trimmed.slice(firstComma + 1).trim(),
  };
};

const isSavedPlaceKeyword = (
  query: string,
  places: { home: AutocompleteSuggestion | null; work: AutocompleteSuggestion | null },
) => {
  // Audit 2026-07-05 UX-17: shared, locale-aware keyword matcher — must stay
  // in sync with SearchBar's row injection or typing a keyword suppresses
  // autocomplete without showing the saved place.
  const type = matchSavedPlaceKeyword(query);
  return type !== null && !!places[type];
};

export default function RoutePlanningScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  useLockOrientation();
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
  const resolvedCountry = useResolvedCountry();
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);

  // When the rider picks a destination whose route can't be safety-scored
  // (cross-border, or an endpoint outside RO/ES), force `fast` mode so they
  // can't request a Safe/Flat route that the dispatcher would silently
  // downgrade. Also clear any stale preview so they don't see a Romania
  // route while standing in Madrid.
  //
  // IMPORTANT: gate on a destination actually being set. `routeSupported` is
  // also `false` on the empty planning screen (no destination yet) and while
  // GPS is still resolving the origin — forcing `fast` in those states made
  // `fast` look like the default and clobbered the `safe` default. With no
  // destination there is no route to downgrade, so the default must stand.
  const destinationCoord = routeRequest.destination;
  const hasDestination =
    !!destinationCoord &&
    (destinationCoord.lat !== 0 || destinationCoord.lon !== 0);
  useEffect(() => {
    if (!hasDestination) return;
    if (resolvedCountry.routeSupported) return;
    if (routeRequest.mode !== 'fast') {
      setAvoidHills(false);
      setRoutingMode('fast');
    }
    if (resolvedCountry.unsupportedReason === 'origin_unsupported') {
      // Origin moved out of coverage — previous preview is no longer relevant
      setRoutePreview(null);
    }
  }, [
    hasDestination,
    resolvedCountry.routeSupported,
    resolvedCountry.unsupportedReason,
    routeRequest.mode,
    setAvoidHills,
    setRoutingMode,
    setRoutePreview,
  ]);
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const setPoiVisibility = useAppStore((state) => state.setPoiVisibility);
  const setShowBicycleLanes = useAppStore((state) => state.setShowBicycleLanes);
  const addRecentDestination = useAppStore((state) => state.addRecentDestination);
  const recentRideDestinations = useRecentRideDestinations();
  const backgroundSnapshot = useBackgroundNavigationSnapshot();
  const { isOnline } = useConnectivity();

  // ── Offline cached route ──
  const [cachedRoute, setCachedRoute] = useState<{
    destinationLabel: string;
    cachedAt: string;
  } | null>(null);
  useEffect(() => {
    if (isOnline) {
      setCachedRoute(null);
      return;
    }
    void (async () => {
      try {
        const cached = await loadCachedRoute();
        if (cached) {
          setCachedRoute({
            destinationLabel: cached.destinationLabel,
            cachedAt: cached.cachedAt,
          });
        }
      } catch {
        // Silently fail — cached route is optional
      }
    })();
  }, [isOnline]);

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
  const savedPlaces = useAppStore((state) => state.savedPlaces);
  const setSavedPlace = useAppStore((state) => state.setSavedPlace);
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
  // Structured two-line display state for the SelectedLocationPill. Sourced
  // from suggestion.primaryText/secondaryText on select, or split from the
  // cleaned label string when re-hydrated via reverse geocode.
  const [destinationDisplay, setDestinationDisplay] = useState<LocationDisplay | null>(null);
  const [startOverrideDisplay, setStartOverrideDisplay] = useState<LocationDisplay | null>(null);
  const [waypointDisplays, setWaypointDisplays] = useState<(LocationDisplay | null)[]>([]);
  const syncedOriginKeyRef = useRef<string | null>(null);
  const hazardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeNonceRef = useRef(0);

  const [recenterKey, setRecenterKey] = useState(0);

  // Hazard reporting state
  const [hazardPickerOpen, setHazardPickerOpen] = useState(false);
  const [hazardPlacementMode, setHazardPlacementMode] = useState(false);
  const [selectedHazardType, setSelectedHazardType] = useState<HazardType | null>(null);
  const [pendingHazardCoordinate, setPendingHazardCoordinate] = useState<Coordinate | null>(null);
  const [hazardDescribeMode, setHazardDescribeMode] = useState(false);
  const [hazardDescription, setHazardDescription] = useState('');
  const [mapCenterCoordinate, setMapCenterCoordinate] = useState<Coordinate | null>(null);
  const [hazardToast, setHazardToast] = useState<{ type: 'success' | 'error'; message: string; coordinate?: Coordinate; hazardType?: string } | null>(null);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  const [nearbySheetOpen, setNearbySheetOpen] = useState(false);

  // City suggestion state. Mutually exclusive with hazardPlacementMode (the
  // toggle handlers below force-off the other mode). Shares mapCenterCoordinate
  // since both crosshair modes track the same camera center.
  const [suggestionPlacementMode, setSuggestionPlacementMode] = useState(false);
  const [suggestionDialogVisible, setSuggestionDialogVisible] = useState(false);
  const [pendingSuggestionCoordinate, setPendingSuggestionCoordinate] =
    useState<Coordinate | null>(null);
  const [suggestionToast, setSuggestionToast] = useState<string | null>(null);
  const suggestionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    submit: submitCitySuggestion,
    isSubmitting: isSubmittingCitySuggestion,
  } = useSubmitCitySuggestion();

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

  // Cleanup suggestion toast timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionToastTimerRef.current) {
        clearTimeout(suggestionToastTimerRef.current);
      }
    };
  }, []);

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
    // Slice 5a: stash the saved route id so a subsequent Share action on
    // route-preview emits `source: 'saved'` and populates `source_ref_id`
    // server-side. Must run AFTER setRouteRequest — that action clears the
    // lineage flag defensively on any origin/destination change.
    useAppStore.getState().setLastLoadedSavedRouteId(route.id);
    if (route.waypoints.length > 0) {
      // Clear then add each waypoint
      useAppStore.getState().clearWaypoints();
      const labels: string[] = [];
      for (const wp of route.waypoints) {
        useAppStore.getState().addWaypoint(wp);
        labels.push(formatCoordinateLabel(wp));
      }
      setWaypointQueries(labels);
      setWaypointDisplays(labels.map((l) => splitDisplayLabel(l)));
    }
    setDestinationQuery(route.name);
    setDestinationDisplay({ primary: route.name, secondary: 'Saved route' });
    setDestinationHydrated(true);
    // Touch last_used_at
    void mobileApi.useSavedRoute(route.id);
    router.push('/route-preview');
  }, [setRouteRequest, setDestinationQuery, setDestinationHydrated, setWaypointQueries]);

  const handleMapTap = useCallback(() => {
    // Don't toggle UI while in any crosshair placement mode
    if (hazardPlacementMode || suggestionPlacementMode) return;
    const next = !uiCollapsed;
    setUiCollapsed(next);
    Animated.timing(uiOpacity, {
      toValue: next ? 0 : 1,
      duration: duration.fast,
      easing: easing.default,
      useNativeDriver: true,
    }).start();
  }, [hazardPlacementMode, suggestionPlacementMode, uiCollapsed, uiOpacity]);

  const handleMapLongPress = async (coordinate: Coordinate) => {
    // Suppress long-press shortcuts during suggestion placement
    if (suggestionPlacementMode) return;
    // If hazard placement FAB is active, open hazard picker
    if (hazardPlacementMode) {
      setPendingHazardCoordinate(coordinate);
      setHazardPickerOpen(true);
      return;
    }

    // Otherwise, set as destination
    setShowLongPressHint(false);
    setRouteRequest({ destination: coordinate });
    const fallbackLabel = `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;
    setDestinationQuery(fallbackLabel);
    setDestinationDisplay({ primary: 'Dropped pin', secondary: fallbackLabel });
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
        setDestinationDisplay({
          primary: result.primaryText,
          secondary: result.secondaryText || splitDisplayLabel(result.label).secondary,
        });
      }
    } catch {
      // Keep coordinate label as fallback
    }
  };

  const submitHazardOther = (coordinate: Coordinate, source: 'armchair' | 'manual', description: string) => {
    const trimmed = description.trim().slice(0, 280);
    enqueueMutation('hazard', {
      coordinate,
      reportedAt: new Date().toISOString(),
      source,
      hazardType: 'other',
      ...(trimmed.length > 0 ? { description: trimmed } : {}),
    });
    setHazardToast({ type: 'success', message: t('hazard.reported'), coordinate, hazardType: 'other' });
    if (hazardToastTimerRef.current) clearTimeout(hazardToastTimerRef.current);
    hazardToastTimerRef.current = setTimeout(() => setHazardToast(null), 5000);
  };

  const handleHazardTypeSelect = (hazardType: HazardType) => {
    // "Other" routes through the describe stage for an optional free-text note.
    if (hazardType === 'other') {
      setHazardDescribeMode(true);
      return;
    }

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

  const handleHazardDescribeSubmit = () => {
    // Long-press flow: fire immediately at the pinned coordinate.
    if (pendingHazardCoordinate) {
      submitHazardOther(pendingHazardCoordinate, 'armchair', hazardDescription);
      setPendingHazardCoordinate(null);
      setHazardPickerOpen(false);
      setHazardDescribeMode(false);
      setHazardDescription('');
      return;
    }

    // FAB flow: carry description into placement mode. Confirm-button handler
    // consumes it when the user positions the marker and taps Report.
    setHazardPickerOpen(false);
    setHazardDescribeMode(false);
    setSelectedHazardType('other');
    setHazardPlacementMode(true);
    // `hazardDescription` intentionally retained in state until placement confirm.
  };

  const handleHazardPlacementConfirm = () => {
    if (!selectedHazardType || !mapCenterCoordinate) return;

    if (selectedHazardType === 'other') {
      submitHazardOther(mapCenterCoordinate, 'manual', hazardDescription);
    } else {
      enqueueMutation('hazard', {
        coordinate: mapCenterCoordinate,
        reportedAt: new Date().toISOString(),
        source: 'manual',
        hazardType: selectedHazardType,
      });
      setHazardToast({ type: 'success', message: t('hazard.reported'), coordinate: mapCenterCoordinate, hazardType: selectedHazardType });
      if (hazardToastTimerRef.current) clearTimeout(hazardToastTimerRef.current);
      hazardToastTimerRef.current = setTimeout(() => setHazardToast(null), 5000);
    }

    setHazardPlacementMode(false);
    setSelectedHazardType(null);
    setHazardDescription('');
  };

  const toggleHazardMode = () => {
    if (hazardPlacementMode) {
      setHazardPlacementMode(false);
      setSelectedHazardType(null);
    } else {
      // Mutex: opening hazard mode cancels any active suggestion placement.
      if (suggestionPlacementMode) {
        setSuggestionPlacementMode(false);
        setSuggestionDialogVisible(false);
        setPendingSuggestionCoordinate(null);
      }
      setHazardPickerOpen(true);
    }
  };

  const showSuggestionToast = useCallback((message: string) => {
    setSuggestionToast(message);
    if (suggestionToastTimerRef.current) clearTimeout(suggestionToastTimerRef.current);
    suggestionToastTimerRef.current = setTimeout(() => setSuggestionToast(null), 4000);
  }, []);

  const toggleSuggestionMode = useCallback(() => {
    setSuggestionPlacementMode((prev) => {
      const next = !prev;
      if (!next) {
        setSuggestionDialogVisible(false);
        setPendingSuggestionCoordinate(null);
      } else {
        // Mutex: opening suggestion mode cancels any active hazard placement.
        if (hazardPlacementMode) {
          setHazardPlacementMode(false);
          setSelectedHazardType(null);
        }
        if (hazardPickerOpen) {
          setHazardPickerOpen(false);
        }
      }
      return next;
    });
  }, [hazardPlacementMode, hazardPickerOpen]);

  const handleSuggestionPlacementConfirm = useCallback(() => {
    if (!mapCenterCoordinate) return;
    setPendingSuggestionCoordinate(mapCenterCoordinate);
    setSuggestionDialogVisible(true);
  }, [mapCenterCoordinate]);

  const cancelSuggestionDialog = useCallback(() => {
    setSuggestionDialogVisible(false);
  }, []);

  const handleSuggestionSubmit = useCallback(
    (body: string) => {
      if (!pendingSuggestionCoordinate) return;
      const coordinate = pendingSuggestionCoordinate;
      void submitCitySuggestion({ coordinate, body })
        .then(() => {
          setSuggestionDialogVisible(false);
          setSuggestionPlacementMode(false);
          setPendingSuggestionCoordinate(null);
          showSuggestionToast(
            t(isOnline ? 'citySuggestion.toastSuccess' : 'citySuggestion.toastOffline'),
          );
        })
        .catch(() => {
          showSuggestionToast(t('citySuggestion.toastError'));
        });
    },
    [
      pendingSuggestionCoordinate,
      submitCitySuggestion,
      isOnline,
      showSuggestionToast,
      t,
    ],
  );

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

  // Reverse-geocode custom start (when a startOverride is set, we need its label
  // independently of the GPS-based currentLocationLabel — otherwise the subtitle
  // keeps showing the GPS location after the user changes start and returns from
  // route-preview).
  const startOverrideLabelQuery = useQuery({
    queryKey: ['reverse-geocode', 'start-override', routeRequest.startOverride],
    queryFn: () =>
      mobileApi.reverseGeocode({
        coordinate: routeRequest.startOverride!,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mapboxPublicToken) && Boolean(routeRequest.startOverride),
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
      deferredStartOverrideQuery.length >= 2 &&
      !isSavedPlaceKeyword(deferredStartOverrideQuery, savedPlaces),
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
      deferredDestinationQuery.length >= 2 &&
      !isSavedPlaceKeyword(deferredDestinationQuery, savedPlaces),
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
      const label =
        destinationLabelQuery.data.label ?? formatCoordinateLabel(routeRequest.destination);
      setDestinationQuery(label);
      setDestinationDisplay(splitDisplayLabel(label));
      setDestinationHydrated(true);
    }
  }, [destinationHydrated, destinationLabelQuery.data, routeRequest.destination]);

  // Hydrate startOverride display once its label query resolves.
  useEffect(() => {
    if (!routeRequest.startOverride || startOverrideDisplay) return;
    const label = startOverrideLabelQuery.data?.label;
    if (label) setStartOverrideDisplay(splitDisplayLabel(label));
  }, [routeRequest.startOverride, startOverrideLabelQuery.data?.label, startOverrideDisplay]);

  // --- Handlers ---

  const handleStartOverrideSelect = (suggestion: AutocompleteSuggestion) => {
    setRouteRequest({ startOverride: suggestion.coordinates });
    setStartOverrideQuery(suggestion.label);
    setStartOverrideDisplay({
      primary: suggestion.primaryText,
      secondary: suggestion.secondaryText ?? splitDisplayLabel(suggestion.label).secondary,
    });
    setActiveField(null);
  };

  const handleDestinationSelect = (suggestion: AutocompleteSuggestion) => {
    Keyboard.dismiss();
    setRouteRequest({ destination: suggestion.coordinates });
    setDestinationQuery(suggestion.label);
    setDestinationDisplay({
      primary: suggestion.primaryText,
      secondary: suggestion.secondaryText ?? splitDisplayLabel(suggestion.label).secondary,
    });
    setDestinationHydrated(true);
    setActiveField(null);
    // Save to recent destinations
    addRecentDestination({
      ...suggestion,
      selectedAt: new Date().toISOString(),
    });
  };

  const clearStartOverride = () => {
    setRouteRequest({ startOverride: undefined });
    setStartOverrideQuery('');
    setStartOverrideDisplay(null);
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
    setWaypointDisplays((prev) => {
      const next = [...prev];
      next[index] = {
        primary: suggestion.primaryText,
        secondary: suggestion.secondaryText ?? splitDisplayLabel(suggestion.label).secondary,
      };
      return next;
    });
    setActiveField(null);
  };

  const handleRemoveWaypoint = (index: number) => {
    removeWaypoint(index);
    setWaypointQueries((prev) => prev.filter((_, i) => i !== index));
    setWaypointDisplays((prev) => prev.filter((_, i) => i !== index));
    setActiveField(null);
  };

  /** Swap waypoint at `index` with the current destination. */
  const handleSwapWithDestination = (index: number) => {
    const wp = waypoints[index];
    if (!wp) return;
    const oldDest = routeRequest.destination;
    const oldDestLabel = destinationQuery;
    const oldDestDisplay = destinationDisplay;
    const oldWaypointDisplay = waypointDisplays[index] ?? null;
    // Set the waypoint as the new destination
    setRouteRequest({ destination: wp });
    setDestinationQuery(waypointQueries[index] || formatCoordinateLabel(wp));
    setDestinationDisplay(oldWaypointDisplay);
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
    setWaypointDisplays((prev) => {
      const next = [...prev];
      next[index] = oldDestDisplay;
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

  const customStartLabel = useMemo(() => {
    if (!routeRequest.startOverride) return null;
    return (
      startOverrideLabelQuery.data?.label ??
      formatCoordinateLabel(routeRequest.startOverride)
    );
  }, [routeRequest.startOverride, startOverrideLabelQuery.data?.label]);

  /**
   * Structured two-line display for the origin pill. We always split the
   * resolved label into "primary (street/POI), secondary (city)" so the user
   * sees the same scannable hierarchy as the destination card.
   */
  const originDisplay = useMemo<LocationDisplay>(() => {
    if (customStartEnabled) {
      if (startOverrideDisplay) return startOverrideDisplay;
      if (customStartLabel) return splitDisplayLabel(customStartLabel);
      return { primary: 'Custom start', secondary: '' };
    }
    if (!currentLocation) {
      if (permissionStatus === 'denied') {
        return { primary: 'Location permission denied', secondary: 'Tap to enter a custom start' };
      }
      if (isLocating) return { primary: 'Resolving location…', secondary: '' };
      return { primary: 'Waiting for GPS…', secondary: '' };
    }
    const resolved = currentLocationLabelQuery.data?.label;
    if (resolved) return splitDisplayLabel(resolved);
    return { primary: 'Current Location', secondary: formatCoordinateLabel(currentLocation) };
  }, [
    customStartEnabled,
    customStartLabel,
    startOverrideDisplay,
    currentLocation,
    currentLocationLabelQuery.data?.label,
    isLocating,
    permissionStatus,
  ]);

  // Keep the edit-field query value in sync with the resolved custom start label
  // when the screen re-enters with an existing override (e.g. after returning
  // from route-preview). Without this, the edit input would render empty when
  // the user taps the pencil, even though the override is active.
  useEffect(() => {
    if (customStartLabel && startOverrideQuery === '') {
      setStartOverrideQuery(customStartLabel);
    }
  }, [customStartLabel, startOverrideQuery]);

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
            crosshairMode={
              suggestionPlacementMode
                ? 'suggestion'
                : hazardPlacementMode
                  ? 'hazard'
                  : null
            }
            onCenterChange={
              hazardPlacementMode || suggestionPlacementMode
                ? setMapCenterCoordinate
                : undefined
            }
            a11yContext={{ mode: 'planning' }}
          />
          {showLongPressHint ? (
            <View style={styles.longPressHint} pointerEvents="none">
              <Ionicons name="hand-left-outline" size={14} color="white" />
              <Text style={styles.longPressHintText}>Longpress to set as destination</Text>
            </View>
          ) : null}
        </View>
      }
      topOverlay={
        <View style={styles.topContainer}>
          {/* Offline banner — shown when not connected */}
          <OfflineBanner
            visible={!isOnline}
            message="You're offline — saved routes and recent destinations still available"
          />

          {/* Resume cached route card — shown when offline and a cached route exists */}
          {!isOnline && cachedRoute ? (
            <Pressable
              style={styles.cachedRouteCard}
              onPress={() => {
                // Restore cached route into Zustand store so route-preview/navigation can use it
                const { setRouteRequest, startNavigation } = useAppStore.getState();
                // Navigate directly to navigation screen (resume from where we left off)
                router.replace('/navigation');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Resume last route to ${cachedRoute.destinationLabel}`}
            >
              <View style={styles.cachedRouteContent}>
                <Ionicons name="navigate-outline" size={18} color={colors.accent} />
                <View style={styles.cachedRouteTextWrap}>
                  <Text style={styles.cachedRouteTitle} numberOfLines={1}>
                    Resume last route
                  </Text>
                  <Text style={styles.cachedRouteSubtitle} numberOfLines={1}>
                    {cachedRoute.destinationLabel} — cached{' '}
                    {formatTimeAgo(new Date(cachedRoute.cachedAt))}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={gray[400]} />
              </View>
            </Pressable>
          ) : null}

          {/* Origin card — shown only after destination is set (progressive disclosure) */}
          {(hasValidDestination || activeField === 'startOverride') && (activeField === 'startOverride' ? (
            /* Start override search (expanded) */
            <View style={styles.originCard}>
              <SearchBar
                label={t('planning.customStartLabel')}
                value={startOverrideQuery}
                placeholder={t('planning.searchStartPlaceholder')}
                active
                isLoading={startOverrideAutocompleteQuery.isFetching}
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
                onSelectCurrentLocation={clearStartOverride}
                savedPlaces={savedPlaces}
                onSavePlace={(suggestion, type) => setSavedPlace(type, suggestion)}
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
            /* Normal origin display — collapsed pill */
            <SelectedLocationPill
              label={`From · ${customStartEnabled ? 'Custom start' : 'Current location'}`}
              primaryText={originDisplay.primary}
              secondaryText={originDisplay.secondary}
              dotColor={colors.info}
              onEdit={() => setActiveField('startOverride')}
            />
          ))}

          {/* Destination — pill (collapsed) when selected, SearchBar (expanded) when editing */}
          {hasValidDestination && activeField !== 'destination' ? (
            <SelectedLocationPill
              label="Destination"
              primaryText={destinationDisplay?.primary || destinationQuery || 'Destination'}
              secondaryText={destinationDisplay?.secondary}
              dotColor={colors.accent}
              onEdit={() => {
                if (!isOnline) return;
                setActiveField('destination');
              }}
            />
          ) : (
            <View style={styles.destinationCard}>
              <SearchBar
                label="Destination"
                value={destinationQuery}
                placeholder={t(isOnline ? 'planning.searchPlaceholder' : 'planning.searchPlaceholderOffline')}
                active={isOnline && activeField === 'destination'}
                isLoading={destinationAutocompleteQuery.isFetching}
                errorMessage={
                  destinationAutocompleteQuery.isError
                    ? destinationAutocompleteQuery.error.message
                    : null
                }
                suggestions={mergedDestinationSuggestions}
                recentDestinations={recentRideDestinations}
                onFocus={() => { if (isOnline) setActiveField('destination'); }}
                onChangeText={(value) => {
                  if (!isOnline) return;
                  setDestinationQuery(value);
                  setDestinationHydrated(true);
                  setActiveField('destination');
                }}
                onClear={() => {
                  setDestinationQuery('');
                  setDestinationDisplay(null);
                  setDestinationHydrated(true);
                  setActiveField('destination');
                }}
                onSelectSuggestion={handleDestinationSelect}
                savedPlaces={savedPlaces}
                onSavePlace={(suggestion, type) => setSavedPlace(type, suggestion)}
              />
              {hasValidDestination ? (
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setActiveField(null)}
                  accessibilityLabel="Cancel editing destination"
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelButtonLabel}>Cancel</Text>
                </Pressable>
              ) : null}
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
                    placeholder={t('planning.searchStopPlaceholder')}
                    active
                    isLoading={waypointAutocompleteQuery.isFetching}
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
                    savedPlaces={savedPlaces}
                    onSavePlace={(suggestion, type) => setSavedPlace(type, suggestion)}
                  />
                </View>
              ) : (
                <Pressable
                  style={styles.waypointLabel}
                  onPress={() => setActiveField(`waypoint-${index}` as ActiveField)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit stop ${index + 1}`}
                >
                  <Text style={styles.waypointPrimary} numberOfLines={1}>
                    {waypointDisplays[index]?.primary
                      || splitDisplayLabel(waypointQueries[index] || '').primary
                      || formatCoordinateLabel(wp)}
                  </Text>
                  {waypointDisplays[index]?.secondary
                    || splitDisplayLabel(waypointQueries[index] || '').secondary ? (
                    <Text style={styles.waypointSecondary} numberOfLines={1}>
                      {waypointDisplays[index]?.secondary
                        || splitDisplayLabel(waypointQueries[index] || '').secondary}
                    </Text>
                  ) : null}
                </Pressable>
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
                  placeholder={t('planning.searchStopPlaceholder')}
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
                  savedPlaces={savedPlaces}
                  onSavePlace={(suggestion, type) => setSavedPlace(type, suggestion)}
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

          {/* Safe / Fast / Flat routing toggle — gated by country support.
              Outside RO/ES we hide Safe + Flat (no OSRM data) and surface a
              banner so the rider understands why only Fast is on offer. */}
          {hasValidDestination ? (
            resolvedCountry.routeSupported ? (
              <View>
                <View style={styles.modeToggleRow}>
                  <ModeTogglePill
                    iconName="shield-checkmark-outline"
                    label={t('planning.safe')}
                    isActive={routeRequest.mode === 'safe' && !avoidHills}
                    activeBgColor={safetyTints.infoLight}
                    activeFgColor={colors.info}
                    onPress={() => { setAvoidHills(false); setRoutingMode('safe'); }}
                    accessibilityLabel="Safe routing"
                  />
                  <ModeTogglePill
                    iconName="flash-outline"
                    label={t('planning.fast')}
                    isActive={routeRequest.mode === 'fast'}
                    activeBgColor={safetyTints.infoLight}
                    activeFgColor={colors.info}
                    onPress={() => { setAvoidHills(false); setRoutingMode('fast'); }}
                    accessibilityLabel="Fast routing"
                  />
                  <ModeTogglePill
                    iconName="trending-down-outline"
                    label={t('planning.flat')}
                    isActive={avoidHills && routeRequest.mode === 'safe'}
                    activeBgColor={safetyTints.safeGreenLight}
                    activeFgColor={colors.safe}
                    onPress={() => { setAvoidHills(true); setRoutingMode('safe'); }}
                    accessibilityLabel="Flat routing — avoid hills"
                  />
                </View>
              </View>
            ) : (
              <View
                style={styles.coverageNotice}
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="information-circle-outline" size={16} color={gray[600]} />
                <Text style={styles.coverageNoticeText}>
                  {resolvedCountry.unsupportedReason === 'cross_border'
                    ? t('planning.coverageCrossBorder')
                    : resolvedCountry.unsupportedReason === 'destination_unsupported'
                      ? t('planning.coverageDestinationUnsupported')
                      : t('planning.coverageOriginUnsupported')}
                </Text>
              </View>
            )
          ) : null}
        </View>
      }
      rightOverlay={
        <Animated.View style={[styles.fabColumn, { opacity: uiOpacity }]} pointerEvents={uiCollapsed ? 'none' : 'auto'}>
          <PressableScale
            style={styles.fabButton}
            onPress={() => { void refreshLocation(); setRecenterKey((k) => k + 1); }}
            accessibilityLabel="Center on current location"
            accessibilityRole="button"
          >
            <Ionicons name="locate" size={22} color={gray[700]} />
          </PressableScale>
          <PressableScale
            style={[styles.fabButton, hazardPlacementMode && { backgroundColor: colors.accent }]}
            onPress={toggleHazardMode}
            accessibilityLabel={hazardPlacementMode ? 'Cancel hazard report' : 'Report hazard'}
            accessibilityRole="button"
          >
            <Ionicons
              name={hazardPlacementMode ? 'close' : 'warning'}
              size={22}
              color={hazardPlacementMode ? gray[900] : colors.accent}
            />
          </PressableScale>
          <PressableScale
            style={[styles.fabButton, suggestionPlacementMode && { backgroundColor: colors.accent }]}
            onPress={toggleSuggestionMode}
            accessibilityLabel={t(
              suggestionPlacementMode
                ? 'citySuggestion.fabLabelActive'
                : 'citySuggestion.fabLabel',
            )}
            accessibilityHint={
              suggestionPlacementMode ? undefined : t('citySuggestion.fabHint')
            }
            accessibilityRole="button"
            accessibilityState={{ selected: suggestionPlacementMode }}
          >
            <Ionicons
              name={suggestionPlacementMode ? 'close' : 'bulb-outline'}
              size={22}
              color={suggestionPlacementMode ? gray[900] : colors.accent}
            />
          </PressableScale>
          <PressableScale
            style={styles.fabButton}
            onPress={() => setNearbySheetOpen(true)}
            accessibilityLabel="Show nearby places"
            accessibilityRole="button"
          >
            <Ionicons name="layers-outline" size={22} color={gray[700]} />
          </PressableScale>
          {user && (savedRoutesQuery.data?.length ?? 0) > 0 ? (
            <PressableScale
              style={styles.fabButton}
              onPress={() => setSavedRoutesOpen(true)}
              accessibilityLabel="Saved routes"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark" size={22} color={colors.accent} />
            </PressableScale>
          ) : null}
        </Animated.View>
      }
      footer={
        suggestionPlacementMode ? (
          <View style={styles.hazardPlacementFooter}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!mapCenterCoordinate}
              onPress={handleSuggestionPlacementConfirm}
            >
              {t('citySuggestion.footerConfirm')}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onPress={toggleSuggestionMode}
            >
              {t('citySuggestion.footerCancel')}
            </Button>
          </View>
        ) : hazardPlacementMode ? (
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
              disabled={!hasValidDestination}
              onPress={() => {
                setActiveField(null);
                router.push('/route-preview');
              }}
            >
              {t('planning.previewRoute')}
            </Button>
            {!hasValidDestination ? (
              <Text style={styles.previewHelperText}>
                {t('planning.enterDestinationFirst')}
              </Text>
            ) : null}
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
        onPress={() => {
          setHazardPickerOpen(false);
          setHazardDescribeMode(false);
          setHazardDescription('');
        }}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Dismiss hazard picker"
      >
        <Surface
          variant="panel"
          radius="2xl"
          elevation="lg"
          onPress={(e) => e.stopPropagation()}
          accessible={false}
          style={styles.hazardGridCard}
        >
          {hazardDescribeMode ? (
            <>
              <Text style={styles.hazardGridTitle}>{t('planning.hazardDescribeTitle')}</Text>
              <Text style={styles.hazardGridSubtitle}>{t('planning.hazardDescribeSubtitle')}</Text>
              <TextInput
                style={styles.hazardDescribeInput}
                value={hazardDescription}
                onChangeText={setHazardDescription}
                placeholder={t('planning.hazardDescribePlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={280}
                autoFocus
                accessibilityLabel="Hazard description, optional"
                accessibilityHint="Type a short description of the hazard, or leave blank"
              />
              <Text style={styles.hazardDescribeCounter}>{hazardDescription.length}/280</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.hazardDescribeSubmit,
                  pressed && styles.hazardDescribeSubmitPressed,
                ]}
                onPress={handleHazardDescribeSubmit}
                accessibilityRole="button"
                accessibilityLabel="Report hazard"
              >
                <Text style={styles.hazardDescribeSubmitText}>Report</Text>
              </Pressable>
              <Pressable
                style={styles.hazardGridCancel}
                onPress={() => {
                  setHazardDescribeMode(false);
                  setHazardDescription('');
                }}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Back to hazard types"
              >
                <Text style={styles.hazardGridCancelText}>Back</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hazardGridTitle}>{t('hazard.title')}</Text>
              <View style={styles.hazardGrid}>
                {([
                  { value: 'illegally_parked_car' as HazardType, label: 'Parked car', icon: 'car-outline' as const },
                  { value: 'blocked_bike_lane' as HazardType, label: 'Blocked lane', icon: 'remove-circle-outline' as const },
                  { value: 'pothole' as HazardType, label: 'Pothole', icon: 'alert-circle-outline' as const },
                  { value: 'aggro_dogs' as HazardType, label: 'Aggro dogs', icon: 'paw-outline' as const },
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
            </>
          )}
        </Surface>
      </Pressable>
    ) : null}

    {/* City suggestion dialog */}
    <CitySuggestionSheet
      visible={suggestionDialogVisible}
      title={t('citySuggestion.modalTitle')}
      subtitle={t('citySuggestion.modalSubtitle')}
      placeholder={t('citySuggestion.modalPlaceholder')}
      submitLabel={t('citySuggestion.modalSubmit')}
      submittingLabel={t('citySuggestion.modalSubmitting')}
      cancelLabel={t('citySuggestion.modalCancel')}
      minLengthHint={t('citySuggestion.minLengthHint')}
      submitting={isSubmittingCitySuggestion}
      onSubmit={handleSuggestionSubmit}
      onCancel={cancelSuggestionDialog}
    />

    {/* City suggestion toast */}
    {suggestionToast ? (
      <View style={styles.hazardToastContainer}>
        <Toast
          message={suggestionToast}
          variant="info"
          onDismiss={() => setSuggestionToast(null)}
        />
      </View>
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
                message: `⚠️ Cycling hazard reported: ${label} near ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}. Stay safe! — Defensive Pedal ${PLAY_STORE_URL}`,
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

/**
 * Map overlay surfaces (origin/destination/search/FAB/waypoint cards) intentionally
 * use white regardless of theme — they sit on the dark Mapbox style and rely on
 * shadows.md for elevation against light-mode bgDeep too.
 * See docs/design-context.md §2 (token rules — exception #1).
 */
// eslint-disable-next-line no-restricted-syntax
const MAP_OVERLAY_BG = '#FFFFFF';

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    rootWrapper: {
      flex: 1,
    },
    topContainer: {
      gap: space[2],
    },
    cachedRouteCard: {
      backgroundColor: MAP_OVERLAY_BG,
      borderRadius: radii.xl,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      ...shadows.md,
    },
    cachedRouteContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    cachedRouteTextWrap: {
      flex: 1,
      gap: 2,
    },
    cachedRouteTitle: {
      color: gray[800],
      fontFamily: fontFamily.body.bold,
      fontSize: 15,
    },
    cachedRouteSubtitle: {
      color: gray[500],
      fontSize: 12,
    },
    originCard: {
      backgroundColor: MAP_OVERLAY_BG,
      borderRadius: radii.xl,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      ...shadows.md,
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
      backgroundColor: MAP_OVERLAY_BG,
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
    coverageNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      backgroundColor: surfaceTints.glassLight,
      borderRadius: radii.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      ...shadows.sm,
    },
    coverageNoticeText: {
      ...textXs,
      flex: 1,
      color: gray[700],
    },
    searchOverlay: {
      backgroundColor: MAP_OVERLAY_BG,
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
      backgroundColor: MAP_OVERLAY_BG,
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
    previewHelperText: {
      ...textXs,
      fontFamily: fontFamily.body.regular,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: space[2],
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
      padding: space[4],
      gap: space[3],
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
    hazardGridSubtitle: {
      fontFamily: fontFamily.body.regular,
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: -space[1],
      marginBottom: space[2],
    },
    hazardDescribeInput: {
      backgroundColor: colors.bgSecondary,
      color: colors.textPrimary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      minHeight: 96,
      textAlignVertical: 'top',
      fontFamily: fontFamily.body.regular,
      fontSize: 15,
    },
    hazardDescribeCounter: {
      fontFamily: fontFamily.body.regular,
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: space[1],
    },
    hazardDescribeSubmit: {
      backgroundColor: colors.accent,
      borderRadius: radii.lg,
      paddingVertical: space[3],
      alignItems: 'center',
      marginTop: space[2],
    },
    hazardDescribeSubmitPressed: {
      opacity: 0.85,
    },
    hazardDescribeSubmitText: {
      fontFamily: fontFamily.heading.semiBold,
      fontSize: 14,
      color: colors.bgDeep,
      letterSpacing: 0.5,
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
      color: gray[50],
    },
    waypointSearchWrap: {
      flex: 1,
    },
    waypointLabel: {
      flex: 1,
      backgroundColor: MAP_OVERLAY_BG,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      gap: 2,
      ...shadows.sm,
    },
    waypointLabelText: {
      fontSize: 14,
      fontFamily: fontFamily.body.medium,
      color: gray[800],
    },
    waypointPrimary: {
      fontSize: 14,
      fontFamily: fontFamily.body.bold,
      color: gray[800],
    },
    waypointSecondary: {
      fontSize: 12,
      color: gray[500],
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
      backgroundColor: surfaceTints.overlay,
      borderRadius: radii.full,
      paddingVertical: space[2],
      paddingHorizontal: space[4],
    },
    longPressHintText: {
      ...textXs,
      color: 'white',
      fontFamily: fontFamily.body.medium,
    },

  });
