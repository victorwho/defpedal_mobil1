/**
 * Design System v1.0 — RideLossBanner Molecule
 *
 * Elevated danger-accented banner surfaced when a trip-critical mutation has
 * died in the offline queue (review 2026-06-12 P2 "dead-letter ride-loss
 * banner"). Before this, a dead `trip_start` cascade-killed the whole ride's
 * server record and the only retry path was the dev Diagnostics screen.
 *
 * Offers two actions: Retry (re-queues every dead mutation via
 * `retryDeadMutations()`) and Dismiss (hides for the session). Positioning and
 * dismissal state are owned by `RideLossBannerManager` in `app/_layout.tsx`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../ThemeContext';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { Button } from '../atoms/Button';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, textSm, textXs } from '../tokens/typography';

export interface RideLossBannerProps {
  title: string;
  body: string;
  retryLabel: string;
  dismissLabel: string;
  /** Combined accessibility label read by screen readers. */
  a11yLabel: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export const RideLossBanner: React.FC<RideLossBannerProps> = ({
  title,
  body,
  retryLabel,
  dismissLabel,
  a11yLabel,
  onRetry,
  onDismiss,
}) => {
  const { colors } = useTheme();

  return (
    <FadeSlideIn translateY={-10}>
      <View
        style={[
          styles.container,
          shadows.md,
          { backgroundColor: colors.bgPrimary, borderColor: colors.danger },
        ]}
        accessibilityRole="alert"
        accessibilityLabel={a11yLabel}
      >
        <View style={styles.headerRow}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
        <View style={styles.actions}>
          <Button variant="ghost" size="sm" onPress={onDismiss} accessibilityLabel={dismissLabel}>
            {dismissLabel}
          </Button>
          <Button variant="primary" size="sm" onPress={onRetry} accessibilityLabel={retryLabel}>
            {retryLabel}
          </Button>
        </View>
      </View>
    </FadeSlideIn>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    ...textSm,
    flex: 1,
    fontFamily: fontFamily.body.semiBold,
  },
  body: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space[2],
    marginTop: space[1],
  },
});
