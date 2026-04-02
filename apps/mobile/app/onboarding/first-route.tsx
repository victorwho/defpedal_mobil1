import type { RoutePreviewResponse } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../../src/components/map';
import { Button } from '../../src/design-system/atoms';
import { brandColors, darkTheme, safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textDataMd,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useCurrentLocation } from '../../src/hooks/useCurrentLocation';
import { mobileApi } from '../../src/lib/api';
import { useAppStore } from '../../src/store/appStore';

// ---------------------------------------------------------------------------
// Impact tile
// ---------------------------------------------------------------------------

type ImpactTileProps = {
  readonly value: string;
  readonly unit: string;
  readonly label: string;
  readonly color: string;
};

const ImpactTile = ({ value, unit, label, color }: ImpactTileProps) => (
  <View style={styles.impactTile}>
    <View style={styles.impactValueRow}>
      <Text style={[styles.impactValue, { color }]}>{value}</Text>
      <Text style={styles.impactUnit}>{unit}</Text>
    </View>
    <Text style={styles.impactLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingFirstRouteScreen() {
  const insets = useSafeAreaInsets();
  const { location } = useCurrentLocation();
  const cyclingGoal = useAppStore((s) => s.cyclingGoal);
  const setRoutePreview = useAppStore((s) => s.setRoutePreview);

  const [routeResponse, setRouteResponse] = useState<RoutePreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const distanceMeters = cyclingGoal === 'beginner' ? 1000 : 2500;
  const safetyFloor = cyclingGoal === 'beginner' ? 70 : undefined;

  const fetchRoute = async () => {
    if (!location) return;

    try {
      const response = await mobileApi.fetchLoopRoute(location, distanceMeters, safetyFloor);
      setRouteResponse(response);
    } catch {
      // Keep null — UI shows fallback
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!location) {
      const fallbackTimer = setTimeout(() => setIsLoading(false), 3000);
      return () => clearTimeout(fallbackTimer);
    }

    let cancelled = false;

    const load = async () => {
      await fetchRoute();
      if (!cancelled) setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [location]);

  const handleSeeAnother = async () => {
    setIsRegenerating(true);
    await fetchRoute();
    setIsRegenerating(false);
  };

  const handleContinue = () => {
    // Store route for use in route-preview after onboarding
    if (routeResponse) {
      setRoutePreview(routeResponse);
    }
    router.push('/onboarding/signup-prompt');
  };

  const selectedRoute = routeResponse?.routes[0] ?? null;
  const distanceKm = selectedRoute ? (selectedRoute.distanceMeters / 1000).toFixed(1) : '—';
  const durationMin = selectedRoute ? Math.round(selectedRoute.adjustedDurationSeconds / 60) : '—';
  const safetyScore = selectedRoute?.riskSegments.length
    ? Math.round(
        100 -
          (selectedRoute.riskSegments.reduce((sum, seg) => sum + seg.riskScore, 0) /
            selectedRoute.riskSegments.length) *
            10,
      )
    : null;

  const co2Kg = selectedRoute ? ((selectedRoute.distanceMeters / 1000) * 0.12).toFixed(2) : '—';
  const moneyEur = selectedRoute ? ((selectedRoute.distanceMeters / 1000) * 0.35).toFixed(2) : '—';

  const scoreColor = safetyScore != null
    ? safetyScore >= 70 ? safetyColors.safe : safetyScore >= 40 ? safetyColors.caution : safetyColors.danger
    : darkTheme.textSecondary;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button">
        <Ionicons name="chevron-back" size={24} color={darkTheme.textPrimary} />
      </Pressable>

      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>Your first route</Text>
        <Text style={styles.title}>A safe loop near you</Text>
        <Text style={styles.subtitle}>
          {cyclingGoal === 'beginner'
            ? 'A short, safe loop to get you started.'
            : 'A safety-optimized loop route based on your location.'}
        </Text>
      </View>

      {/* Map area */}
      <View style={styles.mapArea}>
        {isLoading || isRegenerating ? (
          <View style={styles.mapLoadingOverlay}>
            <ActivityIndicator color={brandColors.accent} size="large" />
            <Text style={styles.mapLoadingText}>
              {isRegenerating ? 'Finding another route...' : 'Generating your route...'}
            </Text>
          </View>
        ) : null}
        {location && routeResponse ? (
          <RouteMap
            routes={routeResponse.routes}
            selectedRouteId={selectedRoute?.id}
            origin={location}
            destination={location}
            userLocation={location}
            followUser={false}
            fullBleed
            showRouteOverlay={false}
            showBicycleLanes
          />
        ) : !isLoading ? (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackText}>
              Route unavailable — continue to explore manually.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Route card */}
      <View style={styles.routeCard}>
        <View style={styles.routeStats}>
          <View style={styles.routeStat}>
            <Text style={styles.routeStatValue}>{distanceKm} km</Text>
            <Text style={styles.routeStatLabel}>Distance</Text>
          </View>
          <View style={styles.routeStatDivider} />
          <View style={styles.routeStat}>
            <Text style={styles.routeStatValue}>{durationMin} min</Text>
            <Text style={styles.routeStatLabel}>Duration</Text>
          </View>
          <View style={styles.routeStatDivider} />
          <View style={styles.routeStat}>
            <Text style={[styles.routeStatValue, { color: scoreColor }]}>
              {safetyScore ?? '—'}
            </Text>
            <Text style={styles.routeStatLabel}>Safety</Text>
          </View>
        </View>
      </View>

      {/* Impact counters */}
      <View style={styles.impactRow}>
        <ImpactTile value={String(co2Kg)} unit="kg" label="CO2 saved" color={safetyColors.safe} />
        <ImpactTile value={String(moneyEur)} unit="EUR" label="Money saved" color={brandColors.accent} />
        <ImpactTile value="—" unit="" label="If you ride this" color={safetyColors.caution} />
      </View>

      {/* Actions */}
      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
          Continue
        </Button>
        {location ? (
          <Button
            variant="ghost"
            size="md"
            onPress={() => void handleSeeAnother()}
            loading={isRegenerating}
          >
            See Another Route
          </Button>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
    paddingHorizontal: space[5],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  headerSection: {
    gap: space[2],
  },
  eyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: brandColors.accent,
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...textBase,
    color: darkTheme.textSecondary,
    lineHeight: 22,
  },
  mapArea: {
    flex: 1,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    overflow: 'hidden',
    marginVertical: space[3],
    backgroundColor: '#0d1a2d',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    gap: space[2],
  },
  mapLoadingText: {
    ...textSm,
    color: darkTheme.textSecondary,
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[4],
  },
  mapFallbackText: {
    ...textSm,
    color: darkTheme.textMuted,
    textAlign: 'center',
  },
  routeCard: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[4],
    ...shadows.md,
  },
  routeStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  routeStatValue: {
    ...textDataMd,
    fontFamily: fontFamily.mono.bold,
    color: darkTheme.textPrimary,
  },
  routeStatLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  routeStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: darkTheme.borderDefault,
  },
  impactRow: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[3],
  },
  impactTile: {
    flex: 1,
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    alignItems: 'center',
    gap: 2,
  },
  impactValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  impactValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  impactUnit: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    color: darkTheme.textMuted,
  },
  impactLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  footer: {
    gap: space[2],
    alignItems: 'center',
    paddingTop: space[3],
  },
});
