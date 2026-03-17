import type { AutocompleteSuggestion, Coordinate } from '@defensivepedal/core';
import { hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { PlaceSearchField } from '../src/components/PlaceSearchField';
import { RouteMap } from '../src/components/RouteMap';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { mobileTheme } from '../src/lib/theme';
import { useAppStore } from '../src/store/appStore';

type ActiveField = 'startOverride' | 'destination' | null;

const formatCoordinateLabel = (coordinate: Coordinate) =>
  `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;

const coordinatesMatch = (left: Coordinate, right: Coordinate, precision = 0.000001) =>
  Math.abs(left.lat - right.lat) <= precision && Math.abs(left.lon - right.lon) <= precision;

const getCoverageTone = (status: string | undefined) => {
  switch (status) {
    case 'supported':
      return styles.metaBadgeSuccess;
    case 'partial':
      return styles.metaBadgeWarning;
    default:
      return styles.metaBadgeNeutral;
  }
};

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

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    const originKey = `${currentLocation.lat.toFixed(6)}:${currentLocation.lon.toFixed(6)}`;

    if (coordinatesMatch(currentLocation, routeRequest.origin)) {
      syncedOriginKeyRef.current = originKey;
      return;
    }

    if (syncedOriginKeyRef.current === originKey) {
      return;
    }

    syncedOriginKeyRef.current = originKey;
    setRouteRequest({
      origin: currentLocation,
    });
  }, [currentLocation, routeRequest.origin, setRouteRequest]);

  const currentLocationLabelQuery = useQuery({
    queryKey: ['reverse-geocode', 'current-origin', planningOrigin],
    queryFn: () =>
      mobileApi.reverseGeocode({
        coordinate: planningOrigin,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mobileApiUrl) && Boolean(mapUserLocation),
    retry: false,
  });

  const destinationLabelQuery = useQuery({
    queryKey: ['reverse-geocode', 'destination', routeRequest.destination],
    queryFn: () =>
      mobileApi.reverseGeocode({
        coordinate: routeRequest.destination,
        locale: routeRequest.locale,
        countryHint: routeRequest.countryHint,
      }),
    enabled: Boolean(mobileEnv.mobileApiUrl) && !destinationHydrated,
    retry: false,
  });

  const startOverrideAutocompleteQuery = useQuery({
    queryKey: [
      'autocomplete',
      'start-override',
      deferredStartOverrideQuery,
      routeRequest.origin,
      routeRequest.locale,
      routeRequest.countryHint,
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
      Boolean(mobileEnv.mobileApiUrl) &&
      activeField === 'startOverride' &&
      deferredStartOverrideQuery.length >= 2,
  });

  const destinationAutocompleteQuery = useQuery({
    queryKey: [
      'autocomplete',
      'destination',
      deferredDestinationQuery,
      routeRequest.origin,
      routeRequest.locale,
      routeRequest.countryHint,
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
      Boolean(mobileEnv.mobileApiUrl) &&
      activeField === 'destination' &&
      deferredDestinationQuery.length >= 2,
  });

  const coverageQuery = useQuery({
    queryKey: ['coverage', routeRequest.destination, routeRequest.countryHint],
    queryFn: () =>
      mobileApi.getCoverage(
        routeRequest.destination.lat,
        routeRequest.destination.lon,
        routeRequest.countryHint,
      ),
    enabled: Boolean(mobileEnv.mobileApiUrl),
  });

  useEffect(() => {
    if (!destinationHydrated && destinationLabelQuery.data) {
      setDestinationQuery(
        destinationLabelQuery.data.label ?? formatCoordinateLabel(routeRequest.destination),
      );
      setDestinationHydrated(true);
    }
  }, [destinationHydrated, destinationLabelQuery.data, routeRequest.destination]);

  const handleStartOverrideSelect = (suggestion: AutocompleteSuggestion) => {
    setRouteRequest({
      startOverride: suggestion.coordinates,
    });
    setStartOverrideQuery(suggestion.label);
    setActiveField(null);
  };

  const handleDestinationSelect = (suggestion: AutocompleteSuggestion) => {
    setRouteRequest({
      destination: suggestion.coordinates,
    });
    setDestinationQuery(suggestion.label);
    setDestinationHydrated(true);
    setActiveField(null);
  };

  const clearStartOverride = () => {
    setRouteRequest({
      startOverride: undefined,
    });
    setStartOverrideQuery('');
    setActiveField(null);
  };

  const canPreview =
    Boolean(mobileEnv.mobileApiUrl) && (Boolean(currentLocation) || customStartEnabled);
  const coverageStatus = coverageQuery.data?.matched?.status;
  const coverageMessage = !mobileEnv.mobileApiUrl
    ? 'Set EXPO_PUBLIC_MOBILE_API_URL to enable address search and route preview.'
    : coverageQuery.isPending
      ? 'Checking route availability...'
      : coverageQuery.isError
        ? coverageQuery.error.message
        : coverageQuery.data?.matched?.message ??
          'Safe and fast routing are available for this destination.';
  const startSummary = customStartEnabled
    ? `Custom start: ${formatCoordinateLabel(routeRequest.startOverride as Coordinate)}`
    : currentLocation
      ? `Using rider GPS${accuracyMeters !== null ? ` · accuracy ${Math.round(accuracyMeters)} m` : ''}`
      : permissionStatus === 'denied'
        ? 'Location denied. Set a custom start point.'
        : locationError ?? 'Waiting for a live rider fix.';
  const currentLocationLabel = useMemo(() => {
    if (!currentLocation) {
      if (permissionStatus === 'denied') {
        return 'Current location permission was denied.';
      }

      if (isLocating) {
        return 'Resolving current location...';
      }

      return planningOrigin
        ? formatCoordinateLabel(planningOrigin)
        : 'Waiting for a live rider fix.';
    }

    return currentLocationLabelQuery.data?.label ?? formatCoordinateLabel(planningOrigin);
  }, [
    currentLocation,
    currentLocationLabelQuery.data?.label,
    isLocating,
    planningOrigin,
    permissionStatus,
  ]);

  const headerMeta = useMemo(() => {
    if (!mobileEnv.mobileApiUrl) {
      return 'API offline';
    }

    if (coverageQuery.isPending) {
      return 'Coverage check';
    }

    return coverageStatus === 'supported' ? 'Ready to preview' : 'Needs attention';
  }, [coverageQuery.isPending, coverageStatus]);

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

  return (
    <MapStageScreen
      map={
        <RouteMap
          origin={planningOrigin}
          destination={routeRequest.destination}
          userLocation={mapUserLocation}
          followUser={Boolean(mapUserLocation) && !customStartEnabled}
          fullBleed
          showRouteOverlay={false}
        />
      }
      rightOverlay={
        <VoiceGuidanceButton enabled={voiceGuidanceEnabled} onPress={toggleVoiceGuidance} />
      }
      topOverlay={
        <>
          <View style={styles.topBar}>
            <View style={styles.brandCluster}>
              <BrandLogo size={44} />
              <View style={styles.brandCopy}>
                <Text style={styles.topEyebrow}>Defensive Pedal</Text>
                <Text style={styles.topTitle}>Plan a ride</Text>
                <Text style={styles.topSubtitle}>{headerMeta}</Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <Pressable style={styles.topActionPill} onPress={() => router.push('/auth')}>
                <Text style={styles.topActionLabel}>Account</Text>
              </Pressable>
              <Pressable style={styles.topActionPill} onPress={() => router.push('/settings')}>
                <Text style={styles.topActionLabel}>Settings</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.floatingToolbar}>
            <View style={styles.modeToggleShell}>
              <Pressable
                style={[
                  styles.modeToggleButton,
                  routeRequest.mode === 'safe' ? styles.modeToggleButtonActive : null,
                ]}
                onPress={() => setRoutingMode('safe')}
              >
                <Text
                  style={[
                    styles.modeToggleLabel,
                    routeRequest.mode === 'safe' ? styles.modeToggleLabelActive : null,
                  ]}
                >
                  Safe
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeToggleButton,
                  routeRequest.mode === 'fast' ? styles.modeToggleButtonActive : null,
                ]}
                onPress={() => setRoutingMode('fast')}
              >
                <Text
                  style={[
                    styles.modeToggleLabel,
                    routeRequest.mode === 'fast' ? styles.modeToggleLabelActive : null,
                  ]}
                >
                  Fast
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.avoidPill,
                routeRequest.avoidUnpaved ? styles.avoidPillActive : null,
              ]}
              onPress={() =>
                setRouteRequest({
                  avoidUnpaved: !routeRequest.avoidUnpaved,
                })
              }
            >
              <Text
                style={[
                  styles.avoidPillLabel,
                  routeRequest.avoidUnpaved ? styles.avoidPillLabelActive : null,
                ]}
              >
                Avoid unpaved
              </Text>
            </Pressable>
          </View>
        </>
      }
      footer={
        <>
          <View style={styles.footerMessage}>
            <Text style={styles.footerMessageLabel}>{coverageMessage}</Text>
          </View>
          <Pressable
            style={[styles.primaryButton, !canPreview ? styles.primaryButtonDisabled : null]}
            disabled={!canPreview}
            onPress={() => {
              setActiveField(null);
              router.push('/route-preview');
            }}
          >
            <Text style={styles.primaryButtonLabel}>
              {canPreview ? 'Preview selected route' : 'Need GPS or custom start'}
            </Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.sheetHero}>
        <Text style={styles.sheetEyebrow}>Ride setup</Text>
        <Text style={styles.sheetTitle}>Where do you want to go?</Text>
        <Text style={styles.sheetSubtitle}>
          Use live GPS as the default start, or set a manual start point like the web app.
        </Text>
      </View>

      <View style={styles.infoStrip}>
        <View style={styles.infoStripPrimary}>
          <Text style={styles.infoStripTitle}>Current rider position</Text>
          <Text style={styles.infoStripBody}>{currentLocationLabel}</Text>
          <Text style={styles.infoStripHint}>{startSummary}</Text>
        </View>
        <Pressable style={styles.refreshBadge} onPress={() => void refreshLocation()}>
          <Text style={styles.refreshBadgeLabel}>{isLocating ? 'Refreshing…' : 'Refresh GPS'}</Text>
        </Pressable>
      </View>

      <View style={styles.metaBadgeRow}>
        <View style={[styles.metaBadge, getCoverageTone(coverageStatus)]}>
          <Text style={styles.metaBadgeLabel}>
            {coverageQuery.isPending ? 'Checking coverage' : `Coverage: ${coverageStatus ?? 'unknown'}`}
          </Text>
        </View>
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeLabel}>
            {customStartEnabled ? 'Custom start active' : 'Using current location'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Destination</Text>
        <PlaceSearchField
          label="Destination"
          value={destinationQuery}
          placeholder="Search a place, address, or landmark"
          active={activeField === 'destination'}
          isLoading={destinationAutocompleteQuery.isPending}
          errorMessage={
            destinationAutocompleteQuery.isError ? destinationAutocompleteQuery.error.message : null
          }
          statusText={`Selected: ${formatCoordinateLabel(routeRequest.destination)}`}
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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Start point</Text>
          <Pressable
            style={styles.sectionAction}
            onPress={() => {
              if (customStartEnabled) {
                clearStartOverride();
              } else {
                setActiveField('startOverride');
              }
            }}
          >
            <Text style={styles.sectionActionLabel}>
              {customStartEnabled ? 'Use rider GPS' : 'Start elsewhere'}
            </Text>
          </Pressable>
        </View>

        {customStartEnabled || activeField === 'startOverride' ? (
          <PlaceSearchField
            label="Custom start"
            value={startOverrideQuery}
            placeholder="Search a different start point"
            active={activeField === 'startOverride'}
            isLoading={startOverrideAutocompleteQuery.isPending}
            errorMessage={
              startOverrideAutocompleteQuery.isError
                ? startOverrideAutocompleteQuery.error.message
                : null
            }
            statusText={
              customStartEnabled
                ? `Override active at ${formatCoordinateLabel(routeRequest.startOverride as Coordinate)}`
                : 'Leave blank to keep the rider’s live start position.'
            }
            suggestions={startOverrideAutocompleteQuery.data?.suggestions ?? []}
            onFocus={() => setActiveField('startOverride')}
            onChangeText={(value) => {
              setStartOverrideQuery(value);
              setActiveField('startOverride');
            }}
            onClear={clearStartOverride}
            onSelectSuggestion={handleStartOverrideSelect}
          />
        ) : (
          <View style={styles.inlinePanel}>
            <Text style={styles.inlinePanelTitle}>Live GPS start</Text>
            <Text style={styles.inlinePanelBody}>
              Preview will start from the rider’s current position and rerouting will continue from
              live GPS.
            </Text>
          </View>
        )}
      </View>

      {!mobileEnv.mobileApiUrl || permissionStatus === 'denied' || locationError ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningPanelTitle}>Heads up</Text>
          <Text style={styles.warningPanelBody}>
            {!mobileEnv.mobileApiUrl
              ? 'Mobile API URL is missing in this build.'
              : permissionStatus === 'denied'
                ? 'Location permission is denied. Choose a custom start point to keep going.'
                : locationError}
          </Text>
        </View>
      ) : null}
    </MapStageScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  brandCluster: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  topEyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  topTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  topSubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
  },
  topActions: {
    gap: 8,
  },
  topActionPill: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  topActionLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeToggleShell: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.86)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
  },
  modeToggleButton: {
    borderRadius: mobileTheme.radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modeToggleButtonActive: {
    backgroundColor: mobileTheme.colors.brand,
  },
  modeToggleLabel: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
  },
  modeToggleLabelActive: {
    color: mobileTheme.colors.textPrimary,
  },
  avoidPill: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.86)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avoidPillActive: {
    borderColor: 'rgba(250, 204, 21, 0.24)',
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  avoidPillLabel: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
    fontSize: 13,
  },
  avoidPillLabelActive: {
    color: mobileTheme.colors.brand,
  },
  sheetHero: {
    gap: 4,
  },
  sheetEyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sheetTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  sheetSubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  infoStrip: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    gap: 12,
  },
  infoStripPrimary: {
    gap: 4,
  },
  infoStripTitle: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  infoStripBody: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 17,
    fontWeight: '800',
  },
  infoStripHint: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  refreshBadge: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshBadgeLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  metaBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaBadgeNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaBadgeSuccess: {
    backgroundColor: 'rgba(15, 118, 110, 0.25)',
  },
  metaBadgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  metaBadgeLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sectionLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '900',
  },
  sectionAction: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionActionLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  inlinePanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 14,
    gap: 4,
  },
  inlinePanelTitle: {
    color: mobileTheme.colors.textOnDark,
    fontWeight: '800',
  },
  inlinePanelBody: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  warningPanel: {
    borderRadius: 22,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    padding: 14,
    gap: 4,
  },
  warningPanelTitle: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  warningPanelBody: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    lineHeight: 18,
  },
  footerMessage: {
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerMessageLabel: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: 24,
    backgroundColor: mobileTheme.colors.brand,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: '#8f9bad',
  },
  primaryButtonLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
});
