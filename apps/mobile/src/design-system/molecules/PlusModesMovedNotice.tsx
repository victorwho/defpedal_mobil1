/**
 * Design System v1.0 — PlusModesMovedNotice Molecule
 *
 * The one-time follow-up to `PlusModesPromoNotice`: shown AFTER the free
 * period to a rider who used E-bike or Cool during it (or who told us they
 * ride an e-bike), naming the mode(s) they lost.
 *
 * Why it exists (docs/plans/pedal-plus-nudges.md N2): when the promotion ends,
 * route planning's heal effect quietly puts an E-bike or Cool rider back on
 * Safe. Without this notice the mode they were using simply stops being theirs
 * one morning, with no word of why or of how to get it back.
 *
 * Tone is deliberately a thank-you plus a way back, not a sale: it says their
 * routes are on Safe, that Safe stays free, and offers Plus as one option next
 * to "Keep riding Safe", which is given equal weight.
 *
 * All gating (shown once, after the promo, not mid-ride, not in onboarding,
 * paywall live, not a subscriber, nudge caps) lives in the manager in
 * `app/_layout.tsx` — this component only renders.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlusRoutingMode } from '../../lib/plus-nudges';
import { useT } from '../../hooks/useTranslation';
import { useTheme } from '../ThemeContext';
import { darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textLg, textSm } from '../tokens/typography';

export interface PlusModesMovedNoticeProps {
  visible: boolean;
  /** Modes to name, E-bike first. Never empty — the manager does not render then. */
  modes: readonly PlusRoutingMode[];
  onSeePlus: () => void;
  onDismiss: () => void;
}

const titleKeyFor = (modes: readonly PlusRoutingMode[]): string => {
  if (modes.includes('ebike') && modes.includes('cool')) return 'plusModes.moved.titleBoth';
  return modes[0] === 'cool' ? 'plusModes.moved.titleCool' : 'plusModes.moved.titleEbike';
};

export const PlusModesMovedNotice: React.FC<PlusModesMovedNoticeProps> = ({
  visible,
  modes,
  onSeePlus,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const t = useT();
  const icon = modes[0] === 'cool' ? 'partly-sunny-outline' : 'battery-charging-outline';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgPrimary, borderColor: colors.borderDefault },
          ]}
        >
          <View style={styles.iconRow}>
            <Ionicons name={icon} size={28} color={colors.accent} />
          </View>

          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {t(titleKeyFor(modes))}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('plusModes.moved.body')}
          </Text>

          <Pressable
            style={styles.cta}
            onPress={onSeePlus}
            accessibilityRole="button"
            accessibilityLabel={t('plusModes.moved.cta')}
          >
            <Text style={styles.ctaText}>{t('plusModes.moved.cta')}</Text>
          </Pressable>

          <Pressable
            style={[styles.secondary, { borderColor: colors.borderDefault }]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('plusModes.moved.dismiss')}
          >
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
              {t('plusModes.moved.dismiss')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // 55% — inside the 40-60% band that keeps foreground content legible.
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    padding: space[5],
    gap: space[3],
  },
  iconRow: { alignItems: 'center' },
  title: {
    ...textLg,
    fontFamily: fontFamily.heading.bold,
    textAlign: 'center',
  },
  body: {
    ...textSm,
    lineHeight: 20,
    textAlign: 'center',
  },
  cta: {
    marginTop: space[2],
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    // Same static pair as Button primary, which meets AA in both themes.
    backgroundColor: darkTheme.accent,
    paddingHorizontal: space[4],
  },
  ctaText: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.textInverse,
  },
  // Equal footprint to the CTA: declining is a first-class answer here.
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: space[4],
  },
  secondaryText: {
    ...textBase,
    fontFamily: fontFamily.body.semiBold,
  },
});
