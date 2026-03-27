import type { AutocompleteSuggestion, Coordinate } from '@defensivepedal/core';
import { hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/RouteMap';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { useBicycleParking } from '../src/hooks/useBicycleParking';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { useAppStore } from '../src/store/appStore';

import { SearchBar } from '../src/design-system/molecules';
import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { Button } from '../src/design-system/atoms/Button';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { fontFamily } from '../src/design-system/tokens/typography';

type ActiveField = 'startOverride' | 'destination' | null;

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
  const customStartEnabled = hasStartOverride(routeRequest);
  const backgroundSnapshot = useBackgroundNavigationSnapshot();

  const {
    location: currentLocation,
    accuracyMeters,
    permissionStatus,
    isLoading: isLocating,
    error: locationError,
    refreshLocation,
  } = useCurrentLocation();
  const hasValidDestination = routeRequest.destination.lat !== 0 && routeRequest.destination.lon !== 0;
  const { parkingLocations } = useBicycleParking(
    routeRequest ? { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon } : null,
    hasValidDestination ? { lat: routeRequest.destination.lat, lon: routeRequest.destination.lon } : null,
  );
  const fallbackUserLocation = backgroundSnapshot.latestLocation?.coordinate ?? null;
  const mapUserLocation = currentLocation ?? fallbackUserLocation;
  const planningOrigin = mapUserLocation ?? routeRequest.origin;

  const [startOverrideQuery, setStartOverrideQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState(
    formatCoordinateLabel(routeRequest.destination),
  );
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [destinationHydrated, setDestinationHydrated] = useState(false);
  const syncedOriginKeyRef = useRef<string | null>(null);

  const deferredStartOverrideQuery = useDeferredValue(startOverrideQuery.trim());
  const deferredDestinationQuery = useDeferredValue(destinationQuery.trim());

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
        coordinate: planningOrigin,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mapboxPublicToken) && Boolean(mapUserLocation),
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
    return currentLocationLabelQuery.data?.label ?? formatCoordinateLabel(planningOrigin);
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
          origin={planningOrigin}
          destination={routeRequest.destination}
          userLocation={mapUserLocation}
          followUser={Boolean(mapUserLocation) && !customStartEnabled && !hasValidDestination}
          fullBleed
          showRouteOverlay={false}
          bicycleParkingLocations={parkingLocations}
        />
      }
      topOverlay={
        <View style={styles.topContainer}>
          {/* Brand logo */}
          <BrandLogo size={48} />

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
        <View style={styles.fabColumn}>
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
            style={styles.fabButton}
            onPress={() => void refreshLocation()}
            accessibilityLabel="Center on current location"
            accessibilityRole="button"
          >
            <Ionicons name="locate" size={22} color={gray[700]} />
          </Pressable>
        </View>
      }
      footer={
        canPreview ? (
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
        ) : null
      }
    />
    <BottomNav activeTab="map" onTabPress={handleTabPress} />
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
    gap: space[3],
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
});
