/**
 * Design System v1.0 — StreakFlame Atom
 *
 * Tier-aware streak indicator: flame icon tinted by tier color, animated
 * number, optional Pedal pose for the tier. Single source of truth for
 * "render this streak count" — both StreakCard and the post-ride impact
 * summary render through this atom.
 *
 * Tiers (from packages/core/src/streakTiers.ts):
 *   1–6     yellow flame   + Pedal `stand`     (Kindling)
 *   7–20    orange flame   + Pedal `cheer`     (Spark)
 *   21–41   red flame      + Pedal `ride`      (Commute Habit)
 *   42–87   blue flame     + Pedal `climb`     (Half-Marathon)
 *   88–99   purple flame   + Pedal `trophy`    (Binary Year)
 *   100–364 gold flame     + Pedal `podium`    (Century)
 *   365+    rainbow flame  + Pedal `legend`    (Legend)
 *
 * Animation: gentle 1.6s flicker loop on the flame when streak >= 1.
 * Suppressed under OS reduced-motion. Animation is opt-in via the
 * `animated` prop so callers who want a static badge can opt out.
 *
 * Usage:
 *   <StreakFlame streakDays={7} />
 *   <StreakFlame streakDays={30} animated showPose />
 *   <StreakFlame streakDays={0} />  // dormant state
 */
import { getTierForStreak, type FlameColor, type MascotPose as CoreMascotPose } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useT } from '../../hooks/useTranslation';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Mascot } from './Mascot';
import type { MascotPose } from '../tokens/mascotPoses';
import { darkTheme, gray } from '../tokens/colors';
import { fontFamily, textDataLg, textSm } from '../tokens/typography';
import { space } from '../tokens/spacing';

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

/**
 * Concrete hex per FlameColor token. Kept here (atom layer) rather than in
 * core tokens because these are presentation-only values; core stays
 * platform-agnostic. The "rainbow" tier uses a stand-in gold tone until
 * the planned multi-stop gradient asset ships.
 */
const FLAME_HEX: Record<FlameColor, string> = {
  yellow: '#FACC15',
  orange: '#FB923C',
  red: '#EF4444',
  blue: '#60A5FA',
  purple: '#A855F7',
  gold: '#EAB308',
  // Until the rainbow gradient flame is built, render a saturated gold so
  // the highest tier still reads as "different from gold tier" via the
  // mascot pose + label.
  rainbow: '#FFD700',
};

const DORMANT_HEX = gray[500];

// ---------------------------------------------------------------------------
// Core pose → mobile pose mapping (transitional)
// ---------------------------------------------------------------------------

/**
 * Map a pose name from `@defensivepedal/core` to a pose that exists in the
 * mobile token map. The core union includes `podium` + `legend` for the
 * top streak tiers; until those PNG assets ship, fall back to existing
 * art. Replace the special-cases with identity once the new assets land.
 */
const mapCoreToMobilePose = (corePose: CoreMascotPose): MascotPose => {
  if (corePose === 'podium') return 'trophy';
  if (corePose === 'legend') return 'excited';
  // All other core poses are 1:1 with the mobile union; the cast is safe.
  return corePose as MascotPose;
};

// ---------------------------------------------------------------------------
// Inner flame animation
// ---------------------------------------------------------------------------

interface FlameIconProps {
  size: number;
  color: string;
  animated: boolean;
  dormant: boolean;
}

const FlameIcon = ({ size, color, animated, dormant }: FlameIconProps) => {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated || reduced || dormant) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.78, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.94, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduced, dormant, opacity, scale]);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Ionicons
        name={dormant ? 'flame-outline' : 'flame'}
        size={size}
        color={color}
      />
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export type StreakFlameSize = 'sm' | 'md' | 'lg';

export interface StreakFlameProps {
  /** Current streak day count. 0 renders the dormant state. */
  streakDays: number;
  /** Visual size preset. Default 'md'. */
  size?: StreakFlameSize;
  /** Loop the flicker animation. Default true. */
  animated?: boolean;
  /** Render the tier-appropriate Pedal pose next to the flame. Default false. */
  showPose?: boolean;
  /** Show the human label ("Commute Habit"). Default false. */
  showLabel?: boolean;
  /** Optional override on the streak number rendering (e.g. for the +1 spring). */
  numberOverride?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZE_MAP: Record<
  StreakFlameSize,
  { iconPx: number; numberFontSize: number; mascotWidth: number }
> = {
  sm: { iconPx: 18, numberFontSize: 20, mascotWidth: 36 },
  md: { iconPx: 24, numberFontSize: 28, mascotWidth: 56 },
  lg: { iconPx: 36, numberFontSize: 44, mascotWidth: 88 },
};

export function StreakFlame({
  streakDays,
  size = 'md',
  animated = true,
  showPose = false,
  showLabel = false,
  numberOverride,
  style,
  testID,
}: StreakFlameProps): React.ReactElement {
  const t = useT();
  const tier = getTierForStreak(streakDays);
  const dormant = streakDays <= 0;
  const dims = SIZE_MAP[size];
  // Audit 2026-07-05 UX-7/UX-9: localized tier name — core's `label` is
  // English-only, so RO/ES riders (and their screen readers) got English.
  const tierName = t(`streakTier.${tier.tier}`);

  const flameColor = dormant ? DORMANT_HEX : FLAME_HEX[tier.flameColor];
  const numberColor = dormant ? DORMANT_HEX : flameColor;
  const displayNumber = numberOverride ?? streakDays;

  // The Mascot atom self-renders or returns null based on the user's
  // showMascot preference + NAVIGATING state. The core tier table can
  // produce 'podium' / 'legend' but those assets aren't on mobile yet —
  // map to existing poses at the rendering boundary. Replace this map
  // with the new assets once the art ships.
  const pose: MascotPose = mapCoreToMobilePose(tier.mascotPose);

  return (
    <View
      style={[styles.row, style]}
      testID={testID}
      accessibilityLabel={t('streak.a11yLabel', { days: displayNumber, tier: tierName })}
    >
      <FlameIcon
        size={dims.iconPx}
        color={flameColor}
        animated={animated}
        dormant={dormant}
      />
      <Text
        style={[
          styles.number,
          { color: numberColor, fontSize: dims.numberFontSize },
        ]}
      >
        {displayNumber}
      </Text>
      {showPose ? <Mascot pose={pose} width={dims.mascotWidth} /> : null}
      {showLabel ? (
        <Text style={styles.label}>{dormant ? t('streak.dormant') : tierName}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  number: {
    ...textDataLg,
    fontFamily: fontFamily.mono.bold,
  },
  label: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
});
