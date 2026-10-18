import { formatDistance } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '../../src/components/map';
import { Button } from '../../src/design-system/atoms';
import { PedalSays } from '../../src/design-system/molecules/PedalSays';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { space } from '../../src/design-system/tokens/spacing';
import { fontFamily, textBase } from '../../src/design-system/tokens/typography';
import { useT } from '../../src/hooks/useTranslation';
import { useUnits } from '../../src/hooks/useUnits';
import { beginLoopRide } from '../../src/lib/loop-ride';
import { createClientTripId } from '../../src/lib/offlineQueue';
import { telemetry } from '../../src/lib/telemetry';
import { useAppStore } from '../../src/store/appStore';

/**
 * Onboarding step 8 for the loop branch — the loop the rider kept by signing
 * up, one tap from riding (docs/plans/onboarding-first-ride.md #8).
 *
 * A-to-B routes use the real `/route-preview` here instead; loops cannot,
 * because a loop is started from its own path (`beginLoopRide`), which keeps
 * the `generated_loop` source that stops auto-reroute from replacing the
 * loop with a route home.
 *
 * Reached with the hand-off in memory only. A cold start loses it and the
 * rider lands on the planner, which is the right fallback for a stale loop.
 */
export default function OnboardingRideLoopScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const units = useUnits();
  const loop = useAppStore((s) => s.onboardingLoop);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!loop && !startedRef.current) router.replace('/route-planning');
  }, [loop]);

  const handleStart = useCallback(() => {
    if (!loop || startedRef.current) return;
    // Double-tap guard, as in loop-planner: a second trip_start would orphan
    // the first.
    startedRef.current = true;
    const [lon, lat] = loop.coordinates[0] ?? [0, 0];
    const outcome = beginLoopRide(useAppStore.getState(), {
      route: loop.route,
      start: { lat, lon },
      distanceMeters: loop.distanceMeters,
      loopName: t('loop.nameFallback', { distance: formatDistance(loop.distanceMeters, units) }),
      startedAt: new Date().toISOString(),
      sessionId:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `session-${Date.now()}`,
      clientTripId: createClientTripId(),
    });
    if (outcome === 'started') {
      telemetry.capture('onb_ride_now', { isLoop: true });
      telemetry.capture('navigation_started', {
        mode: 'loop',
        route_id: loop.route.id,
        route_source: loop.route.source,
        source: 'onboarding',
      });
    }
    useAppStore.getState().setOnboardingRideHandoff({ fresh: false, loop: null });
    router.replace('/navigation');
  }, [loop, t, units]);

  // Never a dead end: "Ride it later" (step 4) is not built yet, so the way
  // out drops the hand-off — otherwise `/` would bounce the rider straight back.
  const handleNotNow = useCallback(() => {
    telemetry.capture('onb_ride_later', { isLoop: true, slot: null });
    useAppStore.getState().setOnboardingRideHandoff({ fresh: false, loop: null });
    router.replace('/route-planning');
  }, []);

  if (!loop) return null;
  const [startLon, startLat] = loop.coordinates[0] ?? [0, 0];

  return (
    <View style={styles.root}>
      <View style={[styles.mapWrap, { paddingTop: insets.top }]}>
        <RouteMap
          routes={[loop.route]}
          selectedRouteId={loop.route.id}
          origin={{ lat: startLat, lon: startLon }}
          showRouteOverlay={false}
          containerStyle={styles.map}
          a11yContext={{ mode: 'planning' }}
        />
      </View>
      <View style={styles.body}>
        <PedalSays pose="ride" line={t('onboardingRide.rideTitle')} />
        <Text style={styles.summary}>
          {t('onboardingRide.summary', {
            distance: formatDistance(loop.distanceMeters, units),
            minutes: Math.max(1, Math.round(loop.route.durationSeconds / 60)),
          })}
        </Text>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
        <Button variant="primary" size="lg" fullWidth onPress={handleStart}>
          {t('onboardingRide.startRide')}
        </Button>
        <Pressable onPress={handleNotNow} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{t('onboarding.maybeLater')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    mapWrap: {
      height: '55%',
    },
    map: {
      flex: 1,
    },
    body: {
      flex: 1,
      paddingHorizontal: space[5],
      paddingTop: space[4],
      gap: space[3],
    },
    summary: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingHorizontal: space[5],
      paddingTop: space[3],
    },
    link: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
  });
