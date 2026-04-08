/**
 * Trophy Case Screen — Badge collection grid with category filtering.
 *
 * Sort order:
 *   1. Earned + New (most recently earned first)
 *   2. In Progress (% completion descending)
 *   3. Locked (first 6 per category, rest collapsed)
 *   4. Secret ??? (hidden badges, dashed border)
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  BadgeDefinition,
  BadgeDisplayTab,
  BadgeProgress,
  UserBadge,
} from '@defensivepedal/core';

import { BadgeCard } from '../src/design-system/molecules/BadgeCard';
import { TrophyCaseHeader } from '../src/design-system/organisms/TrophyCaseHeader';
import { CategoryTabBar } from '../src/design-system/organisms/CategoryTabBar';
import { BadgeDetailModal } from '../src/design-system/organisms/BadgeDetailModal';
import { ScreenHeader } from '../src/design-system/atoms/ScreenHeader';
import { type BadgeTier, type BadgeCategory, badgeSpace } from '../src/design-system/tokens/badgeColors';
import { useTheme, type ThemeColors } from '../src/design-system';
import { space, layout } from '../src/design-system/tokens/spacing';
import { fontFamily, textSm } from '../src/design-system/tokens/typography';
import { useBadges } from '../src/hooks/useBadges';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const CELL_WIDTH =
  (SCREEN_WIDTH - 2 * layout.screenHorizontalPadding - 2 * badgeSpace.gridGap) / GRID_COLUMNS;
const LOCKED_COLLAPSE_LIMIT = 6;

const TIER_FROM_LEVEL: Record<number, BadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
};

// ── Helpers ──

type SortedBadge = {
  badge: BadgeDefinition;
  earned: boolean;
  earnedAt?: string;
  earnedTier?: BadgeTier;
  isNew: boolean;
  progress?: BadgeProgress;
  hasHigherTier: boolean;
  section: 'earned' | 'progress' | 'locked' | 'secret';
};

function buildSortedBadges(
  definitions: readonly BadgeDefinition[],
  earnedMap: Map<string, UserBadge>,
  progressMap: Map<string, BadgeProgress>,
): SortedBadge[] {
  // Build a set of tier families that have higher-tier siblings
  const familyMaxTier = new Map<string, number>();
  for (const def of definitions) {
    if (def.tierFamily) {
      const cur = familyMaxTier.get(def.tierFamily) ?? 0;
      if (def.tier > cur) familyMaxTier.set(def.tierFamily, def.tier);
    }
  }

  const items: SortedBadge[] = definitions.map((badge) => {
    const ub = earnedMap.get(badge.badgeKey);
    const earned = ub != null;
    const prog = progressMap.get(badge.badgeKey);
    const isSecret = badge.isHidden && !earned;
    const isInProgress = !earned && !isSecret && prog != null && prog.progress > 0;

    const earnedTier = earned ? TIER_FROM_LEVEL[badge.tier] ?? 'bronze' : undefined;

    // Has higher tier if this badge's family has tiers beyond the current one
    const familyMax = badge.tierFamily ? (familyMaxTier.get(badge.tierFamily) ?? 0) : 0;
    const hasHigherTier = earned && badge.tier > 0 && badge.tier < familyMax;

    const section: SortedBadge['section'] = earned
      ? 'earned'
      : isSecret
        ? 'secret'
        : isInProgress
          ? 'progress'
          : 'locked';

    return {
      badge,
      earned,
      earnedAt: ub?.earnedAt,
      earnedTier,
      isNew: ub?.isNew ?? false,
      progress: prog,
      hasHigherTier,
      section,
    };
  });

  // Sort: earned (newest first) → progress (% desc) → locked → secret
  const sectionOrder: Record<SortedBadge['section'], number> = {
    earned: 0,
    progress: 1,
    locked: 2,
    secret: 3,
  };

  items.sort((a, b) => {
    const sa = sectionOrder[a.section];
    const sb = sectionOrder[b.section];
    if (sa !== sb) return sa - sb;

    if (a.section === 'earned' && b.section === 'earned') {
      // New badges first, then by earned date descending
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '');
    }

    if (a.section === 'progress' && b.section === 'progress') {
      return (b.progress?.progress ?? 0) - (a.progress?.progress ?? 0);
    }

    return a.badge.sortOrder - b.badge.sortOrder;
  });

  return items;
}

// ── Component ──

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { data, isLoading } = useBadges();

  const [selectedTab, setSelectedTab] = useState<BadgeCategory | 'all'>('all');
  const [selectedBadge, setSelectedBadge] = useState<SortedBadge | null>(null);
  const [showAllLocked, setShowAllLocked] = useState(false);

  // Build lookup maps
  const { earnedMap, progressMap } = useMemo(() => {
    const em = new Map<string, UserBadge>();
    const pm = new Map<string, BadgeProgress>();
    if (data) {
      for (const ub of data.earned) em.set(ub.badgeKey, ub);
      for (const bp of data.progress) pm.set(bp.badgeKey, bp);
    }
    return { earnedMap: em, progressMap: pm };
  }, [data]);

  // Build sorted list
  const allSorted = useMemo(
    () => (data ? buildSortedBadges(data.definitions, earnedMap, progressMap) : []),
    [data, earnedMap, progressMap],
  );

  // Filter by category
  const filtered = useMemo(() => {
    if (selectedTab === 'all') return allSorted;
    return allSorted.filter((item) => item.badge.displayTab === selectedTab);
  }, [allSorted, selectedTab]);

  // Collapse locked section
  const displayItems = useMemo(() => {
    if (showAllLocked) return filtered;

    let lockedCount = 0;
    const result: SortedBadge[] = [];
    for (const item of filtered) {
      if (item.section === 'locked') {
        lockedCount++;
        if (lockedCount <= LOCKED_COLLAPSE_LIMIT) {
          result.push(item);
        }
      } else {
        result.push(item);
      }
    }
    return result;
  }, [filtered, showAllLocked]);

  const hiddenLockedCount = useMemo(() => {
    const totalLocked = filtered.filter((i) => i.section === 'locked').length;
    return Math.max(0, totalLocked - LOCKED_COLLAPSE_LIMIT);
  }, [filtered]);

  // Category tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, { earned: number; total: number }> = {
      all: { earned: 0, total: 0 },
    };
    const categories: BadgeDisplayTab[] = [
      'firsts', 'riding', 'consistency', 'impact', 'safety', 'community', 'explore', 'events',
    ];
    for (const cat of categories) counts[cat] = { earned: 0, total: 0 };

    for (const item of allSorted) {
      counts.all.total++;
      counts[item.badge.displayTab].total++;
      if (item.earned) {
        counts.all.earned++;
        counts[item.badge.displayTab].earned++;
      }
    }

    return counts as Record<BadgeCategory | 'all', { earned: number; total: number }>;
  }, [allSorted]);

  // Most recent earned badge for header
  const recentBadge = useMemo(() => {
    const earned = allSorted.find((i) => i.section === 'earned');
    if (!earned) return undefined;
    return {
      badge: earned.badge,
      earnedAt: earned.earnedAt ? new Date(earned.earnedAt) : new Date(),
      tier: earned.earnedTier ?? ('bronze' as BadgeTier),
    };
  }, [allSorted]);

  const handleBadgePress = useCallback((item: SortedBadge) => {
    setSelectedBadge(item);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SortedBadge }) => (
      <View style={{ width: CELL_WIDTH }}>
        <BadgeCard
          badge={item.badge}
          earned={item.earned}
          earnedTier={item.earnedTier}
          progress={item.progress}
          isNew={item.isNew}
          hasHigherTier={item.hasHigherTier}
          onPress={() => handleBadgePress(item)}
        />
      </View>
    ),
    [handleBadgePress],
  );

  const keyExtractor = useCallback(
    (item: SortedBadge) => item.badge.badgeKey,
    [],
  );

  const ListFooter = useMemo(() => {
    if (hiddenLockedCount <= 0 || showAllLocked) return null;
    return (
      <Pressable
        style={styles.showMoreBtn}
        onPress={() => setShowAllLocked(true)}
      >
        <Text style={styles.showMoreText}>
          + {hiddenLockedCount} more to unlock
        </Text>
      </Pressable>
    );
  }, [hiddenLockedCount, showAllLocked]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader variant="back" title="Achievements" />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + space[6] },
          ]}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              <TrophyCaseHeader
                earned={tabCounts.all.earned}
                total={tabCounts.all.total}
                recentBadge={recentBadge}
              />
              <CategoryTabBar
                selected={selectedTab}
                onSelect={(tab) => {
                  setSelectedTab(tab);
                  setShowAllLocked(false);
                }}
                counts={tabCounts}
              />
            </View>
          }
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No badges in this category yet. Keep riding!
              </Text>
            </View>
          }
        />
      )}

      {/* Badge detail modal */}
      {selectedBadge ? (
        <BadgeDetailModal
          badge={selectedBadge.badge}
          earned={selectedBadge.earned}
          earnedAt={selectedBadge.earnedAt}
          earnedTier={selectedBadge.earnedTier}
          progress={selectedBadge.progress}
          onShare={() => {
            // Share card not built yet — placeholder
            setSelectedBadge(null);
          }}
          onClose={() => setSelectedBadge(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSection: {
      gap: space[4],
      marginBottom: space[4],
    },
    listContent: {
      paddingHorizontal: layout.screenHorizontalPadding,
    },
    columnWrapper: {
      gap: badgeSpace.gridGap,
    },
    showMoreBtn: {
      alignItems: 'center',
      paddingVertical: space[4],
      marginTop: space[2],
    },
    showMoreText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: space[10],
    },
    emptyText: {
      ...textSm,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
