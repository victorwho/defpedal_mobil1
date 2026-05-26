/**
 * Design System — TierRankCard Organism
 *
 * Main tier display card for Profile and Impact Dashboard.
 * Shows tier name, tagline, XP progress bar, and next tier info.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RiderTierName } from '@defensivepedal/core';

import { HoloMedallion } from '../atoms/HoloMedallion';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { riderTiers, getNextTier, getTierProgress, getXpToNextTier, type RiderTierKey } from '../tokens/tierColors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

export interface TierRankCardProps {
  totalXp: number;
  riderTier: RiderTierName;
  /** Show mascot image (true on profile, false on compact dashboard) */
  showMascot?: boolean;
}

export const TierRankCard = React.memo(function TierRankCard({
  totalXp,
  riderTier,
  showMascot = true,
}: TierRankCardProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const s = createStyles(colors);

  const key = riderTier as RiderTierKey;
  const tierDef = riderTiers[key];

  // Shine-sweep on XP increase. A bright vertical bar slides along the fill
  // when totalXp grows, conveying "energy flowing into the bar". Cheap, runs
  // on the native driver, hidden by the track's overflow: 'hidden'.
  const [trackWidth, setTrackWidth] = useState(0);
  const shineX = useRef(new Animated.Value(0)).current;
  const shineOpacity = useRef(new Animated.Value(0)).current;
  const prevXpRef = useRef(totalXp);
  const SHINE_WIDTH = 24;

  useEffect(() => {
    if (reducedMotion) {
      prevXpRef.current = totalXp;
      return;
    }
    if (totalXp > prevXpRef.current && trackWidth > 0 && tierDef) {
      const fillEnd = getTierProgress(totalXp, key) * trackWidth;
      shineX.setValue(-SHINE_WIDTH);
      shineOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(shineX, {
          toValue: fillEnd,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(shineOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(shineOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
    prevXpRef.current = totalXp;
  }, [totalXp, trackWidth, key, reducedMotion, tierDef, shineX, shineOpacity]);

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - trackWidth) > 0.5) setTrackWidth(w);
  };

  if (!tierDef) return null;

  const progress = getTierProgress(totalXp, key);
  const nextTierKey = getNextTier(key);
  const xpRemaining = getXpToNextTier(totalXp, key);
  const nextTierDef = nextTierKey ? riderTiers[nextTierKey] : null;
  const isLegend = !nextTierKey;

  return (
    <View style={s.container}>
      <View style={s.row}>
        {/* Left column: holographic medallion + tier name. The medallion
            PNG bakes in the iridescent frame + engraved tier name + drop
            shadow, so we drop the legacy white circle wrapper and the
            tier-color fallback ring — the medallion is self-contained. */}
        {showMascot && (
          <View style={s.leftCol}>
            <HoloMedallion tier={key} size={64} />
            <Text style={[s.tierName, { color: tierDef.color }]}>{tierDef.displayName}</Text>
          </View>
        )}

        {/* Right column: XP + progress bar */}
        <View style={s.rightCol}>
          <Text style={s.xpText}>{totalXp.toLocaleString()} XP</Text>

          {!isLegend ? (
            <>
              <View style={s.progressTrack} onLayout={handleTrackLayout}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: tierDef.color,
                    },
                  ]}
                />
                {/* Shine sweep — fires when totalXp grows, hidden by overflow */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.shine,
                    {
                      width: SHINE_WIDTH,
                      opacity: shineOpacity,
                      transform: [{ translateX: shineX }],
                    },
                  ]}
                />
              </View>
              <Text style={s.nextText}>
                {nextTierDef?.displayName} · {xpRemaining?.toLocaleString()} XP to go
              </Text>
            </>
          ) : (
            <Text style={s.legendText}>Maximum rank achieved</Text>
          )}
        </View>
      </View>
    </View>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      ...shadows.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
    },
    leftCol: {
      alignItems: 'center',
      gap: space[2],
    },
    tierName: {
      fontSize: 12,
      fontFamily: fontFamily.heading.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    rightCol: {
      flex: 1,
      gap: space[1],
    },
    xpText: {
      fontSize: 16,
      fontFamily: fontFamily.mono.bold,
      color: colors.textPrimary,
    },
    progressTrack: {
      width: '100%',
      height: 6,
      borderRadius: radii.sm,
      backgroundColor: colors.bgTertiary,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radii.sm,
    },
    shine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: '#FFFFFF',
    },
    nextText: {
      fontSize: 11,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
    legendText: {
      fontSize: 11,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
  });
