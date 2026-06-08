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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../../hooks/useTranslation';

/** Translator function shape returned by `useT()`. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

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

const getManeuverDescription = (step: NavigationStep | null, t: Translate): string => {
  if (!step) return t('nav.maneuverShort.continue');
  const type = step.maneuver.type?.toLowerCase() ?? '';
  const mod = step.maneuver.modifier?.toLowerCase() ?? '';

  if (type === 'arrive') return t('nav.maneuverShort.arrive');
  if (type === 'depart') return t('nav.maneuverShort.depart');
  if (type === 'roundabout' || type === 'rotary') {
    const exit = step.maneuver.exit;
    return exit
      ? t('nav.maneuverShort.roundaboutExit', { exit })
      : t('nav.maneuverShort.roundabout');
  }

  if (mod.includes('slight left')) return t('nav.maneuverShort.slightLeft');
  if (mod.includes('slight right')) return t('nav.maneuverShort.slightRight');
  if (mod.includes('sharp left')) return t('nav.maneuverShort.sharpLeft');
  if (mod.includes('sharp right')) return t('nav.maneuverShort.sharpRight');
  if (mod.includes('left')) return t('nav.maneuverShort.turnLeft');
  if (mod.includes('right')) return t('nav.maneuverShort.turnRight');
  if (mod.includes('uturn')) return t('nav.maneuverShort.uturn');
  if (mod.includes('straight') || type === 'continue') return t('nav.maneuverShort.continue');

  return t('nav.maneuverShort.continue');
};

const formatETA = (remainingSec: number, t: Translate): string => {
  if (remainingSec <= 0) return t('nav.etaNow');
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

/** Color tier index used to drive the dot's animated color. */
const GPS_COLOR_TIERS = [gray[500], '#F44336', '#FFC107', '#4CAF50'] as const;

const getGpsTier = (accuracy: number | null | undefined): 0 | 1 | 2 | 3 => {
  if (accuracy == null) return 0; // gray — no fix
  if (accuracy <= GPS_STRONG_THRESHOLD) return 3; // green
  if (accuracy <= GPS_FAIR_THRESHOLD) return 2; // amber
  return 1; // red — poor
};

const getGpsSignalColor = (accuracy: number | null | undefined): string =>
  GPS_COLOR_TIERS[getGpsTier(accuracy)];

const isGpsPoor = (accuracy: number | null | undefined): boolean =>
  accuracy == null || accuracy > GPS_FAIR_THRESHOLD;

/**
 * Animated GPS quality dot. Crossfades backgroundColor between the 4 tiers
 * (none → red → amber → green) over 200ms instead of snapping. Reduced
 * motion: snaps as before.
 */
const GpsQualityDot: React.FC<{ accuracy: number | null | undefined }> = ({ accuracy }) => {
  const reduced = useReducedMotion();
  const tier = getGpsTier(accuracy);
  const tierProgress = useRef(new Animated.Value(tier)).current;

  useEffect(() => {
    Animated.timing(tierProgress, {
      toValue: tier,
      duration: reduced ? 0 : 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // backgroundColor interpolation
    }).start();
  }, [tier, reduced, tierProgress]);

  const animatedBg = tierProgress.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [GPS_COLOR_TIERS[0], GPS_COLOR_TIERS[1], GPS_COLOR_TIERS[2], GPS_COLOR_TIERS[3]],
  });

  return (
    <Animated.View style={[styles.gpsDotInner, { backgroundColor: animatedBg }]} />
  );
};

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
  /** When true, replaces the GPS quality dot with an offline indicator. */
  isOffline?: boolean;
  onPress?: () => void;
}> = ({ currentStep, distanceToManeuverMeters, gpsAccuracyMeters, isOffline, onPress }) => {
  const t = useT();
  const iconName = getManeuverIcon(currentStep);
  const description = getManeuverDescription(currentStep, t);
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
      accessibilityLabel={t('nav.maneuverA11y', { description, distance })}
      accessibilityLiveRegion="assertive"
      accessibilityHint={onPress ? t('nav.tapReplay') : undefined}
    >
      <Ionicons name={iconName} size={32} color={darkTheme.accent} />
      {/* adjustsFontSizeToFit shrinks the maneuver text to keep the whole
          phrase on one line — longer locales (ro/es) would otherwise truncate
          with an ellipsis. minimumFontScale floors it at a still-legible size. */}
      <Text
        style={styles.maneuverDesc}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
      >
        {description}
      </Text>
      <Text style={styles.maneuverDivider}>·</Text>
      <Text style={styles.maneuverDist}>{distance}</Text>
      <View
        style={styles.gpsIndicator}
        accessibilityLabel={
          isOffline
            ? t('nav.offlineNoInternet')
            : t('nav.gpsSignal', {
                quality: t(
                  gpsAccuracyMeters == null
                    ? 'nav.gpsUnavailable'
                    : gpsAccuracyMeters <= GPS_STRONG_THRESHOLD
                      ? 'nav.gpsStrong'
                      : gpsAccuracyMeters <= GPS_FAIR_THRESHOLD
                        ? 'nav.gpsFair'
                        : 'nav.gpsPoor',
                ),
              })
        }
      >
        {isOffline ? (
          <Ionicons name="cloud-offline-outline" size={16} color="#FFC107" />
        ) : (
          <>
            {poor ? <PulsingGpsIcon color={gpsColor} /> : null}
            <GpsQualityDot accuracy={gpsAccuracyMeters} />
          </>
        )}
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
  const t = useT();
  if (!nextStep) return null;

  const nextIconName = getManeuverIcon(nextStep);
  const nextDist = formatDistance(Math.round(nextStep.distanceMeters));
  const nextDesc = getManeuverDescription(nextStep, t);

  return (
    <View
      style={[styles.thenStripStandalone, shadows.md]}
      accessibilityLabel={`${t('nav.then')} ${nextDesc} · ${nextDist}`}
    >
      <Text style={styles.thenPrefix}>{t('nav.then')}</Text>
      <Ionicons name={nextIconName} size={16} color={darkTheme.accent} />
      <Text
        style={[textSm, styles.thenText]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
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
/**
 * Per-stop metrics for a multi-stop route. When present, the FooterCard shows
 * distance/ETA/climb to the NEXT stop (with a "Stop X of N" header + a subtle
 * total-to-finish line) instead of straight to the final destination.
 */
export interface FooterNextStop {
  stopIndex: number;
  stopCount: number;
  distanceMeters: number;
  durationSeconds: number;
  climbMeters: number | null;
}

export const FooterCard: React.FC<{
  nextStep: NavigationStep | null;
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  totalClimbMeters: number | null;
  totalDescentMeters?: number | null;
  isClimbLive?: boolean;
  speedKmh?: number | null;
  /** When set, primary metrics retarget to this stop. Null/undefined = to destination (legacy). */
  nextStop?: FooterNextStop | null;
  /** Confirm-gated skip of the next stop. Hidden when absent. */
  onSkipStop?: () => void;
  /** Disable the skip control (e.g. offline — reroute needs the network). */
  skipDisabled?: boolean;
}> = ({
  nextStep,
  remainingDurationSeconds,
  remainingDistanceMeters,
  totalClimbMeters,
  totalDescentMeters,
  isClimbLive = false,
  speedKmh,
  nextStop,
  onSkipStop,
  skipDisabled = false,
}) => {
  const t = useT();
  const nextIconName = nextStep ? getManeuverIcon(nextStep) : null;
  const nextDist = nextStep
    ? formatDistance(Math.round(nextStep.distanceMeters))
    : null;
  const nextDesc = nextStep ? getManeuverDescription(nextStep, t) : null;

  // Retarget the primary metrics to the next stop when one is ahead.
  const targetingStop = nextStop != null;
  const etaSeconds = targetingStop ? nextStop!.durationSeconds : remainingDurationSeconds;
  const distMeters = targetingStop ? nextStop!.distanceMeters : remainingDistanceMeters;
  const climbMeters = targetingStop ? nextStop!.climbMeters : totalClimbMeters;
  // Next-stop climb is always recomputed live; the route total may be an estimate.
  const climbLive = targetingStop ? true : isClimbLive;

  return (
    <View style={[styles.footerCard, shadows.md]}>
      {/* "Then" strip — the upcoming maneuver (turn), distinct from the next stop */}
      {nextStep && nextIconName ? (
        <View style={styles.thenStripInline}>
          <Text style={styles.thenPrefix}>{t('nav.then')}</Text>
          <Ionicons name={nextIconName} size={16} color={darkTheme.accent} />
          <Text
            style={[textSm, styles.thenText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {nextDesc}
          </Text>
          <Text style={[textDataSm, { color: gray[300] }]}>{nextDist}</Text>
        </View>
      ) : null}

      {/* Stop header: "STOP X of N" + skip control */}
      {targetingStop ? (
        <View style={styles.stopHeaderRow}>
          <View style={styles.stopBadge}>
            <Ionicons name="flag" size={12} color={darkTheme.accent} />
            <Text style={styles.stopBadgeText}>
              {t('nav.stopXofN', { index: nextStop!.stopIndex, count: nextStop!.stopCount })}
            </Text>
          </View>
          {onSkipStop ? (
            <Pressable
              onPress={onSkipStop}
              disabled={skipDisabled}
              hitSlop={10}
              style={({ pressed }) => [
                styles.skipBtn,
                pressed && !skipDisabled ? styles.skipBtnPressed : null,
                skipDisabled ? styles.skipBtnDisabled : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('nav.skipStop')}
            >
              <Ionicons
                name="play-skip-forward"
                size={13}
                color={skipDisabled ? gray[500] : darkTheme.accent}
              />
              <Text style={[styles.skipBtnText, skipDisabled ? { color: gray[500] } : null]}>
                {t('nav.skipStop')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Metrics row (next stop when targeting one, else final destination) */}
      <View style={styles.metricRow}>
        <MetricCell
          label={t('nav.metricSpeed')}
          value={speedKmh != null ? `${Math.round(speedKmh)}` : '—'}
          unit="km/h"
        />
        <View style={styles.metricDivider} />
        <MetricCell label={t('nav.metricEta')} value={formatETA(etaSeconds, t)} />
        <View style={styles.metricDivider} />
        <MetricCell
          label={t('nav.metricDist')}
          value={`${(distMeters / 1000).toFixed(1)} km`}
        />
        <View style={styles.metricDivider} />
        <MetricCell
          label={t('nav.metricClimb')}
          value={
            climbMeters !== null
              ? climbLive
                ? `↑${Math.round(climbMeters)} m`
                : `~↑${Math.round(climbMeters)} m`
              : '—'
          }
        />
      </View>

      {/* Subtle total-to-finish line (only when primary metrics target a stop) */}
      {targetingStop ? (
        <Text style={styles.toFinishText} numberOfLines={1}>
          {t('nav.toFinish', {
            dist: `${(remainingDistanceMeters / 1000).toFixed(1)} km`,
            eta: formatETA(remainingDurationSeconds, t),
          })}
        </Text>
      ) : null}
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
// Steep grade indicator
// ---------------------------------------------------------------------------

const STEEP_UPHILL_THRESHOLD = 8; // %
const STEEP_DOWNHILL_THRESHOLD = 7; // %

/**
 * Compact pill that appears when the rider is on a steep segment.
 * Shows uphill (>=8%) in amber or downhill (>=7%) in red.
 */
export const SteepGradeIndicator: React.FC<{ gradePercent: number | null }> = ({
  gradePercent,
}) => {
  const t = useT();
  if (gradePercent == null) return null;

  const isSteepUp = gradePercent >= STEEP_UPHILL_THRESHOLD;
  const isSteepDown = gradePercent <= -STEEP_DOWNHILL_THRESHOLD;

  if (!isSteepUp && !isSteepDown) return null;

  const label = `${isSteepUp ? '↑' : '↓'} ${t('nav.steepLabel')}`;
  const bgColor = isSteepUp ? '#92400E' : '#991B1B'; // amber-800 / red-800
  const textColor = isSteepUp ? '#FDE68A' : '#FCA5A5'; // amber-200 / red-300
  const iconName = isSteepUp ? 'trending-up' : 'trending-down';

  return (
    <View
      style={[steepStyles.pill, { backgroundColor: bgColor }]}
      accessibilityLabel={t('nav.steepGradeA11y', {
        direction: t(isSteepUp ? 'nav.steepUphill' : 'nav.steepDownhill'),
        percent: Math.abs(gradePercent),
      })}
      accessibilityRole="text"
    >
      <Ionicons name={iconName} size={14} color={textColor} />
      <Text style={[steepStyles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const steepStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: space[3],
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  text: {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
});

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
  stopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.borderDefault,
    backgroundColor: darkTheme.bgSecondary,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  stopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stopBadgeText: {
    ...textXs,
    fontFamily: fontFamily.heading.semiBold,
    color: darkTheme.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[2],
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
  },
  skipBtnPressed: {
    opacity: 0.6,
  },
  skipBtnDisabled: {
    opacity: 0.4,
  },
  skipBtnText: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.accent,
  },
  toFinishText: {
    ...textXs,
    color: gray[400],
    textAlign: 'center',
    paddingTop: 2,
    paddingBottom: space[2],
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
