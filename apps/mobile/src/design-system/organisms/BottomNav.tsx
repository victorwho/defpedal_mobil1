/**
 * Design System v1.0 — BottomNav Organism
 *
 * 4 tabs: Map, History, Community, Profile.
 * Accent active state. Hides during navigation (controlled by parent).
 * 64px height (layout.bottomNavHeight), safe area aware.
 *
 * Motion:
 *   - Single sliding accent indicator at the top of the container
 *     translates between tab centers (spring, stiff preset).
 *   - Active icon does a one-shot scale pop on inactive→active transition.
 *   - Reduced motion: indicator snaps to position; icon pop suppressed.
 */
import React, { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../ThemeContext';
import { space, layout } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { gray } from '../tokens/colors';
import { springs } from '../tokens/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../../hooks/useTranslation';

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

interface TabConfig {
  key: TabKey;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabConfig[] = [
  { key: 'map', labelKey: 'tabs.map', icon: 'map-outline', iconActive: 'map' },
  { key: 'history', labelKey: 'tabs.history', icon: 'time-outline', iconActive: 'time' },
  { key: 'community', labelKey: 'tabs.community', icon: 'people-outline', iconActive: 'people' },
  { key: 'profile', labelKey: 'tabs.profile', icon: 'person-outline', iconActive: 'person' },
];

const INDICATOR_WIDTH = 24;
const ICON_SIZE = 24;

// ---------------------------------------------------------------------------
// TabIcon — encapsulates the per-tab scale-pop animation
// ---------------------------------------------------------------------------

interface TabIconProps {
  iconInactive: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  active: boolean;
  color: string;
}

const TabIcon: React.FC<TabIconProps> = ({ iconInactive, iconActive, active, color }) => {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const wasActiveRef = useRef(active);

  useEffect(() => {
    // Pop only on inactive → active transition. Skip on first render and
    // active → inactive (the deactivating tab shouldn't draw attention).
    if (!wasActiveRef.current && active && !reduced) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.18,
          tension: 280,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          ...springs.snappy,
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasActiveRef.current = active;
  }, [active, reduced, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={active ? iconActive : iconInactive} size={ICON_SIZE} color={color} />
    </Animated.View>
  );
};

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
  const reduced = useReducedMotion();
  const t = useT();

  const [tabWidth, setTabWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);

  useEffect(() => {
    if (tabWidth === 0 || activeIndex < 0) return;
    const target = tabWidth * activeIndex + (tabWidth - INDICATOR_WIDTH) / 2;
    if (reduced) {
      indicatorX.setValue(target);
      return;
    }
    Animated.spring(indicatorX, {
      toValue: target,
      ...springs.stiff,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, tabWidth, reduced, indicatorX]);

  if (hidden) return null;

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width / TABS.length;
    if (Math.abs(next - tabWidth) > 0.5) {
      setTabWidth(next);
    }
  };

  return (
    <View
      onLayout={handleContainerLayout}
      style={[
        styles.container,
        {
          backgroundColor: colors.bgPrimary,
          borderTopColor: colors.borderDefault,
          paddingBottom: insets.bottom + (Platform.OS === 'android' ? 12 : space[2]),
        },
      ]}
    >
      {/* Sliding active indicator — drawn once at container level */}
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              backgroundColor: colors.accent,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
      ) : null}

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
            accessibilityLabel={t(tab.labelKey)}
          >
            <TabIcon
              iconInactive={tab.icon}
              iconActive={tab.iconActive}
              active={active}
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
              {t(tab.labelKey)}
            </Text>
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
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 2,
    borderRadius: 1,
  },
});
