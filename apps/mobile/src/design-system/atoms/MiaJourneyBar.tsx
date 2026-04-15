/**
 * Design System — MiaJourneyBar Atom
 *
 * Horizontal progress bar showing current Mia journey level and ride progress.
 * Rendered at the top of route-planning when persona is 'mia' and journey is active.
 *
 * Layout: level name (left) | progress dots (center) | info icon (right)
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { MiaJourneyLevel } from '@defensivepedal/core';

import { FadeSlideIn } from './FadeSlideIn';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textSm, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaJourneyBarProps {
  readonly level: MiaJourneyLevel;
  readonly levelName: string;
  readonly ridesCompleted: number;
  readonly ridesNeeded: number;
  readonly onInfoPress: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiaJourneyBar: React.FC<MiaJourneyBarProps> = ({
  level,
  levelName,
  ridesCompleted,
  ridesNeeded,
  onInfoPress,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  const dots = useMemo(() => {
    const items: boolean[] = [];
    for (let i = 0; i < ridesNeeded; i++) {
      items.push(i < ridesCompleted);
    }
    return items;
  }, [ridesCompleted, ridesNeeded]);

  return (
    <FadeSlideIn translateY={-10}>
      <View
        style={styles.container}
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: ridesNeeded,
          now: ridesCompleted,
          text: `Level ${level}: ${levelName}. ${ridesCompleted} of ${ridesNeeded} rides completed.`,
        }}
      >
        <View style={styles.labelColumn}>
          <Text style={styles.levelLabel} numberOfLines={1}>
            Lv{level}
          </Text>
          <Text style={styles.levelName} numberOfLines={1}>
            {levelName}
          </Text>
        </View>

        <View style={styles.dotsContainer}>
          {dots.map((filled, index) => (
            <View
              key={index}
              style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]}
            />
          ))}
        </View>

        <Pressable
          onPress={onInfoPress}
          accessibilityLabel="Journey information"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.infoButton}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </FadeSlideIn>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgPrimary,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.xl,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      gap: space[3],
    },
    labelColumn: {
      gap: 2,
      minWidth: 56,
    },
    levelLabel: {
      ...textXs,
      fontFamily: fontFamily.heading.bold,
      color: colors.safe,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    levelName: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    dotsContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[1] + 2,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dotFilled: {
      backgroundColor: colors.safe,
    },
    dotEmpty: {
      backgroundColor: colors.bgTertiary,
    },
    infoButton: {
      padding: space[1],
    },
  });
