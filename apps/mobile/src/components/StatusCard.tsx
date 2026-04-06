import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { shadows } from '../design-system/tokens/shadows';

type StatusCardProps = PropsWithChildren<{
  title: string;
  tone?: 'default' | 'accent' | 'warning';
}>;

export const StatusCard = ({
  title,
  tone = 'default',
  children,
}: StatusCardProps) => (
  <View
    style={[
      styles.card,
      tone === 'accent' ? styles.cardAccent : null,
      tone === 'warning' ? styles.cardWarning : null,
    ]}
  >
    <Text
      style={[
        styles.title,
        tone === 'accent' ? styles.titleAccent : null,
        tone === 'warning' ? styles.titleWarning : null,
      ]}
    >
      {title}
    </Text>
    <View style={styles.body}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 18,
    gap: 10,
    ...shadows.lg,
  },
  cardAccent: {
    borderColor: brandColors.borderStrong,
    backgroundColor: brandColors.textInverse,
  },
  cardWarning: {
    borderColor: 'rgba(234, 179, 8, 0.35)',
    backgroundColor: safetyColors.cautionTint,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: brandColors.textMuted,
  },
  titleAccent: {
    color: brandColors.accent,
  },
  titleWarning: {
    color: safetyColors.cautionText,
  },
  body: {
    gap: 8,
  },
});
