/**
 * Design System — MiaSegmentPreview Molecule
 *
 * "What to Expect" section for route preview, showing moderate risk segments
 * with plain-language descriptions and reassurance text for the Mia persona.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SectionTitle } from '../atoms/SectionTitle';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { usePersonaT } from '../../hooks/usePersonaT';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaSegmentInfo {
  readonly streetName: string;
  readonly hasBikeLane: boolean;
  readonly lengthMeters: number;
}

export interface MiaSegmentPreviewProps {
  readonly segments: readonly MiaSegmentInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatLength = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiaSegmentPreview: React.FC<MiaSegmentPreviewProps> = ({ segments }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = usePersonaT();

  if (segments.length === 0) {
    return (
      <FadeSlideIn delay={100}>
        <View style={styles.container}>
          <SectionTitle variant="muted">
            {t('route.preview.whatToExpect')}
          </SectionTitle>
          <View style={styles.calmRow}>
            <Ionicons name="leaf-outline" size={18} color={colors.safe} />
            <Text style={styles.calmText}>
              {t('route.preview.allCalm')}
            </Text>
          </View>
        </View>
      </FadeSlideIn>
    );
  }

  return (
    <View style={styles.container}>
      <SectionTitle variant="muted">
        {t('route.preview.whatToExpect')}
      </SectionTitle>
      {segments.map((segment, index) => {
        const description = segment.hasBikeLane
          ? t('route.preview.moderateWarning', { street: segment.streetName })
          : t('route.preview.moderateWarningNoBikeLane', { street: segment.streetName });

        return (
          <FadeSlideIn key={`${segment.streetName}-${index}`} delay={100 + index * 80}>
            <View style={styles.segmentRow}>
              <View style={styles.segmentIcon}>
                <Ionicons
                  name={segment.hasBikeLane ? 'bicycle-outline' : 'alert-circle-outline'}
                  size={18}
                  color={colors.caution}
                />
              </View>
              <View style={styles.segmentContent}>
                <View style={styles.segmentHeader}>
                  <Text style={styles.streetName} numberOfLines={1}>
                    {segment.streetName}
                  </Text>
                  <Text style={styles.segmentLength}>
                    {formatLength(segment.lengthMeters)}
                  </Text>
                </View>
                <Text style={styles.segmentDescription}>
                  {description}
                </Text>
              </View>
            </View>
          </FadeSlideIn>
        );
      })}
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
    calmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    calmText: {
      ...textSm,
      color: colors.textPrimary,
      flex: 1,
    },
    segmentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[3],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    segmentIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentContent: {
      flex: 1,
      gap: space[1],
    },
    segmentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    streetName: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
      flex: 1,
    },
    segmentLength: {
      ...textXs,
      color: colors.textMuted,
      marginLeft: space[2],
    },
    segmentDescription: {
      ...textXs,
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });
