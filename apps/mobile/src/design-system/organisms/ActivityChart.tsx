/**
 * ActivityChart — 7-day bar chart showing daily rides & community seconds.
 *
 * Uses react-native-svg following the same coordinate-transform pattern
 * as ElevationChart. Two metrics: ride count (bars) and community seconds
 * (line overlay). Fills missing days with zero values.
 */
import type { DailyActivity } from '@defensivepedal/core';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Line,
  Path,
  Text as SvgText,
} from 'react-native-svg';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityChartProps {
  readonly daily: readonly DailyActivity[];
  readonly days?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 140;
const CHART_WIDTH = 360;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
const BAR_RADIUS = 3;
const GRID_COLOR = 'rgba(148, 163, 184, 0.2)';
const LABEL_COLOR = 'rgba(148, 163, 184, 0.7)';
const BAR_COLOR = '#FACC15';
const LINE_COLOR = '#3B82F6';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad missing days with zeros so we always have a contiguous range. */
const fillDays = (
  daily: readonly DailyActivity[],
  numDays: number,
): DailyActivity[] => {
  const today = new Date();
  const lookup = new Map(daily.map((d) => [d.day, d]));
  const filled: DailyActivity[] = [];

  for (let i = numDays - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    filled.push(
      lookup.get(key) ?? {
        day: key,
        rides: 0,
        distanceMeters: 0,
        co2SavedKg: 0,
        communitySeconds: 0,
      },
    );
  }

  return filled;
};

const buildLinePath = (
  values: readonly number[],
  maxVal: number,
  barWidth: number,
  gap: number,
): string => {
  if (maxVal === 0) return '';
  return values
    .map((v, i) => {
      const cx = PAD_LEFT + i * (barWidth + gap) + barWidth / 2;
      const cy = PAD_TOP + PLOT_H - (v / maxVal) * PLOT_H;
      return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(' ');
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ActivityChart = ({ daily, days = 7 }: ActivityChartProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  const chart = useMemo(() => {
    const filled = fillDays(daily, days);
    const rides = filled.map((d) => d.rides);
    const seconds = filled.map((d) => d.communitySeconds);
    const maxRides = Math.max(...rides, 1);
    const maxSeconds = Math.max(...seconds, 1);

    const gap = 6;
    const barWidth = Math.max(4, (PLOT_W - gap * (days - 1)) / days);

    const dayLabels = filled.map((d) => {
      const dt = new Date(d.day + 'T12:00:00');
      return DAY_NAMES[dt.getDay()];
    });

    // Y-axis ticks (3 levels)
    const yTicks = [0, Math.round(maxRides / 2), maxRides];

    const linePath = buildLinePath(seconds, maxSeconds, barWidth, gap);

    return { filled, rides, maxRides, maxSeconds, barWidth, gap, dayLabels, yTicks, linePath };
  }, [daily, days]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Activity</Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: BAR_COLOR }]} />
          <Text style={styles.legendText}>Rides</Text>
          <View style={[styles.legendDot, { backgroundColor: LINE_COLOR }]} />
          <Text style={styles.legendText}>Seconds donated</Text>
        </View>
      </View>
      <View style={styles.chartContainer}>
        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <Defs>
            <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={BAR_COLOR} stopOpacity="1" />
              <Stop offset="1" stopColor={BAR_COLOR} stopOpacity="0.5" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {chart.yTicks.map((tick, i) => {
            const y = PAD_TOP + PLOT_H - (tick / chart.maxRides) * PLOT_H;
            return (
              <Line
                key={`grid-${i}`}
                x1={PAD_LEFT}
                y1={y}
                x2={CHART_WIDTH - PAD_RIGHT}
                y2={y}
                stroke={GRID_COLOR}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Y-axis labels */}
          {chart.yTicks.map((tick, i) => {
            const y = PAD_TOP + PLOT_H - (tick / chart.maxRides) * PLOT_H;
            return (
              <SvgText
                key={`ylabel-${i}`}
                x={PAD_LEFT - 4}
                y={y + 3.5}
                textAnchor="end"
                fontSize={8}
                fill={LABEL_COLOR}
                fontFamily="monospace"
              >
                {tick}
              </SvgText>
            );
          })}

          {/* Bars */}
          {chart.rides.map((count, i) => {
            const barH = chart.maxRides > 0 ? (count / chart.maxRides) * PLOT_H : 0;
            const x = PAD_LEFT + i * (chart.barWidth + chart.gap);
            const y = PAD_TOP + PLOT_H - barH;
            return (
              <Rect
                key={`bar-${i}`}
                x={x}
                y={y}
                width={chart.barWidth}
                height={Math.max(barH, 0)}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill="url(#barGrad)"
              />
            );
          })}

          {/* Community seconds line overlay */}
          {chart.linePath ? (
            <Path
              d={chart.linePath}
              stroke={LINE_COLOR}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* X-axis day labels */}
          {chart.dayLabels.map((label, i) => {
            const x = PAD_LEFT + i * (chart.barWidth + chart.gap) + chart.barWidth / 2;
            return (
              <SvgText
                key={`xlabel-${i}`}
                x={x}
                y={CHART_HEIGHT - 6}
                textAnchor="middle"
                fontSize={8}
                fill={LABEL_COLOR}
                letterSpacing={0.3}
              >
                {label}
              </SvgText>
            );
          })}
        </Svg>
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
      borderColor: colors.borderDefault,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      gap: space[2],
      ...shadows.md,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    header: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontSize: 11,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      ...textXs,
      color: colors.textMuted,
      fontSize: 9,
      marginRight: 6,
    },
    chartContainer: {
      overflow: 'hidden',
      borderRadius: radii.md,
    },
  });
