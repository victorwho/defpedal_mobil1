import type { ImpactDashboard, TripHistoryItem } from '@defensivepedal/core';
import { formatCo2Saved } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { StatsDashboard } from '../src/components/StatsDashboard';
import { BrandLogo } from '../src/components/BrandLogo';
import { TripCard } from '../src/design-system/organisms/TripCard';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { useTheme, type ThemeColors } from '../src/design-system';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, text3xl, textBase, textSm, textXs, textXl } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useT } from '../src/hooks/useTranslation';

// ---------------------------------------------------------------------------
// Compact stat item
// ---------------------------------------------------------------------------

type CompactStatProps = {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly iconColor: string;
  readonly value: string;
  readonly label: string;
  readonly colors: ThemeColors;
};

function CompactStat({ icon, iconColor, value, label, colors }: CompactStatProps) {
  return (
    <View style={compactStatStyles.wrapper}>
      <Ionicons name={icon} size={14} color={iconColor} />
      <Text
        style={[compactStatStyles.value, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={[compactStatStyles.label, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const compactStatStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontFamily: fontFamily.heading.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  label: {
    ...textXs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const { user } = useAuthSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => mobileApi.getUserStats(),
    enabled: Boolean(user),
    staleTime: 120_000,
  });

  const { data: dashboard } = useQuery<ImpactDashboard>({
    queryKey: ['impact-dashboard'],
    queryFn: () => mobileApi.fetchImpactDashboard(tz),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });

  const { data: trips, isLoading: tripsLoading, error: tripsError } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const handleToggle = useCallback((tripId: string) => {
    setExpandedId((prev) => (prev === tripId ? null : tripId));
  }, []);

  const renderTripItem = useCallback(
    ({ item, index }: { item: TripHistoryItem; index: number }) => (
      <FadeSlideIn delay={Math.min(index * 50, 300)}>
        <TripCard
          trip={item}
          expanded={expandedId === item.id}
          onToggle={() => handleToggle(item.id)}
        />
      </FadeSlideIn>
    ),
    [expandedId, handleToggle],
  );

  // ── Derived stat values ──
  const totalRides = stats?.totalTrips ?? 0;
  const totalKm = stats ? (stats.totalDistanceMeters / 1000).toFixed(0) : '0';
  const currentStreak = dashboard?.streak.currentStreak ?? 0;
  const co2Display = stats ? formatCo2Saved(stats.totalCo2SavedKg) : '0 g';

  // ── List header: screen header + compact stats + trip section title ──
  const listHeader = useMemo(
    () => (
      <View style={styles.listHeaderContainer}>
        {/* Screen header (brand logo + title) */}
        <View style={styles.headerShell}>
          <View style={styles.brandRow}>
            <BrandLogo />
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{t('history.title')}</Text>
              <Text style={styles.subtitle}>{t('history.subtitle')}</Text>
            </View>
          </View>
        </View>

        {/* Compact stats row */}
        {user ? (
          <View style={styles.compactStatsCard}>
            {statsLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <View style={styles.compactStatsRow}>
                <CompactStat
                  icon="bicycle-outline"
                  iconColor={colors.accent}
                  value={String(totalRides)}
                  label={t('history.rides')}
                  colors={colors}
                />
                <CompactStat
                  icon="speedometer-outline"
                  iconColor={colors.info}
                  value={`${totalKm}`}
                  label={t('history.km')}
                  colors={colors}
                />
                <CompactStat
                  icon="flame-outline"
                  iconColor={colors.caution}
                  value={String(currentStreak)}
                  label={t('history.streak')}
                  colors={colors}
                />
                <CompactStat
                  icon="leaf-outline"
                  iconColor={colors.safe}
                  value={co2Display}
                  label={t('history.co2')}
                  colors={colors}
                />
              </View>
            )}
          </View>
        ) : null}

        {/* Trip list section title */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{t('history.allTrips')}</Text>
          {(trips?.length ?? 0) > 0 ? (
            <Pressable onPress={() => router.push('/trips')}>
              <Text style={styles.seeAllLink}>{t('history.seeAll')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    ),
    [
      styles, user, statsLoading, colors, totalRides, totalKm,
      currentStreak, co2Display, trips, t,
    ],
  );

  // ── List footer: quiz card + stats dashboard ──
  const listFooter = useMemo(
    () => (
      <View style={styles.listFooterContainer}>
        {/* Daily Safety Quiz */}
        {user ? (
          <Pressable
            style={styles.quizCard}
            onPress={() => router.push('/daily-quiz')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={t('history.dailyQuiz')}
          >
            <View style={styles.quizCardLeft}>
              <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
              <View>
                <Text style={styles.quizCardTitle}>{t('history.dailyQuiz')}</Text>
                <Text style={styles.quizCardSubtitle}>{t('history.dailyQuizSub')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Stats Dashboard (moved below trips) */}
        {user ? (
          <StatsDashboard hazardsReported={dashboard?.totalHazardsReported ?? 0} />
        ) : null}
      </View>
    ),
    [styles, user, colors, dashboard, t],
  );

  // ── Empty / loading / error states for trip list ──
  const listEmpty = useMemo(() => {
    if (tripsLoading) {
      return (
        <View style={styles.emptyCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.emptyText}>{t('history.loadingTrips')}</Text>
        </View>
      );
    }
    if (tripsError) {
      return (
        <View style={styles.emptyCenter}>
          <Text style={styles.errorText}>{t('history.loadTripsFailed')}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyCenter}>
        <Ionicons name="bicycle-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>{t('history.noRidesYet')}</Text>
        <Text style={styles.emptyText}>{t('history.noRidesSub')}</Text>
      </View>
    );
  }, [tripsLoading, tripsError, styles, colors, t]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={trips ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderTripItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={styles.flatListContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
      <BottomNav activeTab="history" onTabPress={handleTabPress} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed style factory
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    safeArea: { flex: 1 },

    flatListContent: {
      paddingHorizontal: space[5],
      paddingTop: space[3] + space[0.5],
      paddingBottom: space[10] + space[1],
    },

    // ── List header ──
    listHeaderContainer: {
      gap: space[4],
      paddingBottom: space[3],
    },
    headerShell: {
      borderRadius: radii['2xl'] + space[1],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: 'rgba(17, 24, 39, 0.86)',
      padding: space[4] + space[0.5],
      overflow: 'hidden',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[3] + space[0.5],
    },
    titleWrap: {
      flex: 1,
      gap: space[1] + space[0.5],
    },
    title: {
      ...text3xl,
      fontFamily: fontFamily.heading.extraBold,
      fontSize: 32,
      color: colors.textPrimary,
      letterSpacing: -0.8,
    },
    subtitle: {
      ...textBase,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },

    // ── Compact stats card ──
    compactStatsCard: {
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      paddingVertical: space[3],
      paddingHorizontal: space[2],
    },
    compactStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },

    // ── Section title row ──
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      ...textXl,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    seeAllLink: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },

    // ── Trip list ──
    separator: {
      height: space[3],
    },

    // ── Empty / loading states ──
    emptyCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[10],
      paddingHorizontal: space[8],
      gap: space[2],
    },
    emptyTitle: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
    },
    emptyText: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      ...textBase,
      color: colors.danger,
      textAlign: 'center',
    },

    // ── List footer ──
    listFooterContainer: {
      gap: space[4],
      paddingTop: space[4],
    },

    // ── Quiz card ──
    quizCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      ...shadows.md,
    },
    quizCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    quizCardTitle: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    quizCardSubtitle: {
      ...textXs,
      color: colors.textSecondary,
    },
  });
