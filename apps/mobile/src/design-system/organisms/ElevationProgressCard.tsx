import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, Line, Rect } from 'react-native-svg';

import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

export const CHART_WIDTH = 280;
const CHART_HEIGHT = 50;
const PADDING_TOP = 4;
const PADDING_BOTTOM = 2;

type ElevationProgressCardProps = {
  /** Array of elevation values along the route */
  elevationProfile: readonly number[];
  /** Total route distance in meters */
  totalDistanceMeters: number;
  /** Remaining distance in meters */
  remainingDistanceMeters: number;
  /** Whether user is currently off-route */
  isOffRoute: boolean;
};

export const buildPath = (
  profile: readonly number[],
  width: number,
  height: number,
): string => {
  if (profile.length < 2) return '';

  const minElev = Math.min(...profile);
  const maxElev = Math.max(...profile);
  const range = maxElev - minElev || 1;

  const points = profile.map((elev, i) => {
    const x = (i / (profile.length - 1)) * width;
    const y = PADDING_TOP + (1 - (elev - minElev) / range) * (height - PADDING_TOP - PADDING_BOTTOM);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Area path: line across top, then close along bottom
  return `M0,${height} L${points.join(' L')} L${width},${height} Z`;
};

/** Half the marker stroke width — the clamp margin. */
const HALF_STROKE = 1.5;

/**
 * X position of the "you are here" marker, clamped so the line is never half
 * outside the viewBox.
 *
 * At 0% (ride just started, or a reroute just reset progress) an unclamped
 * marker sits at x=0 and reads as a chart border rather than a position —
 * which is why it looked like there was no marker at all.
 */
export const computeMarkerX = (progressRatio: number): number => {
  const safe = Number.isFinite(progressRatio) ? Math.max(0, Math.min(1, progressRatio)) : 0;
  return Math.min(CHART_WIDTH - HALF_STROKE, Math.max(HALF_STROKE, safe * CHART_WIDTH));
};

export const ElevationProgressCard = ({
  elevationProfile,
  totalDistanceMeters,
  remainingDistanceMeters,
  isOffRoute,
}: ElevationProgressCardProps) => {
  const progressRatio = useMemo(
    () => Math.max(0, Math.min(1, 1 - remainingDistanceMeters / totalDistanceMeters)),
    [remainingDistanceMeters, totalDistanceMeters],
  );

  const areaPath = useMemo(
    () => buildPath(elevationProfile, CHART_WIDTH, CHART_HEIGHT),
    [elevationProfile],
  );

  // Clamp so the 2px line is never half-outside the viewBox. At 0% (ride just
  // started, or a reroute just reset progress) an unclamped marker sits at
  // x=0 and reads as a chart border rather than "you are here" — which is how
  // it looked absent entirely.
  const markerX = computeMarkerX(progressRatio);

  const minElev = Math.min(...elevationProfile);
  const maxElev = Math.max(...elevationProfile);

  // Current elevation (interpolated)
  const profileIndex = Math.min(
    Math.floor(progressRatio * (elevationProfile.length - 1)),
    elevationProfile.length - 1,
  );
  const currentElev = elevationProfile[profileIndex] ?? minElev;

  const fillColor = isOffRoute ? '#F59E0B' : '#3B82F6';
  const gradientId = isOffRoute ? 'elevGradOff' : 'elevGrad';

  if (!areaPath || elevationProfile.length < 2) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.label, isOffRoute && styles.labelOffRoute]}>
          {isOffRoute ? 'OFF ROUTE' : 'ELEVATION'}
        </Text>
        <Text style={styles.currentElev}>{Math.round(currentElev)} m</Text>
      </View>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity="0.5" />
            <Stop offset="1" stopColor={fillColor} stopOpacity="0.1" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Travelled portion, dimmed behind the marker. The full-route profile
            never changes shape as the rider moves — only this overlay and the
            marker do — so the chart reads as "the whole ride, and you are
            here" rather than a shrinking view of what is left. */}
        {markerX > HALF_STROKE ? (
          <Rect
            x={0}
            y={0}
            width={markerX}
            height={CHART_HEIGHT}
            fill="#000000"
            opacity={0.28}
          />
        ) : null}
        {/* Progress marker line */}
        <Line
          x1={markerX}
          y1={0}
          x2={markerX}
          y2={CHART_HEIGHT}
          stroke={isOffRoute ? '#EF4444' : '#FACC15'}
          strokeWidth={3}
        />
        {/* Cap so the position is legible against a busy profile. */}
        <Circle
          cx={markerX}
          cy={PADDING_TOP}
          r={3.5}
          fill={isOffRoute ? '#EF4444' : '#FACC15'}
        />
      </Svg>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{Math.round(minElev)} m</Text>
        <Text style={styles.footerText}>
          {Math.round(progressRatio * 100)}%
        </Text>
        <Text style={styles.footerText}>{Math.round(maxElev)} m</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(11, 16, 32, 0.92)',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[1],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...textXs,
    fontFamily: fontFamily.heading.bold,
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 9,
  },
  labelOffRoute: {
    color: '#F59E0B',
  },
  currentElev: {
    ...textXs,
    fontFamily: fontFamily.body.medium,
    color: gray[300],
    fontSize: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    ...textXs,
    color: gray[500],
    fontSize: 9,
  },
});
