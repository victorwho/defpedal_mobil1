/**
 * Design System — NewRidersCard Molecule
 *
 * Aggregate "N new riders joined this week" card for the community feed
 * (feed densification, 2026-07-19). Deliberately lighter than trip cards —
 * no map, no reactions, no user header — so ride shares stay the hero
 * content. The count comes from real profile rows (server-side
 * get_new_rider_count); the card is only rendered when count >= 1, and the
 * copy follows the feed's resolved ladder scope so the label stays honest.
 * Aggregate-only by design: no names, no avatars, no locations.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CommunityScope } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

export interface NewRidersCardProps {
  readonly count: number;
  readonly scope: CommunityScope;
}

export const NewRidersCard = ({ count, scope }: NewRidersCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  if (count < 1) return null;

  const label = t(
    `communityScreen.newRiders_${scope}_${count === 1 ? 'one' : 'other'}`,
    { count },
  );

  return (
    <View style={styles.card} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.iconCircle}>
        <Ionicons name="person-add-outline" size={16} color={colors.accent} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      borderRadius: radii.xl,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bgTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...textSm,
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fontFamily.body.medium,
      lineHeight: 20,
    },
  });
