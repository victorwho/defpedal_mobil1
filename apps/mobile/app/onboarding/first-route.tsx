import type { Coordinate, RoutePreviewResponse } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../../src/components/map';
import { Button } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { zIndex } from '../../src/design-system/tokens/zIndex';
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
import { mobileEnv } from '../../src/lib/env';
import { useAppStore } from '../../src/store/appStore';

// ---------------------------------------------------------------------------
// Find nearest grocery store via Mapbox Category Search
// ---------------------------------------------------------------------------

// Categories to search for a nearby, relevant destination
const DESTINATION_CATEGORIES = ['park', 'cafe', 'grocery', 'bakery'] as const;

interface NearbyDestination {
  readonly name: string;
  readonly location: Coordinate;
  readonly category: string;
}

/**
 * Search multiple POI categories and return the closest results.
 * Tries park first (likely safest bike route), then cafe, grocery, bakery.
 */
const findNearbyDestinations = async (
  origin: Coordinate,
): Promise<NearbyDestination[]> => {
  const token = mobileEnv.mapboxPublicToken;
  if (!token) return [];

  const results: NearbyDestination[] = [];

  for (const category of DESTINATION_CATEGORIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = `https://api.mapbox.com/search/searchbox/v1/category/${category}?proximity=${origin.lon},${origin.lat}&limit=2&access_token=${token}`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data: any = await response.json();
      for (const feature of data?.features ?? []) {
        if (!feature?.geometry?.coordinates) continue;
        const [lon, lat] = feature.geometry.coordinates;
        results.push({
          name: feature.properties?.name ?? category,
          location: { lat, lon },
          category,
        });
      }
    } catch {
      // Skip this category
    }
  }

  return results;
};

/**
 * Compute a safety score from risk segments.
 * riskScore: lower = safer. "Very safe" is 0-30.
 * We convert to a 0-100 scale where 100 = perfectly safe.
 */
const computeSafetyScore = (
  riskSegments: ReadonlyArray<{ readonly riskScore: number }>,
): number | null => {
  if (riskSegments.length === 0) return null;
  const avgRisk =
    riskSegments.reduce((sum, seg) => sum + seg.riskScore, 0) / riskSegments.length;
  return Math.max(0, Math.min(100, Math.round(100 - avgRisk)));
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingFirstRouteScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { location } = useCurrentLocation();
  const cyclingGoal = useAppStore((s) => s.cyclingGoal);
  const setRoutePreview = useAppStore((s) => s.setRoutePreview);
  const setRouteRequest = useAppStore((s) => s.setRouteRequest);

  const [routeResponse, setRouteResponse] = useState<RoutePreviewResponse | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Find nearby destinations, generate safe routes, pick the safest one
  useEffect(() => {
    if (!location || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;

    const load = async () => {
      try {
        // Step 1: Find nearby destinations across multiple categories
        const destinations = await findNearbyDestinations(location);
        if (cancelled || destinations.length === 0) {
          setIsLoading(false);
          return;
        }

        // Step 2: Request safe circuit routes (origin → stop → origin) in parallel
        // Using the stop as a waypoint makes it a round trip back to the user
        const candidates = destinations.slice(0, 3);
        const routeResults = await Promise.allSettled(
          candidates.map(async (dest) => {
            const response = await mobileApi.previewRoute({
              origin: location,
              destination: location,       // Return to start (circuit)
              waypoints: [dest.location],  // Stop at the destination along the way
              mode: 'safe',
              avoidUnpaved: cyclingGoal === 'beginner',
              avoidHills: false,
              locale: 'en',
            });
            const route = response.routes[0];
            const score = route ? computeSafetyScore(route.riskSegments) : null;
            return { dest, response, score };
          }),
        );

        if (cancelled) return;

        // Step 3: Pick the route with the best (highest) safety score
        let best: { dest: NearbyDestination; response: RoutePreviewResponse; score: number | null } | null = null;

        for (const result of routeResults) {
          if (result.status !== 'fulfilled') continue;
          const { dest, response, score } = result.value;
          if (!response.routes.length) continue;
          if (!best || (score ?? 0) > (best.score ?? 0)) {
            best = { dest, response, score };
          }
        }

        if (!cancelled && best) {
          setDestinationName(best.dest.name);
          setDestination(best.dest.location);
          setRouteResponse(best.response);
        }
      } catch {
        // Keep null — UI shows fallback
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [location]);

  const handleContinue = () => {
    // Store circuit route + request for use in route-preview after onboarding
    // Route is: user location → stop → user location (round trip)
    if (routeResponse && location && destination) {
      setRouteRequest({
        origin: location,
        destination: location,         // Circuit: return to start
        waypoints: [destination],      // Stop at the POI
        mode: 'safe',
        avoidUnpaved: cyclingGoal === 'beginner',
        avoidHills: false,
        locale: 'en',
      });
      // setRoutePreview automatically sets appState to ROUTE_PREVIEW when routes exist
      setRoutePreview(routeResponse);
    }
    router.push('/onboarding/signup-prompt');
  };

  const selectedRoute = routeResponse?.routes[0] ?? null;
  const distanceKm = selectedRoute ? (selectedRoute.distanceMeters / 1000).toFixed(1) : '—';
  const durationMin = selectedRoute ? Math.round(selectedRoute.adjustedDurationSeconds / 60) : '—';
  const safetyScore = selectedRoute
    ? computeSafetyScore(selectedRoute.riskSegments)
    : null;

  const co2Kg = selectedRoute ? ((selectedRoute.distanceMeters / 1000) * 0.12).toFixed(2) : '—';
  const moneyEur = selectedRoute ? ((selectedRoute.distanceMeters / 1000) * 0.35).toFixed(2) : '—';

  const scoreColor = safetyScore != null
    ? safetyScore >= 70 ? safetyColors.safe : safetyScore >= 40 ? safetyColors.caution : safetyColors.danger
    : colors.textSecondary;

  const ImpactTile = ({ value, unit, label, color }: { readonly value: string; readonly unit: string; readonly label: string; readonly color: string }) => (
    <View style={styles.impactTile}>
      <View style={styles.impactValueRow}>
        <Text style={[styles.impactValue, { color }]}>{value}</Text>
        <Text style={styles.impactUnit}>{unit}</Text>
      </View>
      <Text style={styles.impactLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button">
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>Your first route</Text>
        <Text style={styles.title}>
          {destinationName ? `Safe route to ${destinationName} and back` : 'A safe route near you and back'}
        </Text>
        <Text style={styles.subtitle}>
          {cyclingGoal === 'beginner'
            ? 'A short, safe route to get you started.'
            : 'The safest cycling route to a nearby destination.'}
        </Text>
      </View>

      {/* Map area */}
      <View style={styles.mapArea}>
        {isLoading ? (
          <View style={styles.mapLoadingOverlay}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.mapLoadingText}>Finding a safe route nearby...</Text>
          </View>
        ) : null}
        {location && routeResponse && destination ? (
          <RouteMap
            routes={routeResponse.routes}
            selectedRouteId={selectedRoute?.id}
            origin={location}
            destination={destination}
            userLocation={location}
            followUser={false}
            fullBleed
            showRouteOverlay={false}
            showBicycleLanes
            a11yContext={{ mode: 'planning' }}
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
        <ImpactTile value={String(moneyEur)} unit="EUR" label="Money saved" color={colors.accent} />
        <ImpactTile
          value={selectedRoute ? String(selectedRoute.riskSegments.filter((s) => s.riskScore >= 60).length) : '—'}
          unit=""
          label="Hazards on route"
          color={safetyColors.caution}
        />
      </View>

      {/* Actions */}
      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
          Continue
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
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
      color: colors.accent,
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      ...textBase,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    mapArea: {
      flex: 1,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      overflow: 'hidden',
      marginVertical: space[3],
      backgroundColor: '#0d1a2d',
    },
    mapLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: zIndex.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(17, 24, 39, 0.7)',
      gap: space[2],
    },
    mapLoadingText: {
      ...textSm,
      color: colors.textSecondary,
    },
    mapFallback: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space[4],
    },
    mapFallbackText: {
      ...textSm,
      color: colors.textMuted,
      textAlign: 'center',
    },
    routeCard: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
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
      color: colors.textPrimary,
    },
    routeStatLabel: {
      ...textXs,
      color: colors.textSecondary,
    },
    routeStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.borderDefault,
    },
    impactRow: {
      flexDirection: 'row',
      gap: space[2],
      paddingTop: space[3],
    },
    impactTile: {
      flex: 1,
      backgroundColor: colors.bgSecondary,
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
      color: colors.textMuted,
    },
    impactLabel: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    footer: {
      gap: space[2],
      alignItems: 'center',
      paddingTop: space[3],
    },
  });
