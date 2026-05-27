/**
 * Design System — CategoryTabBar Organism
 *
 * Horizontal scrollable filter tabs for trophy case badge categories.
 * 9 tabs: All + 8 merged categories.
 *
 * Motion: each pill cross-fades its background and text color from the
 * resting tone to its category accent on selection (150ms ease-out).
 * Reduced motion snaps to the final colors. Pills also use PressableScale
 * for spring-press feedback.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet } from 'react-native';

import { useT } from '../../hooks/useTranslation';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PressableScale } from '../atoms/PressableScale';
import { categoryColors, type BadgeCategory } from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { duration, easing } from '../tokens/motion';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

export interface CategoryTabBarProps {
  selected: BadgeCategory | 'all';
  onSelect: (category: BadgeCategory | 'all') => void;
  counts: Record<BadgeCategory | 'all', { earned: number; total: number }>;
}

const TAB_KEYS: ReadonlyArray<BadgeCategory | 'all'> = [
  'all',
  'firsts',
  'riding',
  'consistency',
  'impact',
  'safety',
  'community',
  'explore',
  'events',
];

const TAB_LABEL_KEY: Record<BadgeCategory | 'all', string> = {
  all: 'achievements.tabAll',
  firsts: 'achievements.tabFirsts',
  riding: 'achievements.tabRiding',
  consistency: 'achievements.tabConsistency',
  impact: 'achievements.tabImpact',
  safety: 'achievements.tabSafety',
  community: 'achievements.tabCommunity',
  explore: 'achievements.tabExplore',
  events: 'achievements.tabEvents',
};

// Add ~20% alpha hex suffix to category color for the active pill background
const ACTIVE_BG_ALPHA = '33';

interface PillProps {
  label: string;
  catColor: string;
  isSelected: boolean;
  earned?: number;
  total?: number;
  onPress: () => void;
}

const Pill: React.FC<PillProps> = ({
  label,
  catColor,
  isSelected,
  earned,
  total,
  onPress,
}) => {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(isSelected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isSelected ? 1 : 0,
      duration: reduced ? 0 : duration.fast,
      easing: easing.default,
      useNativeDriver: false, // bg/text color interpolation
    }).start();
  }, [isSelected, reduced, progress]);

  const animatedBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [brandColors.bgSecondary, `${catColor}${ACTIVE_BG_ALPHA}`],
  });
  const animatedTextColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [brandColors.textSecondary, catColor],
  });

  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress="confirm"
      style={styles.pillWrapper}
      pressedScale={0.94}
    >
      <Animated.View style={[styles.tab, { backgroundColor: animatedBg }]}>
        <Animated.Text style={[styles.tabText, { color: animatedTextColor }]}>
          {label}
        </Animated.Text>
        {earned !== undefined && total !== undefined ? (
          <Animated.Text style={[styles.tabCount, { color: animatedTextColor }]}>
            {earned}/{total}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </PressableScale>
  );
};

export const CategoryTabBar: React.FC<CategoryTabBarProps> = ({
  selected,
  onSelect,
  counts,
}) => {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {TAB_KEYS.map((tabKey) => {
        const catColor =
          tabKey === 'all' ? brandColors.accent : categoryColors[tabKey];
        const count = counts[tabKey];

        return (
          <Pill
            key={tabKey}
            label={t(TAB_LABEL_KEY[tabKey])}
            catColor={catColor}
            isSelected={selected === tabKey}
            earned={count?.earned}
            total={count?.total}
            onPress={() => onSelect(tabKey)}
          />
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[2],
  },
  pillWrapper: {
    // PressableScale style — keep bare so the inner Animated.View carries the bg.
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    height: 32,
    paddingHorizontal: space[3],
    borderRadius: radii.full,
  },
  tabText: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
  },
  tabCount: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
  },
});
