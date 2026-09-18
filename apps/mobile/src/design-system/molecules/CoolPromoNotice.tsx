/**
 * Design System v1.0 — CoolPromoNotice Molecule
 *
 * One-time notice, on first open of the release that turned Cool routing on in
 * production: the mode is free to everyone until the promotion ends, and part
 * of Plus after that.
 *
 * WHY A DATE IS RENDERED RATHER THAN THE WORDS "end of September"
 * ---------------------------------------------------------------
 * The cutoff is a single constant in core (`COOL_ROUTING_FREE_UNTIL`) that the
 * entitlement gate reads too, and the copy formats that same instant. Hard-
 * coding a month name into three locales would let the promise and the gate
 * drift apart the moment the date moves — and this date is likely to move,
 * because a staged rollout means most riders do not see this screen on the day
 * it ships.
 *
 * The date is shown in the rider's own locale, and derived from the UTC
 * instant so every rider is told the same deadline.
 *
 * SAFETY / TIMING GATES LIVE AT THE CALL SITE, NOT HERE
 * -----------------------------------------------------
 * `CoolPromoNoticeManager` in `app/_layout.tsx` owns "has it been seen", "is
 * the promo still running", and "is the rider mid-ride" — this component only
 * renders. That split is what makes the decision logic testable without
 * standing up the whole layout.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { COOL_ROUTING_FREE_UNTIL } from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { useT } from '../../hooks/useTranslation';
import { useLocale } from '../../hooks/useTranslation';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { safetyColors } from '../tokens/colors';
import { safetyTints } from '../tokens/tints';
import { fontFamily, textBase, textLg, textSm } from '../tokens/typography';

export interface CoolPromoNoticeProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Locale map for the deadline, so the date reads naturally in each language. */
const DATE_LOCALE: Record<string, string> = {
  en: 'en-GB',
  ro: 'ro-RO',
  es: 'es-ES',
};

export const CoolPromoNotice: React.FC<CoolPromoNoticeProps> = ({
  visible,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const t = useT();
  const { locale } = useLocale();

  // The promo runs THROUGH the day before the cutoff instant, so the date the
  // rider is told is the last free day, not the first chargeable one.
  const lastFreeDay = new Date(COOL_ROUTING_FREE_UNTIL.getTime() - 24 * 60 * 60 * 1000);
  let deadline: string;
  try {
    deadline = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-GB', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(lastFreeDay);
  } catch {
    // Hermes ships full ICU, but a formatting failure must not cost the rider
    // the notice — fall back to the ISO date rather than rendering nothing.
    deadline = lastFreeDay.toISOString().slice(0, 10);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bgPrimary }]}>
          <View style={styles.iconRow}>
            <Ionicons name="leaf" size={28} color={safetyTints.coolAccent} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('cool.promo.title')}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('cool.promo.body', { date: deadline })}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('cool.promo.afterwards')}
          </Text>

          <Pressable
            style={styles.cta}
            onPress={onDismiss}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={t('cool.promo.cta')}
          >
            <Text style={styles.ctaText}>{t('cool.promo.cta')}</Text>
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
    borderColor: safetyTints.coolBorder,
    padding: space[5],
    gap: space[3],
  },
  iconRow: {
    alignItems: 'center',
  },
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
    // 48dp minimum touch target.
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    // The DOCUMENTED solid-fill pair (`cool` + `coolOnFill`, 7.76:1), not the
    // lighter `coolAccent`. coolAccent is tuned for 3:1 against tinted
    // surfaces as an icon / large-text colour; white on it is only 3.97:1,
    // which fails AA for a button label. Measured, not assumed — the first
    // version of this file asserted 4.53:1 from memory and was wrong.
    backgroundColor: safetyColors.cool,
    paddingHorizontal: space[4],
  },
  ctaText: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: safetyColors.coolOnFill,
  },
});
