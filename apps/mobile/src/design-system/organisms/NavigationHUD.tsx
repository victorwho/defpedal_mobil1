/**
 * Design System v1.0 — NavigationHUD Organism
 *
 * Minimal cycling navigation HUD with two separate sections:
 *   - ManeuverCard (top): arrow + description + distance
 *   - FooterCard (bottom): ETA, remaining distance, climb, "then" strip
 *
 * Dark-only (forced during navigation per spec rule).
 */
import React, { useEffect, useRef } from 'react';
import type { NavigationStep } from '@defensivepedal/core';
import { formatDistance } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import {
  fontFamily,
  textDataSm,
  textSm,
  textXs,
} from '../tokens/typography';
import { darkTheme, gray } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationHUDProps {
  currentStep: NavigationStep | null;
  nextStep: NavigationStep | null;
  distanceToManeuverMeters: number | null;
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  totalClimbMeters: number | null;
  routeGapMeters: number;
  offRouteCountdownSeconds: number | null;
  reroutePending: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ManeuverIconName = React.ComponentProps<typeof Ionicons>['name'];

const getManeuverIcon = (step: NavigationStep | null): ManeuverIconName => {
  if (!step) return 'arrow-up';
  const mod = step.maneuver.modifier?.toLowerCase() ?? '';
  const type = step.maneuver.type?.toLowerCase() ?? '';
  if (type === 'arrive') return 'location';
  if (type === 'roundabout' || type === 'rotary') return 'return-up-forward';
  if (mod.includes('uturn')) return 'return-down-back';
  if (mod.includes('sharp left')) return 'arrow-back';
  if (mod.includes('sharp right')) return 'arrow-forward';
  if (mod.includes('slight left')) return 'arrow-up-outline'; // angled left — use up as fallback
  if (mod.includes('slight right')) return 'arrow-up-outline';
  if (mod.includes('left')) return 'arrow-back';
  if (mod.includes('right')) return 'arrow-forward';
  return 'arrow-up';
};

const getManeuverDescription = (step: NavigationStep | null): string => {
  if (!step) return 'Continue';
  const type = step.maneuver.type?.toLowerCase() ?? '';
  const mod = step.maneuver.modifier?.toLowerCase() ?? '';

  if (type === 'arrive') return 'Arrive';
  if (type === 'depart') return 'Depart';
  if (type === 'roundabout' || type === 'rotary') {
    const exit = step.maneuver.exit;
    return exit ? `Exit ${exit}` : 'Roundabout';
  }

  if (mod.includes('slight left')) return 'Slight left';
  if (mod.includes('slight right')) return 'Slight right';
  if (mod.includes('sharp left')) return 'Sharp left';
  if (mod.includes('sharp right')) return 'Sharp right';
  if (mod.includes('left')) return 'Turn left';
  if (mod.includes('right')) return 'Turn right';
  if (mod.includes('uturn')) return 'U-turn';
  if (mod.includes('straight') || type === 'continue') return 'Continue';

  return 'Continue';
};

const formatETA = (remainingSec: number): string => {
  if (remainingSec <= 0) return 'Now';
  return new Date(Date.now() + remainingSec * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

// ---------------------------------------------------------------------------
// Exported sub-components
// ---------------------------------------------------------------------------

/**
 * Top card: arrow + maneuver description + distance to maneuver.
 * Rendered at the top of the navigation screen.
 */
/** GPS signal quality thresholds (horizontal accuracy in meters). */
const GPS_STRONG_THRESHOLD = 10;
const GPS_FAIR_THRESHOLD = 25;

const getGpsSignalColor = (accuracy: number | null | undefined): string => {
  if (accuracy == null) return gray[500]; // no fix
  if (accuracy <= GPS_STRONG_THRESHOLD) return '#4CAF50'; // green
  if (accuracy <= GPS_FAIR_THRESHOLD) return '#FFC107'; // amber
  return '#F44336'; // red — poor
};

const isGpsPoor = (accuracy: number | null | undefined): boolean =>
  accuracy == null || accuracy > GPS_FAIR_THRESHOLD;

/** Pulsating GPS icon shown only when signal is poor/lost. */
const PulsingGpsIcon: React.FC<{ color: string }> = ({ color }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ opacity: pulse }}>
      <Ionicons name="navigate-outline" size={14} color={color} />
    </Animated.View>
  );
};

export const ManeuverCard: React.FC<{
  currentStep: NavigationStep | null;
  distanceToManeuverMeters: number | null;
  gpsAccuracyMeters?: number | null;
  onPress?: () => void;
}> = ({ currentStep, distanceToManeuverMeters, gpsAccuracyMeters, onPress }) => {
  const iconName = getManeuverIcon(currentStep);
  const description = getManeuverDescription(currentStep);
  const distance =
    distanceToManeuverMeters !== null
      ? formatDistance(Math.round(distanceToManeuverMeters))
      : currentStep
        ? formatDistance(Math.round(currentStep.distanceMeters))
        : '—';

  const gpsColor = getGpsSignalColor(gpsAccuracyMeters);
  const poor = isGpsPoor(gpsAccuracyMeters);

  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[styles.maneuverCard, shadows.lg]}
      accessibilityRole="summary"
      accessibilityLabel={`${description}, in ${distance}`}
      accessibilityLiveRegion="assertive"
      accessibilityHint={onPress ? 'Tap to hear instruction again' : undefined}
    >
      <Ionicons name={iconName} size={32} color={darkTheme.accent} />
      <Text style={styles.maneuverDesc} numberOfLines={1}>
        {description}
      </Text>
      <Text style={styles.maneuverDivider}>·</Text>
      <Text style={styles.maneuverDist}>{distance}</Text>
      <View
        style={styles.gpsIndicator}
        accessibilityLabel={`GPS signal ${gpsAccuracyMeters == null ? 'unavailable' : gpsAccuracyMeters <= GPS_STRONG_THRESHOLD ? 'strong' : gpsAccuracyMeters <= GPS_FAIR_THRESHOLD ? 'fair' : 'poor'}`}
      >
        {poor ? <PulsingGpsIcon color={gpsColor} /> : null}
        <View style={[styles.gpsDotInner, { backgroundColor: gpsColor }]} />
      </View>
    </Wrapper>
  );
};

/**
 * Standalone "Then" strip showing the next-after-current maneuver.
 * Rendered at the top of the screen below the ManeuverCard.
 */
export const ThenStrip: React.FC<{
  nextStep: NavigationStep | null;
}> = ({ nextStep }) => {
  if (!nextStep) return null;

  const nextIconName = getManeuverIcon(nextStep);
  const nextDist = formatDistance(Math.round(nextStep.distanceMeters));
  const nextDesc = getManeuverDescription(nextStep);

  return (
    <View
      style={[styles.thenStripStandalone, shadows.md]}
      accessibilityLabel={`Then ${nextDesc} in ${nextDist}`}
    >
      <Text style={styles.thenPrefix}>Then</Text>
      <Ionicons name={nextIconName} size={16} color={darkTheme.accent} />
      <Text style={[textSm, styles.thenText]} numberOfLines={1}>
        {nextDesc}
      </Text>
      <Text style={[textDataSm, { color: gray[300] }]}>{nextDist}</Text>
    </View>
  );
};

/**
 * Bottom card: "then" strip + summary metrics row (ETA, distance, climb).
 * Rendered at the bottom of the navigation screen.
 */
export const FooterCard: React.FC<{
  nextStep: NavigationStep | null;
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  totalClimbMeters: number | null;
  totalDescentMeters?: number | null;
  isClimbLive?: boolean;
  speedKmh?: number | null;
}> = ({
  nextStep,
  remainingDurationSeconds,
  remainingDistanceMeters,
  totalClimbMeters,
  totalDescentMeters,
  isClimbLive = false,
  speedKmh,
}) => {
  const nextIconName = nextStep ? getManeuverIcon(nextStep) : null;
  const nextDist = nextStep
    ? formatDistance(Math.round(nextStep.distanceMeters))
    : null;
  const nextDesc = nextStep ? getManeuverDescription(nextStep) : null;

  return (
    <View style={[styles.footerCard, shadows.md]}>
      {/* "Then" strip */}
      {nextStep && nextIconName ? (
        <View style={styles.thenStripInline}>
          <Text style={styles.thenPrefix}>Then</Text>
          <Ionicons name={nextIconName} size={16} color={darkTheme.accent} />
          <Text style={[textSm, styles.thenText]} numberOfLines={1}>
            {nextDesc}
          </Text>
          <Text style={[textDataSm, { color: gray[300] }]}>{nextDist}</Text>
        </View>
      ) : null}

      {/* Metrics row */}
      <View style={styles.metricRow}>
        <MetricCell
          label="Speed"
          value={speedKmh != null ? `${Math.round(speedKmh)}` : '—'}
          unit="km/h"
        />
        <View style={styles.metricDivider} />
        <MetricCell label="ETA" value={formatETA(remainingDurationSeconds)} />
        <View style={styles.metricDivider} />
        <MetricCell
          label="Dist"
          value={`${(remainingDistanceMeters / 1000).toFixed(1)} km`}
        />
        <View style={styles.metricDivider} />
        <MetricCell
          label={totalDescentMeters != null && totalDescentMeters > (totalClimbMeters ?? 0) ? 'Descent' : 'Climb'}
          value={
            totalDescentMeters != null && totalDescentMeters > (totalClimbMeters ?? 0)
              ? `↓${Math.round(totalDescentMeters)} m`
              : totalClimbMeters !== null
                ? isClimbLive
                  ? `↑${Math.round(totalClimbMeters)} m`
                  : `~↑${Math.round(totalClimbMeters)} m`
                : '—'
          }
        />
      </View>
    </View>
  );
};

/**
 * Full NavigationHUD — kept for backwards compatibility.
 * Renders ManeuverCard + FooterCard stacked vertically.
 */
export const NavigationHUD: React.FC<NavigationHUDProps> = (props) => (
  <View style={styles.root}>
    <ManeuverCard
      currentStep={props.currentStep}
      distanceToManeuverMeters={props.distanceToManeuverMeters}
    />
    <FooterCard
      nextStep={props.nextStep}
      remainingDurationSeconds={props.remainingDurationSeconds}
      remainingDistanceMeters={props.remainingDistanceMeters}
      totalClimbMeters={props.totalClimbMeters}
    />
  </View>
);

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

const MetricCell: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View style={styles.metricCell} accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
    <Text style={styles.metricLabel}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
      <Text style={[textDataSm, { color: '#FFFFFF' }]}>{value}</Text>
      {unit ? <Text style={[{ fontSize: 10, color: gray[400] }]}>{unit}</Text> : null}
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    gap: space[2],
  },
  // -- Maneuver card (top) --
  maneuverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  maneuverDesc: {
    flex: 1,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  maneuverDivider: {
    ...textSm,
    color: gray[500],
  },
  maneuverDist: {
    ...textDataSm,
    fontSize: 16,
    color: gray[200],
    fontFamily: fontFamily.mono.bold,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: space[1],
  },
  gpsDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // -- Footer card (bottom) --
  footerCard: {
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    overflow: 'hidden',
  },
  thenStripInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.borderDefault,
    backgroundColor: darkTheme.bgSecondary,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  thenStripStandalone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  thenPrefix: {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: gray[400],
  },
  thenText: {
    flex: 1,
    color: gray[300],
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: darkTheme.borderDefault,
    marginHorizontal: space[1],
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontFamily: fontFamily.body.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: gray[400],
  },
});
