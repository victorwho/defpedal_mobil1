import type { NavigationStep } from '@defensivepedal/core';
import { formatDistance, formatSpeed } from '@defensivepedal/core';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors } from '../design-system/tokens/colors';
import { shadows } from '../design-system/tokens/shadows';

const getManeuverBadgeLabel = (step: NavigationStep | null) => {
  if (!step) {
    return 'GO';
  }

  const modifier = step.maneuver.modifier?.toLowerCase() ?? '';
  const type = step.maneuver.type?.toLowerCase() ?? '';

  if (modifier.includes('slight left')) {
    return 'SL';
  }

  if (modifier.includes('slight right')) {
    return 'SR';
  }

  if (modifier.includes('left')) {
    return 'L';
  }

  if (modifier.includes('right')) {
    return 'R';
  }

  if (type === 'arrive') {
    return 'END';
  }

  return 'GO';
};

type NavigationManeuverCardProps = {
  currentStep: NavigationStep | null;
  nextStep: NavigationStep | null;
  distanceToManeuverMeters: number | null;
  gpsLabel: string;
};

export const NavigationManeuverCard = ({
  currentStep,
  nextStep,
  distanceToManeuverMeters,
  gpsLabel,
}: NavigationManeuverCardProps) => {
  const distanceLabel =
    distanceToManeuverMeters !== null
      ? formatDistance(Math.round(distanceToManeuverMeters))
      : currentStep
        ? formatDistance(Math.round(currentStep.distanceMeters))
        : 'Waiting';

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{getManeuverBadgeLabel(currentStep)}</Text>
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.distanceLabel}>{distanceLabel}</Text>
          <Text style={styles.instructionLabel}>
            {currentStep?.instruction ?? 'Waiting for the next maneuver'}
          </Text>
          <Text style={styles.streetLabel}>
            {currentStep?.streetName?.trim() ? currentStep.streetName : gpsLabel}
          </Text>
        </View>
      </View>

      {nextStep ? (
        <View style={styles.thenStrip}>
          <Text style={styles.thenPrefix}>Then</Text>
          <Text style={styles.thenText} numberOfLines={1}>
            {nextStep.instruction}
          </Text>
          <Text style={styles.thenDistance}>{formatDistance(Math.round(nextStep.distanceMeters))}</Text>
        </View>
      ) : null}
    </View>
  );
};

type NavigationFooterPanelProps = {
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  currentSpeedMetersPerSecond: number | null;
  routeGapMeters: number;
  offRouteCountdownSeconds: number | null;
  reroutePending: boolean;
};

export const NavigationFooterPanel = ({
  remainingDurationSeconds,
  remainingDistanceMeters,
  currentSpeedMetersPerSecond,
  routeGapMeters,
  offRouteCountdownSeconds,
  reroutePending,
}: NavigationFooterPanelProps) => {
  const etaLabel =
    remainingDurationSeconds > 0
      ? new Date(Date.now() + remainingDurationSeconds * 1000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Soon';

  const speedLabel = formatSpeed(currentSpeedMetersPerSecond) ?? '0 km/h';
  const routeGapLabel = formatDistance(Math.round(routeGapMeters));
  const offRouteMessage = reroutePending
    ? 'Rerouting from live GPS...'
    : offRouteCountdownSeconds !== null && offRouteCountdownSeconds > 0
      ? `Off route. Auto-reroute in ${offRouteCountdownSeconds}s.`
      : routeGapMeters > 50
        ? 'Off route. Manual reroute is available.'
        : 'On route.';

  return (
    <View style={styles.footerCard}>
      <View style={styles.metricRow}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Arrival</Text>
          <Text style={styles.metricValue}>{etaLabel}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>{(remainingDistanceMeters / 1000).toFixed(1)} km</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Speed</Text>
          <Text style={styles.metricValue}>{speedLabel}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Gap</Text>
          <Text style={styles.metricValue}>{routeGapLabel}</Text>
        </View>
      </View>
      <View style={styles.statusStrip}>
        <Text style={styles.statusText}>{offRouteMessage}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
    ...shadows.xl,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  badge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.accent,
  },
  badgeLabel: {
    color: brandColors.textInverse,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  distanceLabel: {
    color: brandColors.textInverse,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  instructionLabel: {
    color: brandColors.textInverse,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  streetLabel: {
    color: brandColors.textSecondary,
    fontSize: 14,
    lineHeight: 18,
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  thenPrefix: {
    color: brandColors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  thenText: {
    flex: 1,
    color: brandColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  thenDistance: {
    color: brandColors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  footerCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
    ...shadows.xl,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 6,
  },
  metricCell: {
    width: '50%',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  metricLabel: {
    color: brandColors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    color: brandColors.textInverse,
    fontSize: 17,
    fontWeight: '900',
  },
  statusStrip: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusText: {
    color: brandColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
