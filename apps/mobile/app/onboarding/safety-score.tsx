import type { NeighborhoodSafetyScore } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '../../src/components/map';
import { brandColors, darkTheme, safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
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
  score: 72,
  totalSegments: 45,
  safestCount: 14,
  dangerousCount: 3,
};

const ANIMATION_DURATION_MS = 1500;
const AUTO_DISMISS_MS = 5000;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingSafetyScoreScreen() {
  const insets = useSafeAreaInsets();
  const { location } = useCurrentLocation();

  const [scoreData, setScoreData] = useState<NeighborhoodSafetyScore | null>(null);
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
        const result = await mobileApi.fetchSafetyScore(location.lat, location.lon, 1);
        if (!cancelled) setScoreData(result);
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

  // Animate score once data is ready
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

    const timer = setTimeout(navigateNext, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [scoreData, animatedValue, fadeIn, navigateNext]);

  const score = scoreData?.score ?? FALLBACK_SCORE.score;
  const safestCount = scoreData?.safestCount ?? FALLBACK_SCORE.safestCount;
  const dangerousCount = scoreData?.dangerousCount ?? FALLBACK_SCORE.dangerousCount;

  const scoreColor =
    score >= 70 ? safetyColors.safe : score >= 40 ? safetyColors.caution : safetyColors.danger;

  return (
    <Pressable
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      onPress={navigateNext}
    >
      {/* Real map background with Shield Mode (or fallback) */}
      {location ? (
        <View style={styles.mapContainer}>
          <RouteMap
            origin={location}
            userLocation={location}
            followUser={false}
            fullBleed
            showRouteOverlay={false}
            showBicycleLanes
          />
          <View style={styles.mapOverlay} />
        </View>
      ) : (
        <View style={styles.mapPlaceholder}>
          <View style={styles.mapGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.mapStreet} />
            ))}
          </View>
          <View style={styles.mapOverlay} />
        </View>
      )}

      {/* Loading indicator */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={brandColors.accent} size="large" />
          <Text style={styles.loadingText}>Analyzing your neighborhood...</Text>
        </View>
      ) : null}

      {/* Floating card */}
      {scoreData ? (
        <Animated.View style={[styles.cardContainer, { opacity: fadeIn }]}>
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>Your neighborhood</Text>

            <View style={styles.scoreRow}>
              <Animated.Text style={[styles.scoreValue, { color: scoreColor }]}>
                {animatedValue.interpolate({
                  inputRange: [0, score],
                  outputRange: ['0', String(Math.round(score))],
                })}
              </Animated.Text>
              <Text style={styles.scoreLabel}>/100 safety score</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: safetyColors.safe }]}>
                  {safestCount}
                </Text>
                <Text style={styles.statLabel}>safe streets</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: safetyColors.danger }]}>
                  {dangerousCount}
                </Text>
                <Text style={styles.statLabel}>high-risk streets</Text>
              </View>
            </View>

            <Text style={styles.tapHint}>Tap anywhere to continue</Text>
          </View>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d1a2d',
  },
  mapGrid: {
    flex: 1,
    justifyContent: 'space-evenly',
    paddingHorizontal: space[8],
  },
  mapStreet: {
    height: 2,
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderRadius: 1,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[3],
  },
  loadingText: {
    ...textSm,
    color: darkTheme.textSecondary,
  },
  cardContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space[5],
  },
  card: {
    width: '100%',
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[6],
    gap: space[4],
    alignItems: 'center',
    ...shadows.lg,
  },
  cardEyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: brandColors.accent,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
  },
  scoreValue: {
    ...textDataLg,
    fontFamily: fontFamily.mono.bold,
    fontSize: 48,
    lineHeight: 52,
  },
  scoreLabel: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 20,
    lineHeight: 24,
  },
  statLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: darkTheme.borderDefault,
  },
  tapHint: {
    ...textSm,
    color: darkTheme.textMuted,
    paddingTop: space[2],
  },
});
