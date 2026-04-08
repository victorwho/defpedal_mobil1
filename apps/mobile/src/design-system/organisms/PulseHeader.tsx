/**
 * PulseHeader — Animated heartbeat header for the City Heartbeat dashboard.
 *
 * Shows city name, today's active riders, and a pulsing ring animation
 * using the brand accent color. Respects reduced motion.
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
  readonly activeRidersToday: number;
  readonly totalRidesToday: number;
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
  activeRidersToday,
  totalRidesToday,
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
        {/* Pulse orb */}
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

        {/* City + riders */}
        <View style={styles.textCol}>
          <Text style={styles.cityName} numberOfLines={1}>
            {cityName ?? 'Your City'}
          </Text>
          <Text style={styles.subtitle}>City Heartbeat</Text>
          <View style={styles.riderRow}>
            <Text style={styles.riderCount}>{activeRidersToday}</Text>
            <Text style={styles.riderLabel}>
              {activeRidersToday === 1 ? 'rider active today' : 'riders active today'}
            </Text>
          </View>
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
    riderRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space[1],
      marginTop: space[1],
    },
    riderCount: {
      ...textDataLg,
      fontFamily: fontFamily.mono.bold,
      color: colors.accent,
      fontSize: 18,
    },
    riderLabel: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
  });
