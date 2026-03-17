import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

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
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 18,
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 5,
  },
  cardAccent: {
    borderColor: mobileTheme.colors.borderStrong,
    backgroundColor: mobileTheme.colors.surfaceAccent,
  },
  cardWarning: {
    borderColor: 'rgba(234, 179, 8, 0.35)',
    backgroundColor: mobileTheme.colors.surfaceWarning,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: mobileTheme.colors.textMuted,
  },
  titleAccent: {
    color: mobileTheme.colors.brand,
  },
  titleWarning: {
    color: mobileTheme.colors.textWarning,
  },
  body: {
    gap: 8,
  },
});
