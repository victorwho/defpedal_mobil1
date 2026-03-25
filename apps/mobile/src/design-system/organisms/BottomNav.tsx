/**
 * Design System v1.0 — BottomNav Organism
 *
 * 4 tabs: Map, History, Community, Profile.
 * Accent active state. Hides during navigation (controlled by parent).
 * 64px height (layout.bottomNavHeight), safe area aware.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../ThemeContext';
import { space, layout } from '../tokens/spacing';
import { fontFamily, text2xs } from '../tokens/typography';
import { gray } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabKey = 'map' | 'history' | 'community' | 'profile';

export interface BottomNavProps {
  activeTab: TabKey;
  onTabPress: (tab: TabKey) => void;
  /** Hides the nav bar (e.g. during active navigation) */
  hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

interface TabConfig {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabConfig[] = [
  { key: 'map', label: 'Map', icon: 'map-outline', iconActive: 'map' },
  { key: 'history', label: 'History', icon: 'time-outline', iconActive: 'time' },
  { key: 'community', label: 'Community', icon: 'people-outline', iconActive: 'people' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabPress,
  hidden = false,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (hidden) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bgPrimary,
          borderTopColor: colors.borderDefault,
          paddingBottom: insets.bottom + (Platform.OS === 'android' ? 12 : space[2]),
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = tab.key === activeTab;
        const iconColor = active ? colors.accent : gray[400];
        const labelColor = active ? colors.accent : gray[400];

        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={active ? tab.iconActive : tab.icon}
              size={24}
              color={iconColor}
            />
            <Text
              style={[
                styles.label,
                {
                  color: labelColor,
                  fontFamily: active
                    ? fontFamily.body.bold
                    : fontFamily.body.medium,
                },
              ]}
            >
              {tab.label}
            </Text>
            {active ? (
              <View
                style={[styles.indicator, { backgroundColor: colors.accent }]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: layout.bottomNavHeight,
    paddingTop: space[2],
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 2,
    borderRadius: 1,
  },
});
