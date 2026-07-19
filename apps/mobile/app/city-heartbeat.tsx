/**
 * City Heartbeat — Community pulse dashboard showing real-time cycling
 * activity, 7-day trends, hazard hotspots, and top contributors.
 *
 * Accessible from: community.tsx card.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../src/components/Screen';
import { AnimatedCounter } from '../src/design-system/atoms/AnimatedCounter';
import { Surface } from '../src/design-system/atoms/Card';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { ActivityChart } from '../src/design-system/organisms/ActivityChart';
import { LeaderboardSection } from '../src/design-system/organisms/LeaderboardSection';
import { PulseHeader } from '../src/design-system/organisms/PulseHeader';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import {
  fontFamily,
  textXs,
  textSm,
  textBase,
  textDataMd,
} from '../src/design-system/tokens/typography';
import { useCityHeartbeat } from '../src/hooks/useCityHeartbeat';
import { useT } from '../src/hooks/useTranslation';
import { HAZARD_TYPE_OPTIONS, type HazardType } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Hazard label lookup
// ---------------------------------------------------------------------------

const HAZARD_LABELS: Record<string, string> = Object.fromEntries(
  HAZARD_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const hazardLabel = (type: HazardType | string): string =>
  HAZARD_LABELS[type] ?? type.replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CityHeartbeatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { heartbeat, isLoading, isRefreshing, error, refetch } = useCityHeartbeat();
  const t = useT();
  const screenTitle = t('cityHeartbeat.title');

  // ── Community-visibility ladder (honest labels). Every fallback keeps
  // the pre-ladder behavior so persisted old-shape caches render fine. ──
  const windowUsed = heartbeat?.windowUsed ?? 'today';
  const scopeUsed = heartbeat?.scopeUsed ?? 'nearby';
  const pulse = heartbeat?.pulse ?? heartbeat?.today;
  const chartMode = heartbeat?.chartMode ?? 'daily';
  const chartDaily = heartbeat?.chartDaily ?? heartbeat?.daily ?? [];
  const chartWeekly = heartbeat?.chartWeekly ?? [];

  const cityLabel = heartbeat?.localityName ?? t('cityHeartbeat.cityFallback');
  // Header title follows the scope: city name nearby, honest wider labels
  // otherwise — never a city name over region/community-wide numbers.
  const headerTitle =
    scopeUsed === 'nearby'
      ? heartbeat?.localityName ?? null
      : scopeUsed === 'region'
        ? t('cityHeartbeat.scopeRegionTitle')
        : t('cityHeartbeat.scopeCommunityTitle');
  const pulseLabel = t(`cityHeartbeat.pulse_${windowUsed}_${scopeUsed}`, { city: cityLabel });
  const activeRidersLabel = t(
    `cityHeartbeat.activeRiders_${windowUsed}_${(pulse?.activeRiders ?? 0) === 1 ? 'one' : 'other'}`,
  );

  if (isLoading && !heartbeat) {
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>{t('cityHeartbeat.loading')}</Text>
        </View>
      </Screen>
    );
  }

  if (error && !heartbeat) {
    // Audit 2026-07-05 UX-3: never print the raw error string (leaks internal
    // endpoint/RPC detail and reads as a crash) and never dead-end — offer a
    // retry. The raw message still reaches Sentry via the query layer.
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('cityHeartbeat.loadFailed')}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!heartbeat) {
    return (
      <Screen title={screenTitle} headerVariant="back">
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t('cityHeartbeat.noData')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={screenTitle} headerVariant="back">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isRefreshing}
            onRefresh={refetch}
            tintColor={colors.accent}
          />
        }
      >
        {/* Pulse header — honest window/scope labeling */}
        <FadeSlideIn delay={0}>
          <PulseHeader
            cityName={headerTitle}
            activeRidersToday={pulse?.activeRiders ?? 0}
            totalRidesToday={pulse?.rides ?? 0}
            activeRidersLabel={activeRidersLabel}
          />
        </FadeSlideIn>

        {/* Lifetime community totals — community-wide, only ever go up, so
            the first stat card a user reads is never a zero (Change 4) */}
        {heartbeat.communityTotals && heartbeat.communityTotals.rides > 0 && (
          <FadeSlideIn delay={50}>
            <Surface>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.communityAllTime')}</Text>
              <Text style={styles.sectionSub}>{t('cityHeartbeat.communityAllTimeSub')}</Text>
              <View style={styles.statGrid}>
                <StatCell
                  label={t('cityHeartbeat.totalRides')}
                  value={heartbeat.communityTotals.rides}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.distance')}
                  value={heartbeat.communityTotals.distanceMeters / 1000}
                  suffix=" km"
                  decimals={0}
                  color={colors.info}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.co2Saved')}
                  value={heartbeat.communityTotals.co2SavedKg}
                  suffix=" kg"
                  decimals={1}
                  color={colors.safe}
                  styles={styles}
                />
                <StatCell
                  label={t('cityHeartbeat.riders')}
                  value={heartbeat.communityTotals.uniqueRiders}
                  suffix=""
                  decimals={0}
                  color={colors.accent}
                  styles={styles}
                />
              </View>
            </Surface>
          </FadeSlideIn>
        )}

        {/* Pulse stats for the resolved (window, scope) rung */}
        <FadeSlideIn delay={100}>
          <Surface>
            <Text style={styles.sectionLabel}>{pulseLabel}</Text>
            <View style={styles.statGrid}>
              <StatCell
                label={t('cityHeartbeat.rides')}
                value={pulse?.rides ?? 0}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.distance')}
                value={(pulse?.distanceMeters ?? 0) / 1000}
                suffix=" km"
                decimals={1}
                color={colors.info}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.co2Saved')}
                value={pulse?.co2SavedKg ?? 0}
                suffix=" kg"
                decimals={1}
                color={colors.safe}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.donated')}
                value={pulse?.communitySeconds ?? 0}
                suffix=" sec"
                decimals={0}
                color={colors.info}
                styles={styles}
              />
            </View>
          </Surface>
        </FadeSlideIn>

        {/* Activity chart — daily (7 days) or weekly (4 weeks) at the resolved scope */}
        <FadeSlideIn delay={200}>
          <ActivityChart
            daily={chartDaily}
            days={7}
            mode={chartMode}
            weekly={chartWeekly}
            title={t(
              chartMode === 'weekly'
                ? 'cityHeartbeat.chartTitleWeekly'
                : 'cityHeartbeat.chartTitleDaily',
            )}
          />
        </FadeSlideIn>

        {/* Cumulative totals */}
        <FadeSlideIn delay={300}>
          <Surface>
            <Text style={styles.sectionLabel}>{t('cityHeartbeat.allTime')}</Text>
            <View style={styles.statGrid}>
              <StatCell
                label={t('cityHeartbeat.totalRides')}
                value={heartbeat.totals.rides}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.distance')}
                value={heartbeat.totals.distanceMeters / 1000}
                suffix=" km"
                decimals={0}
                color={colors.info}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.co2Saved')}
                value={heartbeat.totals.co2SavedKg}
                suffix=" kg"
                decimals={1}
                color={colors.safe}
                styles={styles}
              />
              <StatCell
                label={t('cityHeartbeat.riders')}
                value={heartbeat.totals.uniqueRiders}
                suffix=""
                decimals={0}
                color={colors.accent}
                styles={styles}
              />
            </View>
          </Surface>
        </FadeSlideIn>

        {/* Hazard hotspots */}
        {heartbeat.hazardHotspots.length > 0 && (
          <FadeSlideIn delay={400}>
            <Surface style={{ gap: space[2] }}>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.hazardHotspots')}</Text>
              <Text style={styles.sectionSub}>{t('cityHeartbeat.hazardHotspotsSub')}</Text>
              {heartbeat.hazardHotspots.map((h, i) => (
                <View key={`${h.hazardType}-${i}`} style={styles.hazardRow}>
                  <View style={styles.hazardBadge}>
                    <Text style={styles.hazardBadgeText}>{h.count}</Text>
                  </View>
                  <Text style={styles.hazardLabel}>{hazardLabel(h.hazardType)}</Text>
                </View>
              ))}
            </Surface>
          </FadeSlideIn>
        )}

        {/* Top contributors */}
        {heartbeat.topContributors.length > 0 && (
          <FadeSlideIn delay={500}>
            <Surface style={{ gap: space[2] }}>
              <Text style={styles.sectionLabel}>{t('cityHeartbeat.topContributors')}</Text>
              {heartbeat.topContributors.map((c, i) => (
                <View key={`contributor-${i}`} style={styles.contributorRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  {c.avatarUrl ? (
                    <Image
                      source={{ uri: c.avatarUrl }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {c.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.contributorInfo}>
                    <Text style={styles.contributorName} numberOfLines={1}>
                      {c.displayName}
                    </Text>
                    <Text style={styles.contributorStats}>
                      {c.rideCount} {t('cityHeartbeat.rides').toLowerCase()} · {c.distanceKm} km
                    </Text>
                  </View>
                </View>
              ))}
            </Surface>
          </FadeSlideIn>
        )}

        <FadeSlideIn delay={600}>
          <LeaderboardSection />
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// StatCell (internal)
// ---------------------------------------------------------------------------

interface StatCellProps {
  readonly label: string;
  readonly value: number;
  readonly suffix: string;
  readonly decimals: number;
  readonly color: string;
  readonly styles: ReturnType<typeof createThemedStyles>;
}

const StatCell = ({ label, value, suffix, decimals, color, styles }: StatCellProps) => (
  <View style={styles.statCell}>
    <AnimatedCounter
      targetValue={value}
      suffix={suffix}
      decimals={decimals}
      duration={1200}
      style={{ ...textDataMd, fontFamily: fontFamily.mono.bold, color }}
    />
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrollContent: {
      gap: space[3],
      paddingBottom: space[6],
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[16],
      gap: space[3],
    },
    loadingText: {
      ...textSm,
      color: colors.textSecondary,
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: space[3],
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'center',
      paddingHorizontal: space[6],
      paddingVertical: space[2],
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    retryButtonText: {
      ...textSm,
      color: colors.accent,
      fontFamily: fontFamily.body.semiBold,
      textAlign: 'center',
    },

    sectionLabel: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 10,
    },
    sectionSub: {
      ...textXs,
      color: colors.textSecondary,
      marginBottom: space[1],
    },

    // Stat grid (2x2)
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    statCell: {
      flex: 1,
      minWidth: '45%' as unknown as number,
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      gap: 2,
    },
    statLabel: {
      ...textXs,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
    },

    // Hazards
    hazardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[1],
    },
    hazardBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hazardBadgeText: {
      ...textXs,
      fontFamily: fontFamily.mono.bold,
      color: gray[50],
      fontSize: 11,
    },
    hazardLabel: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },

    // Contributors
    contributorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[1],
    },
    rankBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      ...textXs,
      fontFamily: fontFamily.mono.bold,
      color: colors.textInverse,
      fontSize: 11,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    avatarPlaceholder: {
      backgroundColor: colors.bgTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.textSecondary,
    },
    contributorInfo: {
      flex: 1,
      gap: 1,
    },
    contributorName: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    contributorStats: {
      ...textXs,
      fontFamily: fontFamily.mono.medium,
      color: colors.textMuted,
    },

    bottomSpacer: {
      height: space[4],
    },
  });
