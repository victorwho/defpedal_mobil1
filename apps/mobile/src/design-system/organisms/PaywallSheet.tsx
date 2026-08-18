/**
 * PaywallSheet — the full Pedal Plus offer.
 *
 * Opened only by explicit taps (a limit card's "Go Plus", the Profile row).
 * Never self-triggered, and never during NAVIGATING — a rider on the road is
 * not a sales opportunity, which is the same rule the mascot and the nudge
 * system follow.
 *
 * Two honesty rules are enforced here rather than left to copy review:
 *
 *   1. The cool-routing benefit is only listed when the rider's country
 *      actually has shade data. Selling a Romania-only feature to a rider in
 *      Spain would be a lie the moment they paid.
 *   2. Every number in the copy comes from `limits`, which the caller reads
 *      from the catalog. No free-tier figure is ever typed into a string.
 *
 * Dismissal: backdrop tap, swipe down, Android back, close button. Respects
 * `useReducedMotion`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TierLimits } from '@defensivepedal/core';

import { Button } from '../atoms/Button';
import { PlusBadge } from '../atoms/PlusBadge';
import { useTheme } from '../ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { duration as dur, easing } from '../tokens/motion';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

const SWIPE_DISMISS_DY = 120;
const SWIPE_DISMISS_VY = 0.6;

/** Which plan the rider tapped. The caller turns this into a store purchase. */
export type PaywallPlan = 'monthly' | 'annual';

interface BenefitRow {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly vars?: Record<string, string | number>;
}

export interface PaywallSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Free-tier limits, from `usePremium().limits` — never literals. */
  limits: TierLimits;
  /** Localised store prices. Absent while offerings are still loading. */
  monthlyPrice?: string;
  annualPrice?: string;
  /** Trial length from the store offering; omit to show the no-trial CTA. */
  trialDays?: number;
  /** True only where the shade graph exists — gates the cool-routing benefit. */
  coolRoutingAvailable?: boolean;
  busy?: boolean;
  onSubscribe: (plan: PaywallPlan) => void;
  onRestore: () => void;
}

export const PaywallSheet: React.FC<PaywallSheetProps> = ({
  visible,
  onDismiss,
  limits,
  monthlyPrice,
  annualPrice,
  trialDays,
  coolRoutingAvailable = false,
  busy = false,
  onSubscribe,
  onRestore,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const t = useT();

  const translateY = useRef(new Animated.Value(360)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.setValue(0);
        backdropOpacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: dur.normal,
          easing: easing.out,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: dur.normal,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(reducedMotion ? 0 : 360);
      backdropOpacity.setValue(reducedMotion ? 1 : 0);
    }
  }, [visible, reducedMotion, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > SWIPE_DISMISS_DY || g.vy > SWIPE_DISMISS_VY) {
          onDismiss();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // Numbers come from the catalog. `null` means unlimited, which never appears
  // in the free-tier copy, so a missing value falls back to the plain string.
  const benefits: BenefitRow[] = [
    {
      icon: 'bookmark-outline',
      title: 'premium.benefitRoutesTitle',
      body: 'premium.benefitRoutesBody',
      vars: { count: limits.savedRoutes ?? 0 },
    },
    {
      icon: 'cloud-download-outline',
      title: 'premium.benefitPacksTitle',
      body: 'premium.benefitPacksBody',
      vars: { days: limits.offlinePackExpiryDays ?? 0 },
    },
    {
      icon: 'time-outline',
      title: 'premium.benefitHistoryTitle',
      body: 'premium.benefitHistoryBody',
      vars: { days: limits.historyWindowDays ?? 0 },
    },
    {
      icon: 'trending-up-outline',
      title: 'premium.benefitFlatTitle',
      body: 'premium.benefitFlatBody',
    },
    // Only where the shade graph exists — see the honesty rule above.
    ...(coolRoutingAvailable
      ? [
          {
            icon: 'partly-sunny-outline',
            title: 'premium.benefitCoolTitle',
            body: 'premium.benefitCoolBody',
          },
        ]
      : []),
  ];

  const ctaLabel = trialDays ? t('premium.cta') : t('premium.ctaNoTrial');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdropWrap, { opacity: backdropOpacity }]}>
          <Pressable
            style={styles.backdrop}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            shadows.lg,
            {
              backgroundColor: colors.bgPrimary,
              paddingBottom: insets.bottom + space[4],
              transform: [{ translateY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.grabArea}>
            <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {t('premium.sheetTitle')}
              </Text>
              <PlusBadge />
            </View>
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('premium.sheetSubtitle')}
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {benefits.map((b) => (
              <View key={b.title} style={styles.benefit}>
                <Ionicons name={b.icon as never} size={20} color={colors.accent} />
                <View style={styles.benefitText}>
                  <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>
                    {t(b.title)}
                  </Text>
                  <Text style={[styles.benefitBody, { color: colors.textSecondary }]}>
                    {t(b.body, b.vars)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.plans}>
            {monthlyPrice ? (
              <Button
                fullWidth
                variant="primary"
                disabled={busy}
                loading={busy}
                onPress={() => onSubscribe('monthly')}
                accessibilityLabel={`${t('premium.planMonthly')} ${monthlyPrice}`}
              >
                {`${ctaLabel} · ${t('premium.perMonth', { price: monthlyPrice })}`}
              </Button>
            ) : null}

            {annualPrice ? (
              <Button
                fullWidth
                variant="secondary"
                disabled={busy}
                onPress={() => onSubscribe('annual')}
                accessibilityLabel={`${t('premium.planAnnual')} ${annualPrice}`}
              >
                {t('premium.perYear', { price: annualPrice })}
              </Button>
            ) : null}
          </View>

          {trialDays && monthlyPrice ? (
            <Text style={[styles.trialNote, { color: colors.textSecondary }]}>
              {t('premium.trialNote', { days: trialDays, price: monthlyPrice })}
            </Text>
          ) : null}

          <Pressable onPress={onRestore} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.restore, { color: colors.accent }]}>
              {t('premium.restore')}
            </Text>
          </Pressable>

          <Text style={[styles.legal, { color: colors.textMuted }]}>{t('premium.legal')}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdropWrap: { ...StyleSheet.absoluteFillObject },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: space[5],
    maxHeight: '88%',
  },
  grabArea: { paddingVertical: space[3], alignItems: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { ...textBase, fontFamily: fontFamily.heading.bold, fontSize: 20 },
  subtitle: { ...textSm, marginTop: space[1], marginBottom: space[3] },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: space[3], paddingBottom: space[3] },
  benefit: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  benefitText: { flex: 1, gap: 2 },
  benefitTitle: { ...textSm, fontFamily: fontFamily.body.semiBold },
  benefitBody: { ...textXs, lineHeight: 18 },
  plans: { gap: space[2], marginTop: space[2] },
  trialNote: { ...textXs, textAlign: 'center', marginTop: space[2] },
  restore: { ...textSm, textAlign: 'center', marginTop: space[3] },
  legal: { ...textXs, textAlign: 'center', marginTop: space[2], lineHeight: 16 },
});
