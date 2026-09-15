/**
 * PulseHeader — Animated heartbeat header for the City Heartbeat dashboard.
 *
 * Shows the city name, a labelled count in a pulsing orb, and a ring
 * animation using the brand accent color. Respects reduced motion.
 *
 * The "N riders active this month" row was removed 2026-09-15: the card sits
 * directly above "This month in <city>", which carries the windowed figures,
 * and two windowed rider counts in adjacent cards read as a contradiction
 * rather than as detail.
 */
import { useEffect, useRef, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import {
  fontFamily,
  textXs,
  textSm,
  text2xl,
  textDataLg,
} from '../tokens/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PulseHeaderProps {
  readonly cityName: string | null;
  readonly totalRidesToday: number;
  /**
   * Short label naming what the orb number IS (e.g. "riders").
   *
   * The orb carried a bare number for its whole life, which was survivable
   * while it was always "rides today" — but it is now the community's rider
   * count at the resolved scope, and an unlabelled figure next to a city name
   * invites the reader to guess. Omitted → nothing renders, so old callers are
   * unchanged.
   */
  readonly orbLabel?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PULSE_SIZE = 72;
const PULSE_DURATION = 2000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PulseHeader = ({
  cityName,
  totalRidesToday,
  orbLabel,
}: PulseHeaderProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();

  // Pulse ring animations
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reducedMotion) return;

    const createPulse = (
      scale: Animated.Value,
      opacity: Animated.Value,
      delay: number,
    ) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 2.2,
              duration: PULSE_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: PULSE_DURATION,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );

    const pulse1 = createPulse(ring1Scale, ring1Opacity, 0);
    const pulse2 = createPulse(ring2Scale, ring2Opacity, PULSE_DURATION / 2);

    pulse1.start();
    pulse2.start();

    return () => {
      pulse1.stop();
      pulse2.stop();
    };
  }, [reducedMotion, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Pulse orb + its caption. The caption sits BELOW the disc, not
            inside it: `orbCore` is 36 px across, so a number and a word
            stacked within it overflow the circle in both axes — which is
            exactly what shipped to the device on the first attempt. */}
        <View style={styles.orbCol}>
          <View style={styles.pulseContainer}>
            {!reducedMotion && (
              <>
                <Animated.View
                  style={[
                    styles.ring,
                    {
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.ring,
                    {
                      transform: [{ scale: ring2Scale }],
                      opacity: ring2Opacity,
                    },
                  ]}
                />
              </>
            )}
            <View style={styles.orbCore}>
              <Text style={styles.orbText}>{totalRidesToday}</Text>
            </View>
          </View>
          {orbLabel ? (
            <Text style={styles.orbLabel} numberOfLines={1}>
              {orbLabel}
            </Text>
          ) : null}
        </View>

        {/* City name */}
        <View style={styles.textCol}>
          <Text style={styles.cityName} numberOfLines={1}>
            {cityName ?? 'Your City'}
          </Text>
          <Text style={styles.subtitle}>City Heartbeat</Text>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      paddingHorizontal: space[4],
      paddingVertical: space[5],
      ...shadows.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
    },
    pulseContainer: {
      width: PULSE_SIZE,
      height: PULSE_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      position: 'absolute',
      width: PULSE_SIZE * 0.5,
      height: PULSE_SIZE * 0.5,
      borderRadius: PULSE_SIZE * 0.25,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    orbCore: {
      width: PULSE_SIZE * 0.5,
      height: PULSE_SIZE * 0.5,
      borderRadius: PULSE_SIZE * 0.25,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbText: {
      ...textDataLg,
      fontFamily: fontFamily.mono.bold,
      color: colors.textInverse,
      fontSize: 16,
    },
    // Column holding the orb and its caption. Fixed to the orb's width so the
    // caption cannot widen the row and shove the city name off-screen.
    orbCol: {
      width: PULSE_SIZE,
      alignItems: 'center',
    },
    // Caption UNDER the disc, so it is bounded by the 72 px column rather than
    // the 36 px circle, and readable against the card rather than the accent
    // fill. One line only: a longer localization ("ciclistas") must shrink to
    // fit rather than wrap and shift the row height.
    orbLabel: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
      // Negative, because `pulseContainer` is 72 px tall around a 36 px disc:
      // laid out naturally the caption starts 18 px of dead space below the
      // circle and reads as orphaned. Pulling it up closes that gap without
      // shrinking the container, which the rings expand into (they scale to
      // 2.2x and deliberately overflow it).
      marginTop: -space[3],
      textAlign: 'center',
    },
    textCol: {
      flex: 1,
      gap: 2,
    },
    cityName: {
      ...text2xl,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 20,
    },
    subtitle: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      fontSize: 10,
    },
  });
