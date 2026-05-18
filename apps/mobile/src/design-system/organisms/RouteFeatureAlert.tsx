/**
 * RouteFeatureAlert — single proximity card.
 *
 * Renders one approaching route feature as a compact tile + label + live
 * distance, with a slide-in-from-right entry animation that respects
 * `prefers-reduced-motion`. Pure presentation — the parent stack owns
 * which features appear, haptic firing, and dismiss state.
 */
import type { ApproachingFeature } from '@defensivepedal/core';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { brandColors } from '../tokens/colors';
import { duration as motionDuration, easing } from '../tokens/motion';
import { radii } from '../tokens/radii';
import {
  getRouteFeatureIcon,
  getRouteFeatureTierColor,
  routeFeatureLabelColor,
  routeFeatureMarker,
  routeFeatureStrokeColor,
} from '../tokens/routeFeatureIcons';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';

const ENTRY_DURATION = motionDuration.fast;
const ENTRY_OFFSET_X = 32;

const formatDistance = (metersAhead: number): string => {
  const m = Math.max(0, Math.round(metersAhead));
  return m < 1000 ? `in ${m} m` : `in ${(m / 1000).toFixed(1)} km`;
};

export interface RouteFeatureAlertProps {
  readonly item: ApproachingFeature;
}

export const RouteFeatureAlert = React.memo(({ item }: RouteFeatureAlertProps) => {
  const reducedMotion = useReducedMotion();
  const { feature, metersAhead, config } = item;
  const icon = getRouteFeatureIcon(feature.type);
  const tierColor = getRouteFeatureTierColor(feature.tier);

  const opacityAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const translateAnim = useRef(
    new Animated.Value(reducedMotion ? 0 : ENTRY_OFFSET_X),
  ).current;

  useEffect(() => {
    if (reducedMotion) {
      opacityAnim.setValue(1);
      translateAnim.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ENTRY_DURATION,
        easing: easing.out,
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: ENTRY_DURATION,
        easing: easing.out,
        useNativeDriver: true,
      }),
    ]).start();
    // Mount-only animation: parent keys this component by feature.id, so a
    // new feature gets a fresh mount + entrance. Re-running on prop change
    // would replay the slide-in every GPS tick as `metersAhead` ticks down.
  }, []);

  const distanceText = formatDistance(metersAhead);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ translateX: translateAnim }],
        },
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={config.a11yLiveRegion}
      accessibilityLabel={`${icon.accessibilityLabel}, ${distanceText}`}
    >
      <View
        style={[styles.iconTile, { backgroundColor: tierColor }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.iconLabel}>{icon.label}</Text>
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.title} numberOfLines={1}>
          {icon.accessibilityLabel}
        </Text>
        <Text style={styles.distance}>{distanceText}</Text>
      </View>
    </Animated.View>
  );
});

RouteFeatureAlert.displayName = 'RouteFeatureAlert';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.94)', // slate-900 @ 94%
    borderRadius: radii.xl,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[3],
    minWidth: 200,
    maxWidth: 280,
    ...shadows.md,
  },
  iconTile: {
    width: routeFeatureMarker.alertTileSize,
    height: routeFeatureMarker.alertTileSize,
    borderRadius: routeFeatureMarker.alertTileSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: routeFeatureStrokeColor,
  },
  iconLabel: {
    color: routeFeatureLabelColor,
    fontFamily: fontFamily.heading.bold,
    fontSize: routeFeatureMarker.alertTileLabelSize,
    letterSpacing: 0.3,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...textSm,
    color: brandColors.textPrimary,
    fontFamily: fontFamily.heading.semiBold,
    fontSize: 14,
  },
  distance: {
    ...textXs,
    color: brandColors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
