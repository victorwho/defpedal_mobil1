/**
 * Design System — MiaEmptyState Molecule
 *
 * Warm encouragement panel for Mia persona users with zero rides.
 * Shows a bicycle icon, headline, and CTA button.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { Button } from '../atoms/Button';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase } from '../tokens/typography';
import { usePersonaT } from '../../hooks/usePersonaT';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaEmptyStateProps {
  readonly onStartFirstRide: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiaEmptyState: React.FC<MiaEmptyStateProps> = ({ onStartFirstRide }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = usePersonaT();

  return (
    <FadeSlideIn>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="bicycle" size={64} color={colors.accent} />
        </View>

        <Text style={styles.headline}>
          {t('planning.emptyState')}
        </Text>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={onStartFirstRide}
        >
          {t('planning.seeMyRoute')}
        </Button>
      </View>
    </FadeSlideIn>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: colors.bgPrimary,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii['2xl'],
      borderCurve: 'continuous',
      paddingHorizontal: space[5],
      paddingVertical: space[8],
      gap: space[5],
    },
    iconCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.bgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headline: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      paddingHorizontal: space[2],
    },
  });
