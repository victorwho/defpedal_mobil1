/**
 * SesizareRow — "send this to the city hall" CTA for a single hazard.
 *
 * Shared by the hazard detail sheet and the post-ride card, so the eligibility
 * rules live in exactly one place.
 *
 * Renders NOTHING when the hazard can't become a sesizare — ineligible type,
 * outside Romania, kill switch off, or this rider already escalated it. That
 * is deliberate: a disabled row explaining "no authority handles aggressive
 * traffic" is a permanently dead control on hazard types riders report often.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Coordinate, HazardType } from '@defensivepedal/core';

import { useSesizare } from '../../hooks/useSesizare';
import { useSesizareAvailability } from '../../hooks/useSesizareAvailability';
import { useT } from '../../hooks/useTranslation';
import { PressableScale } from '../atoms/PressableScale';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textXs } from '../tokens/typography';

export interface SesizareRowProps {
  hazardType: HazardType;
  coordinate: Coordinate;
  /** Server hazard id when known — absent while the report is still queued. */
  hazardId?: string;
  /** When the rider observed it. Defaults to now. */
  observedAt?: string;
  /** Escalations by other riders, from GET /v1/hazards/nearby. */
  sesizareCount?: number;
  /** True when this rider already escalated it — the row hides itself. */
  sesizareByMe?: boolean;
  surface: 'hazard_detail' | 'post_ride';
}

export const SesizareRow: React.FC<SesizareRowProps> = ({
  hazardType,
  coordinate,
  hazardId,
  observedAt,
  sesizareCount = 0,
  sesizareByMe = false,
  surface,
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const { eligible, address } = useSesizareAvailability(hazardType, coordinate, hazardId);
  const { startSesizare, isStarting } = useSesizare();

  if (!eligible || !address || sesizareByMe) return null;

  // Only count OTHER riders — this rider's own escalation hides the row.
  const othersLabel =
    sesizareCount > 0
      ? t(sesizareCount === 1 ? 'sesizare.othersEscalated_one' : 'sesizare.othersEscalated_other', {
          count: sesizareCount,
        })
      : null;

  return (
    <PressableScale
      style={styles.row}
      disabled={isStarting}
      hapticOnPress="confirm"
      accessibilityRole="button"
      accessibilityLabel={t('sesizare.cta')}
      accessibilityHint={t('sesizare.subtitle')}
      onPress={() => {
        void startSesizare({
          hazardType,
          coordinate,
          address,
          hazardId,
          observedAt,
          surface,
        });
      }}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={'document-text-outline' as never} size={20} color={colors.accent} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('sesizare.cta')}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {othersLabel ?? t('sesizare.subtitle')}
        </Text>
      </View>
      <Ionicons name={'chevron-forward' as never} size={18} color={colors.textSecondary} />
    </PressableScale>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      borderRadius: radii.md,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    subtitle: {
      ...textXs,
      color: colors.textSecondary,
    },
  });
