/**
 * Design System v1.0 — NavigationHUD Organism
 *
 * Minimal cycling navigation HUD with two separate sections:
 *   - ManeuverCard (top): arrow + description + distance
 *   - FooterCard (bottom): ETA, remaining distance, climb, "then" strip
 *
 * Dark-only (forced during navigation per spec rule).
 */
import React from 'react';
import type { NavigationStep } from '@defensivepedal/core';
import { formatDistance } from '@defensivepedal/core';
import { StyleSheet, Text, View } from 'react-native';

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

const getManeuverArrow = (step: NavigationStep | null): string => {
  if (!step) return '↑';
  const mod = step.maneuver.modifier?.toLowerCase() ?? '';
  const type = step.maneuver.type?.toLowerCase() ?? '';
  if (mod.includes('slight left')) return '↖';
  if (mod.includes('slight right')) return '↗';
  if (mod.includes('left')) return '←';
  if (mod.includes('right')) return '→';
  if (type === 'arrive') return '◎';
  return '↑';
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
export const ManeuverCard: React.FC<{
  currentStep: NavigationStep | null;
  distanceToManeuverMeters: number | null;
}> = ({ currentStep, distanceToManeuverMeters }) => {
  const arrow = getManeuverArrow(currentStep);
  const description = getManeuverDescription(currentStep);
  const distance =
    distanceToManeuverMeters !== null
      ? formatDistance(Math.round(distanceToManeuverMeters))
      : currentStep
        ? formatDistance(Math.round(currentStep.distanceMeters))
        : '—';

  return (
    <View
      style={[styles.maneuverCard, shadows.lg]}
      accessibilityRole="summary"
      accessibilityLabel={`${description}, in ${distance}`}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.arrow}>{arrow}</Text>
      <Text style={styles.maneuverDesc} numberOfLines={1}>
        {description}
      </Text>
      <Text style={styles.maneuverDivider}>·</Text>
      <Text style={styles.maneuverDist}>{distance}</Text>
    </View>
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

  const nextArrow = getManeuverArrow(nextStep);
  const nextDist = formatDistance(Math.round(nextStep.distanceMeters));
  const nextDesc = getManeuverDescription(nextStep);

  return (
    <View
      style={[styles.thenStripStandalone, shadows.md]}
      accessibilityLabel={`Then ${nextDesc} in ${nextDist}`}
    >
      <Text style={styles.thenPrefix}>Then</Text>
      <Text style={styles.thenArrow}>{nextArrow}</Text>
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
  isClimbLive?: boolean;
}> = ({
  nextStep,
  remainingDurationSeconds,
  remainingDistanceMeters,
  totalClimbMeters,
  isClimbLive = false,
}) => {
  const nextArrow = nextStep ? getManeuverArrow(nextStep) : null;
  const nextDist = nextStep
    ? formatDistance(Math.round(nextStep.distanceMeters))
    : null;
  const nextDesc = nextStep ? getManeuverDescription(nextStep) : null;

  return (
    <View style={[styles.footerCard, shadows.md]}>
      {/* "Then" strip */}
      {nextStep ? (
        <View style={styles.thenStripInline}>
          <Text style={styles.thenPrefix}>Then</Text>
          <Text style={styles.thenArrow}>{nextArrow}</Text>
          <Text style={[textSm, styles.thenText]} numberOfLines={1}>
            {nextDesc}
          </Text>
          <Text style={[textDataSm, { color: gray[300] }]}>{nextDist}</Text>
        </View>
      ) : null}

      {/* Metrics row */}
      <View style={styles.metricRow}>
        <MetricCell label="ETA" value={formatETA(remainingDurationSeconds)} />
        <MetricCell
          label="Dist"
          value={`${(remainingDistanceMeters / 1000).toFixed(1)} km`}
        />
        <MetricCell
          label="Climb"
          value={
            totalClimbMeters !== null
              ? isClimbLive
                ? `↑${Math.round(totalClimbMeters)} m ▼`
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

const MetricCell: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.metricCell} accessibilityLabel={`${label}: ${value}`}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[textDataSm, { color: '#FFFFFF' }]}>{value}</Text>
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
  arrow: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 28,
    color: darkTheme.accent,
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
  thenPrefix: {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: gray[400],
  },
  thenArrow: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 16,
    color: darkTheme.accent,
  },
  thenText: {
    flex: 1,
    color: gray[300],
  },
  metricRow: {
    flexDirection: 'row',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  metricCell: {
    flex: 1,
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
