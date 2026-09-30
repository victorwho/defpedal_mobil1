/**
 * PlusSuggestionCard — an inline, dismissible Pedal Plus suggestion.
 *
 * Used for the post-ride E-bike suggestion (docs/plans/pedal-plus-nudges.md
 * N5). Inline and never a modal: it sits under the thank-you on the feedback
 * screen, after the ride is already saved, and the rider can ignore it.
 *
 * Gating is the caller's job via `usePlusNudge` — this component only renders.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlusBadge } from '../atoms/PlusBadge';
import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface PlusSuggestionCardProps {
  icon: IoniconsName;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
  onDismiss: () => void;
}

export const PlusSuggestionCard: React.FC<PlusSuggestionCardProps> = ({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const t = useT();

  return (
    <View
      style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault }]}
    >
      <View style={styles.header}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <PlusBadge size="sm" muted />
        <View style={styles.spacer} />
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('premium.notNow')}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      <Pressable
        onPress={onCta}
        style={styles.cta}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        <Text style={[styles.ctaText, { color: colors.accent }]}>{ctaLabel}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.accent} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: space[3],
    gap: space[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { ...textSm, fontFamily: fontFamily.body.semiBold, flexShrink: 1 },
  spacer: { flex: 1 },
  body: { ...textXs, lineHeight: 18 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    minHeight: 44,
  },
  ctaText: { ...textSm, fontFamily: fontFamily.body.semiBold },
});
