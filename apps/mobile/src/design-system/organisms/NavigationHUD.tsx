/**
 * Design System v1.0 — NavigationHUD Organism
 *
 * Cycling navigation HUD, in two separate sections:
 *   - ManeuverCard (top): arrow + maneuver + street + distance, and the
 *     inline "Then" row for the maneuver after it
 *   - FooterCard (bottom): End Ride + hero remaining-time + ETA/dist/climb
 *
 * Redesigned 2026-09-12 — docs/plans/navigation-hud-redesign.md.
 * Dark-only (forced during navigation per spec rule).
 */
import React, { useEffect, useRef } from 'react';
import type { NavigationStep } from '@defensivepedal/core';
import { formatDistance, formatDistanceParts, formatDurationShort } from '@defensivepedal/core';
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
import { useHaptics } from '../hooks/useHaptics';
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
  onEndRide: () => void;
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
  /**
   * The maneuver AFTER the current one, rendered as the inline "Then" row.
   *
   * This used to live in `FooterCard`, ~700px away at the bottom of the
   * screen, which made the current and next maneuver read as one repeated
   * instruction instead of a sequence. Riders need the next turn while the
   * current one is still on screen — a cyclist commits to a lane earlier
   * than a driver and cannot re-read the screen mid-junction.
   */
  nextStep?: NavigationStep | null;
  distanceToManeuverMeters: number | null;
  gpsAccuracyMeters?: number | null;
  /** When true, replaces the GPS quality dot with an offline indicator. */
  isOffline?: boolean;
  onPress?: () => void;
}> = ({
  currentStep,
  nextStep,
  distanceToManeuverMeters,
  gpsAccuracyMeters,
  isOffline,
  onPress,
}) => {
  const t = useT();
  const iconName = getManeuverIcon(currentStep);
  const description = getManeuverDescription(currentStep, t);

  const distanceMeters =
    distanceToManeuverMeters !== null
      ? Math.round(distanceToManeuverMeters)
      : currentStep
        ? Math.round(currentStep.distanceMeters)
        : null;
  // Split so the numeral can be typeset at 36px with its unit at 13px beneath.
  const distanceParts = distanceMeters !== null ? formatDistanceParts(distanceMeters) : null;
  // …but a screen reader must hear the whole phrase ("102 m"), never the bare
  // numeral the sighted layout breaks onto its own line.
  const spokenDistance = distanceMeters !== null ? formatDistance(distanceMeters) : '—';

  // GPX courses hardcode `streetName: ''` (core/courseSteps.ts) because
  // synthesized geometry cannot know street names. The row COLLAPSES rather
  // than reserving a line — a blank gap under every maneuver is how an
  // imported course ends up looking broken.
  const streetName = currentStep?.streetName?.trim();

  const gpsColor = getGpsSignalColor(gpsAccuracyMeters);
  const poor = isGpsPoor(gpsAccuracyMeters);

  const nextIconName = nextStep ? getManeuverIcon(nextStep) : null;
  const nextLabel = nextStep
    ? (nextStep.streetName?.trim() || getManeuverDescription(nextStep, t))
    : null;

  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      testID="maneuver-card"
      style={[styles.maneuverCard, shadows.lg]}
      accessibilityRole="summary"
      accessibilityLabel={t('nav.maneuverA11y', { description, distance: spokenDistance })}
      accessibilityLiveRegion="assertive"
      accessibilityHint={onPress ? t('nav.tapReplay') : undefined}
    >
      <View style={styles.maneuverMain}>
        <Ionicons name={iconName} size={48} color={darkTheme.accent} />
        <View style={styles.maneuverTextCol}>
          {/* adjustsFontSizeToFit shrinks the maneuver text to keep the whole
              phrase on one line — longer locales (ro/es) would otherwise
              truncate with an ellipsis. minimumFontScale floors it at a
              still-legible size. */}
          <Text
            style={styles.maneuverDesc}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {description}
          </Text>
          {streetName ? (
            <Text testID="maneuver-street" style={styles.maneuverStreet} numberOfLines={1}>
              {streetName}
            </Text>
          ) : null}
        </View>
        <View
          style={styles.maneuverDistCol}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text testID="maneuver-distance-value" style={styles.maneuverDistValue}>
            {distanceParts?.value ?? '—'}
          </Text>
          {distanceParts ? (
            <Text testID="maneuver-distance-unit" style={styles.maneuverDistUnit}>
              {distanceParts.unit}
            </Text>
          ) : null}
        </View>
      </View>

      {nextStep && nextIconName ? (
        <View
          testID="maneuver-then"
          style={styles.maneuverThen}
          accessibilityLabel={`${t('nav.then')} ${nextLabel}`}
        >
          <Text style={styles.thenPrefix}>{t('nav.then')}</Text>
          <Ionicons name={nextIconName} size={20} color={darkTheme.accent} />
          <Text
            testID="maneuver-then-text"
            style={[textSm, styles.thenText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {nextLabel}
          </Text>
          <Text testID="maneuver-then-distance" style={[textDataSm, { color: gray[300] }]}>
            {formatDistance(Math.round(nextStep.distanceMeters))}
          </Text>
        </View>
      ) : null}

      <View
        testID="maneuver-gps"
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

/**
 * Bottom card: End Ride + hero remaining-time + summary metrics.
 *
 * Three bands, and the middle one is load-bearing: the End Ride column spans
 * ONLY the hero+metrics row, never the whole card. In multi-stop mode the card
 * grows a stop header and a to-finish line, and a full-height red column would
 * become a ~160px slab of danger red.
 *
 * The "then" strip that used to live here moved into `ManeuverCard` — do not
 * re-add it, that is exactly the duplication riders reported.
 */
export const FooterCard: React.FC<{
  remainingDurationSeconds: number;
  remainingDistanceMeters: number;
  totalClimbMeters: number | null;
  totalDescentMeters?: number | null;
  isClimbLive?: boolean;
  speedKmh?: number | null;
  /** When set, primary metrics retarget to this stop. Null/undefined = to destination. */
  nextStop?: FooterNextStop | null;
  /** Confirm-gated skip of the next stop. Hidden when absent. */
  onSkipStop?: () => void;
  /** Disable the skip control (e.g. offline — reroute needs the network). */
  skipDisabled?: boolean;
  /**
   * Ends the ride. This is the ONLY on-screen exit from navigation: the
   * control-rail stop button was removed 2026-09-12. The Android hardware
   * back button is the sole remaining fallback, so if this stops firing a
   * rider on iOS has no way to finish a ride.
   *
   * Already confirm-gated by the caller's Alert — do NOT add a second
   * confirmation, and do NOT make it a long-press. A rider stopping at a
   * junction gets one tap.
   */
  onEndRide: () => void;
}> = ({
  remainingDurationSeconds,
  remainingDistanceMeters,
  totalClimbMeters,
  isClimbLive = false,
  speedKmh,
  nextStop,
  onSkipStop,
  skipDisabled = false,
  onEndRide,
}) => {
  const t = useT();
  const haptics = useHaptics();

  // Retarget the primary metrics to the next stop when one is ahead.
  const targetingStop = nextStop != null;
  const etaSeconds = targetingStop ? nextStop.durationSeconds : remainingDurationSeconds;
  const distMeters = targetingStop ? nextStop.distanceMeters : remainingDistanceMeters;
  const climbMeters = targetingStop ? nextStop.climbMeters : totalClimbMeters;
  // Next-stop climb is always recomputed live; the route total may be an estimate.
  const climbLive = targetingStop ? true : isClimbLive;

  const remaining = formatDurationShort(etaSeconds);

  return (
    <View style={[styles.footerCard, shadows.md]}>
      {/* Band 1 — stop header: "STOP X of N" + skip control */}
      {targetingStop ? (
        <View testID="footer-stop-header" style={styles.stopHeaderRow}>
          <View style={styles.stopBadge}>
            <Ionicons name="flag" size={12} color={darkTheme.accent} />
            <Text style={styles.stopBadgeText}>
              {t('nav.stopXofN', { index: nextStop.stopIndex, count: nextStop.stopCount })}
            </Text>
          </View>
          {onSkipStop ? (
            <Pressable
              testID="footer-skip-stop"
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

      {/* Band 2 — End Ride + hero + metrics. The red column spans THIS only. */}
      <View testID="footer-main-band" style={styles.footerMainBand}>
        {/* Deliberately a plain Pressable, NOT PressableScale: that atom wraps
            its child in an Animated.View carrying only transform/opacity, so a
            flush column stretched by the parent would collapse to glyph height
            inside it (the shape of error-log #105). A spring scale on an
            edge-flush block reads wrong anyway — opacity is the right feedback. */}
        <Pressable
          testID="footer-end-ride"
          onPress={onEndRide}
          onPressIn={() => haptics.destructiveConfirm()}
          style={({ pressed }) => [
            styles.endRideColumn,
            pressed ? styles.endRideColumnPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('nav.endRide')}
        >
          <View style={styles.endRideGlyph} />
        </Pressable>

        <View style={styles.footerBody}>
          <View style={styles.heroRow}>
            <View style={styles.heroTime}>
              <Text testID="footer-hero-value" style={styles.heroValue}>
                {remaining.value}
              </Text>
              <Text testID="footer-hero-unit" style={styles.heroUnit}>
                {remaining.unit}
              </Text>
            </View>
            <View
              style={styles.heroSpeed}
              accessibilityLabel={`${t('nav.metricSpeed')}: ${
                speedKmh != null ? `${Math.round(speedKmh)} km/h` : '—'
              }`}
            >
              <Text testID="footer-speed-value" style={styles.speedValue}>
                {speedKmh != null ? `${Math.round(speedKmh)}` : '—'}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <MetricCell
              testID="footer-metric-eta"
              label={t('nav.metricEta')}
              value={formatETA(etaSeconds, t)}
            />
            <View style={styles.metricDivider} />
            <MetricCell
              testID="footer-metric-dist"
              label={t('nav.metricDist')}
              value={`${(distMeters / 1000).toFixed(1)} km`}
            />
            <View style={styles.metricDivider} />
            <MetricCell
              testID="footer-metric-climb"
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
        </View>
      </View>

      {/* Band 3 — subtle total-to-finish (only when metrics target a stop) */}
      {targetingStop ? (
        <Text testID="footer-to-finish" style={styles.toFinishText} numberOfLines={1}>
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
      nextStep={props.nextStep}
      distanceToManeuverMeters={props.distanceToManeuverMeters}
    />
    <FooterCard
      remainingDurationSeconds={props.remainingDurationSeconds}
      remainingDistanceMeters={props.remainingDistanceMeters}
      totalClimbMeters={props.totalClimbMeters}
      onEndRide={props.onEndRide}
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

const MetricCell: React.FC<{ label: string; value: string; testID?: string }> = ({
  label,
  value,
  testID,
}) => (
  <View style={styles.metricCell} testID={testID} accessibilityLabel={`${label}: ${value}`}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
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
  // Column container: the main row and the "Then" row each carry their own
  // padding, and overflow:hidden clips the Then row's fill to the radius.
  maneuverCard: {
    borderRadius: radii.xl,
    backgroundColor: darkTheme.bgPrimary,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    overflow: 'hidden',
  },
  maneuverMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[3],
  },
  maneuverTextCol: {
    flex: 1,
    // minWidth 0 lets the long maneuver string shrink instead of pushing the
    // distance column off the card in ro/es.
    minWidth: 0,
  },
  maneuverDesc: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 27,
    lineHeight: 30,
    color: '#FFFFFF',
  },
  maneuverStreet: {
    ...textSm,
    fontSize: 15,
    // gray[300] is the token the contrast test already specifies for this
    // pair (9.97:1 on bgPrimary) — do not swap it for textSecondary.
    color: gray[300],
    marginTop: 2,
  },
  maneuverDistCol: {
    alignItems: 'flex-end',
  },
  maneuverDistValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 36,
    lineHeight: 38,
    color: '#FFFFFF',
  },
  maneuverDistUnit: {
    ...textXs,
    fontSize: 13,
    color: gray[400],
  },
  maneuverThen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: darkTheme.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderStrong,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  // Absolute so it stops competing with the distance for the end of the row.
  gpsIndicator: {
    position: 'absolute',
    top: space[2],
    right: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
    paddingTop: space[2],
    paddingBottom: space[2],
  },
  footerMainBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // Full-bleed danger column. Spans the main band only — see FooterCard.
  endRideColumn: {
    width: 76,
    // Explicit even though the parent stretches by default — this column
    // filling the band is the whole visual idea, not an incidental result.
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: darkTheme.danger,
    borderRightWidth: 1,
    borderRightColor: darkTheme.borderDefault,
  },
  endRideColumnPressed: {
    opacity: 0.75,
  },
  endRideGlyph: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: gray[50],
  },
  footerBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[2],
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[2],
  },
  heroTime: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  heroValue: {
    fontFamily: fontFamily.heading.bold,
    fontSize: 26,
    lineHeight: 28,
    color: '#FFFFFF',
  },
  heroUnit: {
    ...textXs,
    color: gray[400],
  },
  heroSpeed: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  speedValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  speedUnit: {
    fontSize: 11,
    color: gray[400],
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
    marginTop: space[1],
    paddingTop: space[1],
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
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
    gap: 1,
  },
  metricLabel: {
    fontFamily: fontFamily.body.semiBold,
    fontSize: 10,
    // Explicit: the default 1.4x leading is dead vertical space in a band
    // the rider only glances at.
    lineHeight: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: gray[400],
  },
  metricValue: {
    fontFamily: fontFamily.mono.semiBold,
    fontSize: 16,
    lineHeight: 18,
    color: '#FFFFFF',
  },
});
