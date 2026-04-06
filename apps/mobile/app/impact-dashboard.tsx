import type { ImpactDashboard } from '@defensivepedal/core';
import { formatMicrolivesAsTime, formatCommunitySeconds } from '@defensivepedal/core';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { AnimatedCounter } from '../src/design-system/atoms/AnimatedCounter';
import { BadgeIcon } from '../src/design-system/atoms/BadgeIcon';
import { BackButton } from '../src/design-system/atoms/BackButton';
import { Button } from '../src/design-system/atoms/Button';
import { useBadges } from '../src/hooks/useBadges';
import { brandColors, darkTheme, safetyColors } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textDataLg,
  textDataMd,
  textSm,
  textXs,
} from '../src/design-system/tokens/typography';
import { StreakCard } from '../src/design-system/organisms/StreakCard';
import { mobileApi } from '../src/lib/api';

// ---------------------------------------------------------------------------
// Stat tile (reused pattern from CommunityStatsCard)
// ---------------------------------------------------------------------------

type StatTileProps = {
  readonly value: string;
  readonly unit: string;
  readonly label: string;
};

const StatTile = ({ value, unit, label }: StatTileProps) => (
  <View style={styles.statTile}>
    <View style={styles.statTileValueRow}>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileUnit}>{unit}</Text>
    </View>
    <Text style={styles.statTileLabel}>{label}</Text>
  </View>
);

// StreakCard imported from design-system/organisms/StreakCard

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Recent Badges section
// ---------------------------------------------------------------------------

const TIER_FROM_LEVEL: Record<number, 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'> = {
  1: 'bronze', 2: 'silver', 3: 'gold', 4: 'platinum', 5: 'diamond',
};

const RecentBadgesSection = () => {
  const { data } = useBadges();
  if (!data || data.earned.length === 0) return null;

  // Sort earned by date descending, take first 5
  const recentEarned = [...data.earned]
    .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''))
    .slice(0, 5);

  // Map to definitions
  const defMap = new Map(data.definitions.map((d) => [d.badgeKey, d]));

  return (
    <View style={styles.card}>
      <Text style={styles.cardHeader}>Recent badges</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentBadgesRow}
      >
        {recentEarned.map((ub) => {
          const def = defMap.get(ub.badgeKey);
          if (!def) return null;
          const tier = TIER_FROM_LEVEL[def.tier] ?? 'bronze';
          return (
            <View key={ub.badgeKey} style={styles.recentBadgeItem}>
              <BadgeIcon badgeKey={def.badgeKey} tierFamily={def.tierFamily} tier={tier} size="md" />
              <Text style={styles.recentBadgeName} numberOfLines={2}>{def.name}</Text>
            </View>
          );
        })}
      </ScrollView>
      <Pressable onPress={() => router.push('/achievements' as any)}>
        <Text style={styles.viewAllBadgesLink}>View all &gt;</Text>
      </Pressable>
    </View>
  );
};

const DASHBOARD_KEY = 'impact-dashboard';

export default function ImpactDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, isLoading, error, refetch, isRefetching } = useQuery<ImpactDashboard>({
    queryKey: [DASHBOARD_KEY],
    queryFn: () => mobileApi.fetchImpactDashboard(tz),
    staleTime: 5 * 60_000,
  });

  const treeEquivalent = data ? (data.totalCo2SavedKg / 21).toFixed(1) : '0';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Your Impact</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={brandColors.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load dashboard</Text>
          <Button variant="secondary" size="md" onPress={() => void refetch()}>
            Retry
          </Button>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space[6] }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={brandColors.accent}
              colors={[brandColors.accent]}
            />
          }
        >
          {/* 0. Time Bank — Microlives */}
          {data ? (
            <View style={styles.card}>
              <Text style={styles.cardHeader}>Time Bank</Text>
              <View style={styles.counterBlock}>
                <AnimatedCounter
                  targetValue={data.totalMicrolives}
                  suffix=" ML"
                  decimals={1}
                  duration={1500}
                  style={{ ...textDataLg, fontFamily: fontFamily.mono.bold, color: '#F2C30F' }}
                />
                <Text style={styles.counterLabel}>
                  +{formatMicrolivesAsTime(data.totalMicrolives)} of life earned
                </Text>
              </View>
              <View style={styles.counterBlock}>
                  <AnimatedCounter
                    targetValue={data.totalCommunitySeconds}
                    suffix=" sec"
                    decimals={0}
                    duration={1500}
                    style={{ ...textDataLg, fontFamily: fontFamily.mono.bold, color: '#60A5FA' }}
                  />
                  <Text style={styles.counterLabel}>
                    {formatCommunitySeconds(data.totalCommunitySeconds)} donated to your city
                  </Text>
                </View>
            </View>
          ) : null}

          {/* 1. Streak */}
          <StreakCard streakState={data.streak} />

          {/* 1.5 Recent Badges */}
          <RecentBadgesSection />

          {/* 2. Big counters */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Lifetime impact</Text>

            <View style={styles.counterBlock}>
              <AnimatedCounter
                targetValue={data.totalCo2SavedKg}
                suffix=" kg"
                decimals={1}
                duration={1500}
                style={{ ...textDataLg, fontFamily: fontFamily.mono.bold, color: safetyColors.safe }}
              />
              <Text style={styles.counterLabel}>CO2 saved</Text>
              <Text style={styles.counterSubtext}>
                Like {treeEquivalent} trees absorbing CO2 for a year
              </Text>
            </View>

            <View style={styles.counterBlock}>
              <AnimatedCounter
                targetValue={data.totalMoneySavedEur}
                prefix="EUR "
                decimals={0}
                duration={1500}
                style={{ ...textDataLg, fontFamily: fontFamily.mono.bold, color: brandColors.accent }}
              />
              <Text style={styles.counterLabel}>Money saved</Text>
            </View>

            <View style={styles.counterBlock}>
              <AnimatedCounter
                targetValue={data.totalRidersProtected}
                decimals={0}
                duration={1500}
                style={{ ...textDataLg, fontFamily: fontFamily.mono.bold, color: safetyColors.info }}
              />
              <Text style={styles.counterLabel}>Riders protected</Text>
              <Text style={styles.counterSubtext}>
                Cyclists kept safe by your reports
              </Text>
            </View>
          </View>

          {/* 3. This Week */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>This week</Text>
            <View style={styles.weekGrid}>
              <StatTile
                value={String(data.thisWeek.rides)}
                unit="rides"
                label="Completed"
              />
              <StatTile
                value={data.thisWeek.co2SavedKg.toFixed(1)}
                unit="kg"
                label="CO2 saved"
              />
              <StatTile
                value={data.thisWeek.moneySavedEur.toFixed(0)}
                unit="EUR"
                label="Saved"
              />
              <StatTile
                value={String(data.thisWeek.hazardsReported)}
                unit=""
                label="Hazards reported"
              />
            </View>
          </View>

          {/* 5. Daily Quiz */}
          <Pressable
            style={({ pressed }) => [styles.quizCard, pressed && styles.quizCardPressed]}
            onPress={() => router.push('/daily-quiz')}
            accessibilityRole="button"
            accessibilityLabel="Take today's daily quiz"
          >
            <View style={styles.quizIconWrap}>
              <Ionicons name="school-outline" size={24} color={brandColors.accent} />
            </View>
            <View style={styles.quizTextCol}>
              <Text style={styles.quizTitle}>Daily Safety Quiz</Text>
              <Text style={styles.quizSubtext}>Answer to maintain your streak</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={darkTheme.textMuted} />
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    letterSpacing: -0.5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    paddingHorizontal: space[5],
  },
  errorText: {
    ...textBase,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: space[5],
    gap: space[4],
    paddingTop: space[2],
  },
  // Cards
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[5],
    gap: space[4],
    ...shadows.md,
  },
  cardHeader: {
    ...textSm,
    fontFamily: fontFamily.heading.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  // Counters
  counterBlock: {
    alignItems: 'center',
    gap: 4,
  },
  counterLabel: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  counterSubtext: {
    ...textXs,
    color: darkTheme.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // This week grid
  weekGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  statTile: {
    flex: 1,
    minWidth: '45%' as unknown as number,
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: 2,
  },
  statTileValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statTileValue: {
    ...textDataMd,
    fontFamily: fontFamily.mono.bold,
    color: darkTheme.textPrimary,
  },
  statTileUnit: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    color: darkTheme.textMuted,
  },
  statTileLabel: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textSecondary,
  },
  // Recent badges
  recentBadgesRow: {
    flexDirection: 'row',
    gap: space[3],
    paddingVertical: space[1],
  },
  recentBadgeItem: {
    alignItems: 'center',
    width: 80,
    gap: 4,
  },
  recentBadgeName: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textPrimary,
    textAlign: 'center',
  },
  viewAllBadgesLink: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.accent,
    textAlign: 'right',
  },
  // Quiz card
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[4],
    ...shadows.md,
  },
  quizCardPressed: {
    backgroundColor: darkTheme.bgSecondary,
    borderColor: brandColors.accent,
  },
  quizIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizTextCol: {
    flex: 1,
    gap: 2,
  },
  quizTitle: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textPrimary,
    fontSize: 15,
  },
  quizSubtext: {
    ...textXs,
    color: darkTheme.textMuted,
  },
});
