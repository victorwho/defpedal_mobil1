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
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.scrollContent}
  >
    {TABS.map((tab) => {
      const catColor =
        tab.key === 'all' ? brandColors.accent : categoryColors[tab.key];
      const count = counts[tab.key];

      return (
        <Pill
          key={tab.key}
          label={tab.label}
          catColor={catColor}
          isSelected={selected === tab.key}
          earned={count?.earned}
          total={count?.total}
          onPress={() => onSelect(tab.key)}
        />
      );
    })}
  </ScrollView>
);

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
