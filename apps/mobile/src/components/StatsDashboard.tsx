import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import {
  formatCo2Saved,
  formatDistance,
  formatDuration,
} from '@defensivepedal/core';
import type { TripStatsBucket, TripStatsDashboard } from '@defensivepedal/core';

import { brandColors, safetyColors } from '../design-system/tokens/colors';
import {
  fontFamily,
  textBase,
  textLg,
  textSm,
  textXl,
  textXs,
} from '../design-system/tokens/typography';
import { space } from '../design-system/tokens/spacing';
import { radii } from '../design-system/tokens/radii';
import { useStatsDashboard, type StatsPeriod } from '../hooks/useStatsDashboard';
import { useT } from '../hooks/useTranslation';

// ── Skeleton Placeholder ──

function SkeletonBox({ width, height }: { readonly width: number | string; readonly height: number }) {
  return (
    <View style={[styles.skeleton, { width: width as number, height }]} />
  );
}

function SkeletonSummaryCards() {
  return (
    <View style={styles.summaryGrid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.summaryCard}>
          <SkeletonBox width={20} height={20} />
          <SkeletonBox width={60} height={24} />
          <SkeletonBox width={48} height={12} />
        </View>
      ))}
    </View>
  );
}

function SkeletonStreakCard() {
  return (
    <View style={styles.streakCard}>
      <SkeletonBox width={140} height={16} />
      <View style={styles.streakRow}>
        <View style={styles.streakStat}>
          <SkeletonBox width={40} height={28} />
          <SkeletonBox width={80} height={12} />
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakStat}>
          <SkeletonBox width={40} height={28} />
          <SkeletonBox width={80} height={12} />
        </View>
      </View>
    </View>
  );
}

function SkeletonChartCard() {
  return (
    <View style={styles.chartCard}>
      <SkeletonBox width={120} height={18} />
      <SkeletonBox width={320} height={CHART_HEIGHT} />
    </View>
  );
}

function SkeletonModeSplit() {
  return (
    <View style={styles.modeSplitCard}>
      <SkeletonBox width={140} height={18} />
      <SkeletonBox width={320} height={12} />
      <View style={styles.modeSplitLegend}>
        <SkeletonBox width={80} height={12} />
        <SkeletonBox width={80} height={12} />
      </View>
    </View>
  );
}

// ── Period Selector ──

const PERIOD_KEYS: readonly StatsPeriod[] = ['week', 'month', 'all'] as const;

const PERIOD_LABEL_KEYS: Record<StatsPeriod, string> = {
  week: 'stats.week',
  month: 'stats.month',
  all: 'stats.allTime',
};

type PeriodSelectorProps = {
  readonly selected: StatsPeriod;
  readonly onSelect: (period: StatsPeriod) => void;
};

function PeriodSelector({ selected, onSelect }: PeriodSelectorProps) {
  const t = useT();
  return (
    <View style={styles.periodRow}>
      {PERIOD_KEYS.map((key) => {
        const isActive = selected === key;
        return (
          <Pressable
            key={key}
            style={[styles.periodChip, isActive && styles.periodChipActive]}
            onPress={() => onSelect(key)}
          >
            <Text
              style={[
                styles.periodChipText,
                isActive && styles.periodChipTextActive,
              ]}
            >
              {t(PERIOD_LABEL_KEYS[key])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Summary Card ──

type SummaryCardProps = {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly iconColor: string;
  readonly label: string;
  readonly value: string;
};

function SummaryCard({ icon, iconColor, label, value }: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ── Streak Display ──

type StreakDisplayProps = {
  readonly currentDays: number;
  readonly longestDays: number;
};

function StreakDisplay({ currentDays, longestDays }: StreakDisplayProps) {
  return (
    <View style={styles.streakCard}>
      <View style={styles.streakHeader}>
        <Ionicons name="flame-outline" size={20} color={brandColors.accent} />
        <Text style={styles.streakTitle}>Riding Streak</Text>
      </View>
      <View style={styles.streakRow}>
        <View style={styles.streakStat}>
          <Text style={styles.streakValue}>{currentDays}</Text>
          <Text style={styles.streakLabel}>Current (days)</Text>
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakStat}>
          <Text style={styles.streakValue}>{longestDays}</Text>
          <Text style={styles.streakLabel}>Longest (days)</Text>
        </View>
      </View>
    </View>
  );
}

// ── Mode Split ──

type ModeSplitProps = {
  readonly safeTrips: number;
  readonly fastTrips: number;
};

function ModeSplit({ safeTrips, fastTrips }: ModeSplitProps) {
  const total = safeTrips + fastTrips;
  const safePct = total > 0 ? Math.round((safeTrips / total) * 100) : 0;
  const fastPct = total > 0 ? 100 - safePct : 0;

  return (
    <View style={styles.modeSplitCard}>
      <Text style={styles.cardTitle}>Route Mode Split</Text>
      <View style={styles.modeSplitBar}>
        {safePct > 0 ? (
          <View
            style={[
              styles.modeSplitSegment,
              { flex: safePct, backgroundColor: safetyColors.safe, borderTopLeftRadius: radii.full, borderBottomLeftRadius: radii.full },
              fastPct === 0 && { borderTopRightRadius: radii.full, borderBottomRightRadius: radii.full },
            ]}
          />
        ) : null}
        {fastPct > 0 ? (
          <View
            style={[
              styles.modeSplitSegment,
              { flex: fastPct, backgroundColor: safetyColors.info, borderTopRightRadius: radii.full, borderBottomRightRadius: radii.full },
              safePct === 0 && { borderTopLeftRadius: radii.full, borderBottomLeftRadius: radii.full },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.modeSplitLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: safetyColors.safe }]} />
          <Text style={styles.legendText}>Safe ({safePct}%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: safetyColors.info }]} />
          <Text style={styles.legendText}>Fast ({fastPct}%)</Text>
        </View>
      </View>
    </View>
  );
}

// ── Ride Frequency Chart ──

const CHART_HEIGHT = 140;
const CHART_PADDING_LEFT = 32;
const CHART_PADDING_RIGHT = 8;
const CHART_PADDING_TOP = 8;
const CHART_PADDING_BOTTOM = 28;
const BAR_COLOR = brandColors.accent;
const GRID_COLOR = 'rgba(148, 163, 184, 0.2)';
const LABEL_COLOR = 'rgba(148, 163, 184, 0.7)';

type RideFrequencyChartProps = {
  readonly buckets: readonly TripStatsBucket[];
  readonly period: StatsPeriod;
};

const formatBucketLabel = (periodStart: string, period: StatsPeriod): string => {
  const date = new Date(periodStart + 'T00:00:00');
  if (period === 'week') {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
  }
  if (period === 'month') {
    return `W${Math.ceil(date.getDate() / 7)}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short' }).slice(0, 3);
};

function RideFrequencyChart({ buckets, period }: RideFrequencyChartProps) {
  const chartData = useMemo(() => {
    if (buckets.length === 0) return null;

    const maxTrips = Math.max(...buckets.map((b) => b.trips), 1);
    const plotW = 360 - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const plotH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const barGap = 4;
    const barWidth = Math.max(
      (plotW - barGap * (buckets.length - 1)) / buckets.length,
      4,
    );

    const bars = buckets.map((bucket, i) => {
      const barHeight = (bucket.trips / maxTrips) * plotH;
      const x = CHART_PADDING_LEFT + i * (barWidth + barGap);
      const y = CHART_PADDING_TOP + plotH - barHeight;
      return {
        x,
        y,
        width: barWidth,
        height: Math.max(barHeight, 2),
        trips: bucket.trips,
        label: formatBucketLabel(bucket.periodStart, period),
      };
    });

    const gridLines = [0, Math.round(maxTrips / 2), maxTrips];

    return { bars, maxTrips, plotH, gridLines };
  }, [buckets, period]);

  if (!chartData) {
    return (
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Ride Frequency</Text>
        <Text style={styles.chartEmpty}>No rides yet for this period.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartCard}>
      <Text style={styles.cardTitle}>Ride Frequency</Text>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 360 ${CHART_HEIGHT}`}>
        {/* Grid lines */}
        {chartData.gridLines.map((value, i) => {
          const y =
            CHART_PADDING_TOP +
            chartData.plotH -
            (value / chartData.maxTrips) * chartData.plotH;
          return (
            <Line
              key={`grid-${i}`}
              x1={CHART_PADDING_LEFT}
              y1={y}
              x2={360 - CHART_PADDING_RIGHT}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Y-axis labels */}
        {chartData.gridLines.map((value, i) => {
          const y =
            CHART_PADDING_TOP +
            chartData.plotH -
            (value / chartData.maxTrips) * chartData.plotH;
          return (
            <SvgText
              key={`ylabel-${i}`}
              x={CHART_PADDING_LEFT - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill={LABEL_COLOR}
              fontFamily={fontFamily.mono.medium}
            >
              {value}
            </SvgText>
          );
        })}

        {/* Bars */}
        {chartData.bars.map((bar, i) => (
          <Rect
            key={`bar-${i}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={Math.min(bar.width / 2, 4)}
            fill={BAR_COLOR}
            opacity={bar.trips > 0 ? 1 : 0.2}
          />
        ))}

        {/* X-axis labels */}
        {chartData.bars.map((bar, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={bar.x + bar.width / 2}
            y={CHART_HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            fill={LABEL_COLOR}
            fontFamily={fontFamily.body.medium}
          >
            {bar.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

// ── Composite Dashboard Component ──

function DashboardContent({ dashboard, period, hazardsReported = 0 }: { readonly dashboard: TripStatsDashboard; readonly period: StatsPeriod; readonly hazardsReported?: number }) {
  const t = useT();

  // Pick the period-appropriate totals + mode split. The chart still uses the
  // bucket arrays (weekly/monthly) — those drive the bars; the cards drive
  // the headline numbers. `weeklyTotals` / `monthlyTotals` may be missing on
  // older API responses; fall back to lifetime totals to avoid empty cards.
  const totals = (() => {
    if (period === 'week') return dashboard.weeklyTotals ?? dashboard.totals;
    if (period === 'month') return dashboard.monthlyTotals ?? dashboard.totals;
    return dashboard.totals;
  })();
  const modeSplit = (() => {
    if (period === 'week') return dashboard.weeklyModeSplit ?? dashboard.modeSplit;
    if (period === 'month') return dashboard.monthlyModeSplit ?? dashboard.modeSplit;
    return dashboard.modeSplit;
  })();
  const buckets = period === 'all' ? dashboard.monthly : dashboard.weekly;

  return (
    <>
      <View style={styles.summaryGrid}>
        <SummaryCard
          icon="bicycle-outline"
          iconColor={brandColors.accent}
          label={t('stats.trips')}
          value={String(totals.totalTrips)}
        />
        <SummaryCard
          icon="speedometer-outline"
          iconColor={safetyColors.info}
          label={t('stats.distance')}
          value={formatDistance(totals.totalDistanceMeters)}
        />
        <SummaryCard
          icon="time-outline"
          iconColor={safetyColors.caution}
          label={t('stats.duration')}
          value={formatDuration(totals.totalDurationSeconds)}
        />
        <SummaryCard
          icon="leaf-outline"
          iconColor={safetyColors.safe}
          label={t('stats.co2Saved')}
          value={formatCo2Saved(totals.totalCo2SavedKg)}
        />
        <SummaryCard
          icon="cash-outline"
          iconColor={brandColors.accent}
          label={t('history.eurSaved')}
          value={`€${(totals.totalDistanceMeters / 1000 * 0.35).toFixed(0)}`}
        />
        <SummaryCard
          icon="warning-outline"
          iconColor={safetyColors.caution}
          label={t('history.hazards')}
          value={String(hazardsReported)}
        />
        <SummaryCard
          icon="heart-outline"
          iconColor="#F2C30F"
          label={t('microlives.lifeEarned')}
          value={`${Math.round(totals.totalDistanceMeters / 1000 * 0.4 * 30)}m`}
        />
        <SummaryCard
          icon="people-outline"
          iconColor="#60A5FA"
          label={t('microlives.donatedToCity')}
          value={`${Math.round(totals.totalDistanceMeters / 1000 * 4.5)}s`}
        />
      </View>

      <StreakDisplay
        currentDays={dashboard.currentStreakDays}
        longestDays={dashboard.longestStreakDays}
      />

      <RideFrequencyChart buckets={buckets ?? []} period={period} />

      <ModeSplit
        safeTrips={modeSplit.safeTrips}
        fastTrips={modeSplit.fastTrips}
      />
    </>
  );
}

export function StatsDashboard({ hazardsReported = 0 }: { readonly hazardsReported?: number } = {}) {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const { data: dashboard, isLoading, error } = useStatsDashboard();

  return (
    <>
      <PeriodSelector selected={period} onSelect={setPeriod} />

      {isLoading ? (
        <>
          <SkeletonSummaryCards />
          <SkeletonStreakCard />
          <SkeletonChartCard />
          <SkeletonModeSplit />
        </>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={32} color={safetyColors.danger} />
          <Text style={styles.errorText}>Could not load statistics.</Text>
        </View>
      ) : dashboard ? (
        <DashboardContent dashboard={dashboard} period={period} hazardsReported={hazardsReported} />
      ) : null}
    </>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  errorContainer: {
    paddingVertical: space[10],
    alignItems: 'center',
    gap: space[3],
  },
  errorText: {
    ...textBase,
    color: brandColors.textSecondary,
  },

  // Skeleton
  skeleton: {
    backgroundColor: brandColors.bgSecondary,
    borderRadius: radii.md,
    opacity: 0.5,
  },

  // Period Selector
  periodRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  periodChip: {
    flex: 1,
    paddingVertical: space[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: brandColors.accent,
    borderColor: brandColors.accent,
  },
  periodChipText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textSecondary,
  },
  periodChipTextActive: {
    color: brandColors.textInverse,
  },

  // Summary Cards
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%' as unknown as number,
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgPrimary,
    alignItems: 'center',
    gap: space[1],
  },
  summaryValue: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
  },
  summaryLabel: {
    ...textXs,
    color: brandColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Streak
  streakCard: {
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.2)',
    backgroundColor: 'rgba(250, 204, 21, 0.05)',
    gap: space[3],
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  streakTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  streakValue: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 28,
  },
  streakLabel: {
    ...textXs,
    color: brandColors.textSecondary,
  },
  streakDivider: {
    width: 1,
    height: 40,
    backgroundColor: brandColors.borderDefault,
  },

  // Mode Split
  modeSplitCard: {
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgPrimary,
    gap: space[3],
  },
  modeSplitBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radii.full,
    overflow: 'hidden',
    backgroundColor: brandColors.bgSecondary,
  },
  modeSplitSegment: {
    height: '100%',
  },
  modeSplitLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space[6],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  legendText: {
    ...textXs,
    color: brandColors.textSecondary,
  },

  // Chart
  chartCard: {
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgPrimary,
    gap: space[3],
  },
  cardTitle: {
    ...textLg,
    color: brandColors.textPrimary,
  },
  chartEmpty: {
    ...textSm,
    color: brandColors.textMuted,
    textAlign: 'center',
    paddingVertical: space[6],
  },
});
