import type { NeighborhoodSafetyScore } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../../src/components/map';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import { brandTints, surfaceTints } from '../../src/design-system/tokens/tints';
import {
  fontFamily,
  textBase,
  textDataLg,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useCurrentLocation } from '../../src/hooks/useCurrentLocation';
import { mobileApi } from '../../src/lib/api';

// ---------------------------------------------------------------------------
// Fallback data (used when API or location unavailable)
// ---------------------------------------------------------------------------

const FALLBACK_SCORE: NeighborhoodSafetyScore = {
  score: 52,
  totalSegments: 45,
  safeCount: 18,
  averageCount: 12,
  riskyCount: 10,
  veryRiskyCount: 5,
};

const ANIMATION_DURATION_MS = 1500;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingSafetyScoreScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { location } = useCurrentLocation();

  const [scoreData, setScoreData] = useState<NeighborhoodSafetyScore | null>(null);
  const [pendingRiskGeoJson, setPendingRiskGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [riskGeoJson, setRiskGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const animatedValue = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  const hasNavigatedRef = useRef(false);
  const navigateNext = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    router.replace('/onboarding/goal-selection');
  }, []);

  // Fetch real safety score when location is available
  useEffect(() => {
    if (!location) {
      // If location isn't available after a short wait, use fallback
      const fallbackTimer = setTimeout(() => {
        setScoreData(FALLBACK_SCORE);
        setIsLoading(false);
      }, 3000);
      return () => clearTimeout(fallbackTimer);
    }

    let cancelled = false;

    const fetchScore = async () => {
      try {
        const [scoreResult, riskResult] = await Promise.allSettled([
          mobileApi.fetchSafetyScore(location.lat, location.lon, 1),
          mobileApi.fetchRiskMap(location.lat, location.lon, 1),
        ]);
        if (!cancelled) {
          setScoreData(
            scoreResult.status === 'fulfilled' ? scoreResult.value : FALLBACK_SCORE,
          );
          if (riskResult.status === 'fulfilled') {
            setPendingRiskGeoJson(riskResult.value);
          }
        }
      } catch {
        if (!cancelled) setScoreData(FALLBACK_SCORE);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchScore();

    return () => {
      cancelled = true;
    };
  }, [location]);

  // Delay applying risk overlay to let MapView fully mount (avoids Mapbox view:null error)
  useEffect(() => {
    if (!pendingRiskGeoJson) return;
    const timer = setTimeout(() => setRiskGeoJson(pendingRiskGeoJson), 3000);
    return () => clearTimeout(timer);
  }, [pendingRiskGeoJson]);

  // Animate score once data is ready (no auto-dismiss — user taps card to continue)
  useEffect(() => {
    if (!scoreData || hasAnimated.current) return;
    hasAnimated.current = true;

    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: scoreData.score,
        duration: ANIMATION_DURATION_MS,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scoreData, animatedValue, fadeIn]);

  const score = scoreData?.score ?? FALLBACK_SCORE.score;
  const safeCount = scoreData?.safeCount ?? FALLBACK_SCORE.safeCount;
  const averageCount = scoreData?.averageCount ?? FALLBACK_SCORE.averageCount;
  const riskyCount = scoreData?.riskyCount ?? FALLBACK_SCORE.riskyCount;
  const veryRiskyCount = scoreData?.veryRiskyCount ?? FALLBACK_SCORE.veryRiskyCount;

  const scoreColor =
    score >= 50 ? safetyColors.safe : score >= 30 ? safetyColors.caution : safetyColors.danger;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Interactive map with risk overlay — zoomable and scrollable */}
      {location ? (
        <View style={styles.mapContainer}>
          <RouteMap
            origin={location}
            userLocation={location}
            followUser={false}
            fullBleed
            showRouteOverlay={false}
            showBicycleLanes
            riskOverlay={riskGeoJson}
            a11yContext={{ decorative: true }}
          />
        </View>
      ) : (
        <View style={styles.mapPlaceholder}>
          <View style={styles.mapGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.mapStreet} />
            ))}
          </View>
        </View>
      )}

      {/* Loading indicator */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Analyzing your neighborhood...</Text>
        </View>
      ) : null}

      {/* Compact card at bottom — doesn't block map interaction */}
      {scoreData ? (
        <Animated.View style={[styles.cardContainer, { opacity: fadeIn, bottom: insets.bottom + space[4] }]}>
          <Pressable style={styles.card} onPress={navigateNext}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardEyebrow}>Your neighborhood</Text>
              <View style={styles.scoreRow}>
                <Animated.Text style={[styles.scoreValue, { color: scoreColor }]}>
                  {animatedValue.interpolate({
                    inputRange: [0, score],
                    outputRange: ['0', String(Math.round(score))],
                  })}
                </Animated.Text>
                <Text style={styles.scoreLabel}>/100</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.safe }]}>{safeCount}</Text>
                <Text style={styles.statLabel}>safe</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{averageCount}</Text>
                <Text style={styles.statLabel}>average</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.caution }]}>{riskyCount}</Text>
                <Text style={styles.statLabel}>risky</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.danger }]}>{veryRiskyCount}</Text>
                <Text style={styles.statLabel}>v.risky</Text>
              </View>
            </View>

            <View style={styles.continueRow}>
              <Text style={styles.tapHint}>Continue</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
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
    },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgDeep,
  },
  mapGrid: {
    flex: 1,
    justifyContent: 'space-evenly',
    paddingHorizontal: space[8],
  },
  mapStreet: {
    height: 2,
    backgroundColor: brandTints.accentLight,
    borderRadius: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[3],
  },
  loadingText: {
    ...textSm,
    color: colors.textSecondary,
  },
  cardContainer: {
    position: 'absolute',
    bottom: space[4],
    left: space[4],
    right: space[4],
  },
  card: {
    backgroundColor: surfaceTints.glass,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[2],
    ...shadows.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    ...textSm,
    fontFamily: fontFamily.heading.extraBold,
    color: colors.accent,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[1],
  },
  scoreValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 28,
    lineHeight: 32,
  },
  scoreLabel: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  statItem: {
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 2,
  },
  statValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  statLabel: {
    fontSize: 9,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.borderDefault,
  },
  continueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tapHint: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: colors.accent,
    paddingTop: space[2],
  },
});
