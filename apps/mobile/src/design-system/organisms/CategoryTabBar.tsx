/**
 * Design System — CategoryTabBar Organism
 *
 * Horizontal scrollable filter tabs for trophy case badge categories.
 * 9 tabs: All + 8 merged categories.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';

import { categoryColors, type BadgeCategory } from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

export interface CategoryTabBarProps {
  selected: BadgeCategory | 'all';
  onSelect: (category: BadgeCategory | 'all') => void;
  counts: Record<BadgeCategory | 'all', { earned: number; total: number }>;
}

const TABS: ReadonlyArray<{ key: BadgeCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'firsts', label: 'Firsts' },
  { key: 'riding', label: 'Riding' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'impact', label: 'Impact' },
  { key: 'safety', label: 'Safety' },
  { key: 'community', label: 'Community' },
  { key: 'explore', label: 'Explore' },
  { key: 'events', label: 'Events' },
];

export const CategoryTabBar: React.FC<CategoryTabBarProps> = ({
  selected,
  onSelect,
  counts,
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.scrollContent}
  >
    {TABS.map((tab) => {
      const isSelected = selected === tab.key;
      const catColor =
        tab.key === 'all' ? brandColors.accent : categoryColors[tab.key];
      const count = counts[tab.key];

      return (
        <Pressable
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={[
            styles.tab,
            isSelected && { backgroundColor: `${catColor}33` },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              isSelected && { color: catColor },
            ]}
          >
            {tab.label}
          </Text>
          {count ? (
            <Text
              style={[
                styles.tabCount,
                isSelected && { color: catColor },
              ]}
            >
              {count.earned}/{count.total}
            </Text>
          ) : null}
        </Pressable>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[2],
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    height: 32,
    paddingHorizontal: space[3],
    borderRadius: radii.full,
    backgroundColor: brandColors.bgSecondary,
  },
  tabText: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textSecondary,
  },
  tabCount: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    color: brandColors.textSecondary,
  },
});
