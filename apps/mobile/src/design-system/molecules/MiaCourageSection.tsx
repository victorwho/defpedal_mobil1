/**
 * Design System — MiaCourageSection Molecule
 *
 * Post-ride "Your Courage" section showing moderate segments handled
 * and journey level progress for the Mia persona.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SectionTitle } from '../atoms/SectionTitle';
import { BadgeProgressBar } from '../atoms/BadgeProgressBar';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { usePersonaT } from '../../hooks/usePersonaT';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaCourageSectionProps {
  readonly moderateSegmentsHandled: number;
  readonly moderateSegmentsTotal: number;
  readonly ridesCompleted: number;
  readonly ridesNeeded: number;
  readonly currentLevel: number;
  readonly nextLevelName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiaCourageSection: React.FC<MiaCourageSectionProps> = ({
  moderateSegmentsHandled,
  moderateSegmentsTotal,
  ridesCompleted,
  ridesNeeded,
  currentLevel,
  nextLevelName,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = usePersonaT();

  const allHandled = moderateSegmentsTotal > 0 && moderateSegmentsHandled >= moderateSegmentsTotal;

  const segmentsLabel = allHandled
    ? t('postRide.segmentsHandledAll')
    : t('postRide.segmentsHandled', {
        handled: moderateSegmentsHandled,
        total: moderateSegmentsTotal,
      });

  const progressLabel = t('postRide.levelProgress', {
    rides: ridesCompleted,
    needed: ridesNeeded,
    level: currentLevel + 1,
  });

  return (
    <View style={styles.container}>
      <SectionTitle variant="muted">
        {t('postRide.courageTitle')}
      </SectionTitle>

      {/* Segments handled */}
      {moderateSegmentsTotal > 0 ? (
        <View style={styles.segmentRow}>
          <View style={[styles.iconCircle, allHandled ? styles.iconCircleSuccess : styles.iconCircleCaution]}>
            <Ionicons
              name={allHandled ? 'checkmark-circle' : 'shield-checkmark'}
              size={20}
              color={allHandled ? colors.safe : colors.caution}
            />
          </View>
          <Text style={styles.segmentText}>{segmentsLabel}</Text>
        </View>
      ) : null}

      {/* Level progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{progressLabel}</Text>
          <Text style={styles.nextLevelHint}>{nextLevelName}</Text>
        </View>
        <BadgeProgressBar
          current={ridesCompleted}
          target={ridesNeeded}
          tierColor={colors.safe}
          height={6}
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: space[3],
    },
    segmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleSuccess: {
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
    },
    iconCircleCaution: {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    segmentText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
      flex: 1,
    },
    progressSection: {
      gap: space[2],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressLabel: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
    nextLevelHint: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.safe,
    },
  });
