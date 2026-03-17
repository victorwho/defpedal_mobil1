/**
 * Design System v1.0 — NavigationHUD Organism
 *
 * Replaces NavigationChrome + NavigationManeuverCard.
 * Spec layout:
 *   - 48px maneuver direction badge (accent circle)
 *   - Street name (heading font 2xl)
 *   - Distance to maneuver (mono data-lg)
 *   - Then-strip for next step
 *   - Footer: ETA, remaining distance, speed, route status
 *
 * Dark-only (forced during navigation per spec rule).
 */
import React from 'react';
import type { NavigationStep } from '@defensivepedal/core';
import { formatDistance, formatSpeed } from '@defensivepedal/core';
import { StyleSheet, Text, View } from 'react-native';

import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import {
  fontFamily,
  text2xl,
  textDataLg,
  textDataSm,
  textSm,
  textXs,
  textBase,
} from '../tokens/typography';
import { darkTheme, gray } from '../tokens/colors';
import { Badge } from '../atoms/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationHUDProps {
  currentStep: NavigationStep | null;
  nextStep: NavigationStep | null;
  distanceToManeuverMeters: number | null;
  gpsLabel: string;
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  currentSpeedMetersPerSecond: number | null;
  routeGapMeters: number;
  offRouteCountdownSeconds: number | null;
  reroutePending: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getManeuverLabel = (step: NavigationStep | null): string => {
  if (!step) return 'GO';
  const mod = step.maneuver.modifier?.toLowerCase() ?? '';
  const type = step.maneuver.type?.toLowerCase() ?? '';
  if (mod.includes('slight left')) return '↖';
  if (mod.includes('slight right')) return '↗';
  if (mod.includes('left')) return '←';
  if (mod.includes('right')) return '→';
  if (type === 'arrive') return '◎';
  return '↑';
};

const formatETA = (remainingSec: number): string => {
  if (remainingSec <= 0) return 'Now';
  return new Date(Date.now() + remainingSec * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getRouteStatus = (
  routeGapMeters: number,
  offRouteCountdownSeconds: number | null,
  reroutePending: boolean,
): { text: string; variant: 'info' | 'risk-caution' | 'risk-danger' } => {
  if (reroutePending) return { text: 'Rerouting…', variant: 'risk-caution' };
  if (offRouteCountdownSeconds !== null && offRouteCountdownSeconds > 0)
    return {
      text: `Off route · reroute in ${offRouteCountdownSeconds}s`,
      variant: 'risk-danger',
    };
  if (routeGapMeters > 50)
    return { text: 'Off route', variant: 'risk-caution' };
  return { text: 'On route', variant: 'info' };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  currentStep,
  nextStep,
  distanceToManeuverMeters,
  gpsLabel,
  remainingDurationSeconds,
  remainingDistanceMeters,
  currentSpeedMetersPerSecond,
  routeGapMeters,
  offRouteCountdownSeconds,
  reroutePending,
}) => {
  const distanceLabel =
    distanceToManeuverMeters !== null
      ? formatDistance(Math.round(distanceToManeuverMeters))
      : currentStep
        ? formatDistance(Math.round(currentStep.distanceMeters))
        : '—';

  const streetName =
    currentStep?.streetName?.trim() || gpsLabel || 'Unknown road';

  const routeStatus = getRouteStatus(
    routeGapMeters,
    offRouteCountdownSeconds,
    reroutePending,
  );

  const maneuverAccessibilityLabel = `${currentStep?.instruction ?? 'Continue'}, ${distanceLabel} on ${streetName}`;

  return (
    <View style={styles.root} accessibilityRole="summary">
      {/* ---- Maneuver Card ---- */}
      <View
        style={[styles.maneuverCard, shadows.lg]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={maneuverAccessibilityLabel}
      >
        <View style={styles.maneuverRow}>
          {/* Direction badge */}
          <View
            style={styles.directionBadge}
            accessibilityElementsHidden
          >
            <Text style={styles.directionText}>
              {getManeuverLabel(currentStep)}
            </Text>
          </View>

          {/* Distance + Street */}
          <View style={styles.maneuverInfo}>
            <Text style={[textDataLg, { color: '#FFFFFF' }]}>
              {distanceLabel}
            </Text>
            <Text
              style={[text2xl, { color: '#FFFFFF' }]}
              numberOfLines={1}
            >
              {streetName}
            </Text>
            {currentStep?.instruction ? (
              <Text
                style={[textSm, { color: gray[300] }]}
                numberOfLines={1}
              >
                {currentStep.instruction}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Then strip */}
        {nextStep ? (
          <View style={styles.thenStrip}>
            <Text style={styles.thenPrefix}>Then</Text>
            <Text style={[textSm, styles.thenText]} numberOfLines={1}>
              {nextStep.instruction}
            </Text>
            <Text style={[textDataSm, { color: gray[300] }]}>
              {formatDistance(Math.round(nextStep.distanceMeters))}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ---- Footer Metrics ---- */}
      <View style={[styles.footerCard, shadows.md]}>
        <View style={styles.metricRow}>
          <MetricCell label="ETA" value={formatETA(remainingDurationSeconds)} />
          <MetricCell
            label="Dist"
            value={`${(remainingDistanceMeters / 1000).toFixed(1)} km`}
          />
          <MetricCell
            label="Speed"
            value={formatSpeed(currentSpeedMetersPerSecond) ?? '0 km/h'}
          />
        </View>

        {/* Route status badge */}
        <View style={styles.statusRow}>
          <Badge variant={routeStatus.variant} size="md">
            {routeStatus.text}
          </Badge>
        </View>
      </View>
    </View>
  );
};

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
  // -- Maneuver card --
  maneuverCard: {
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    overflow: 'hidden',
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    padding: space[4],
  },
  directionBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionText: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 22,
    color: darkTheme.textInverse,
  },
  maneuverInfo: {
    flex: 1,
    gap: 2,
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
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
  thenText: {
    flex: 1,
    color: gray[300],
  },
  // -- Footer card --
  footerCard: {
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    overflow: 'hidden',
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
  statusRow: {
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
