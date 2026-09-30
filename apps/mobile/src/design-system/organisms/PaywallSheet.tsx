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
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
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
import { darkTheme } from '../tokens/colors';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';
import { useLocale } from '../../hooks/useTranslation';
import { intlLocaleTag } from '../../lib/dateFormat';

const SWIPE_DISMISS_DY = 120;
const SWIPE_DISMISS_VY = 0.6;

/** Which plan the rider tapped. The caller turns this into a store purchase. */
export type PaywallPlan = 'monthly' | 'annual';

/**
 * Legal links required IN THE BINARY for auto-renewable subscriptions
 * (App Store Review Guideline 3.1.2). The metadata half lives in the App Store
 * description; this is the other half, and its absence is a routine rejection.
 *
 * The EULA is Apple's standard one because no custom EULA is uploaded in App
 * Store Connect — if a custom agreement is ever added there, this URL must
 * change with it or the app links to terms that do not govern.
 */
const APPLE_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_POLICY_URL = 'https://routes.defensivepedal.com/privacy';

/**
 * What opened the sheet, when it was a specific thing. The matching benefit is
 * moved to the top and outlined: a rider who tapped the locked E-bike pill
 * should see E-bike, not a list to search.
 */
export type PaywallFocus =
  | 'ebike'
  | 'cool'
  | 'savedRoutes'
  | 'offlinePacks'
  | 'history'
  | 'importedCourses'
  | 'loopSearches';

interface BenefitRow {
  readonly id: PaywallFocus;
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
  /** Annual price over twelve months — secondary line under the annual price. */
  annualPerMonth?: string;
  /** Whole-percent saving of annual over monthly; omit to show "Best value". */
  annualSavingsPercent?: number;
  /** Trial length from the store offering; omit to show the no-trial CTA. */
  trialDays?: number;
  /** Benefit to lead with and highlight. */
  focus?: PaywallFocus;
  /** True only where the shade graph exists — gates the cool-routing benefit. */
  coolRoutingAvailable?: boolean;
  busy?: boolean;
  /**
   * True when the rider already has Plus. Replaces the plan buttons with their
   * status — offering someone the subscription they are already paying for is
   * both confusing and a real way to take a second payment.
   */
  isSubscribed?: boolean;
  /** End of the current paid period, ISO. Shown when subscribed. */
  expiresAt?: string | null;
  /** True while the store is retrying a failed payment. */
  isInBillingRetry?: boolean;
  /** Opens the store's subscription management screen. */
  onManage?: () => void;
  onSubscribe: (plan: PaywallPlan) => void;
  onRestore: () => void;
}

export const PaywallSheet: React.FC<PaywallSheetProps> = ({
  visible,
  onDismiss,
  limits,
  monthlyPrice,
  annualPrice,
  annualPerMonth,
  annualSavingsPercent,
  trialDays,
  focus,
  coolRoutingAvailable = false,
  busy = false,
  isSubscribed = false,
  expiresAt = null,
  isInBillingRetry = false,
  onManage,
  onSubscribe,
  onRestore,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const t = useT();
  const { locale } = useLocale();

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

  /*
   * The two routing modes lead. They are the only part of Plus that is a
   * capability rather than a quantity, and for every grandfathered account
   * (all accounts created before PLUS_LAUNCH_AT_ISO) they are the ENTIRE
   * offer — the ceilings below are waived for them. Listing them last, as
   * this sheet did until 2026-09-29, buried the reason to buy under three
   * limits most existing riders never meet.
   *
   * E-bike replaced "unlimited flat routes" on 2026-09-19: Flat became free
   * and unlimited for everyone that day, so selling it here would have been
   * advertising something the free tier already has.
   */
  const modeBenefits: BenefitRow[] = [
    {
      id: 'ebike',
      icon: 'battery-charging-outline',
      title: 'premium.benefitEbikeTitle',
      body: 'premium.benefitEbikeBody',
    },
    // Only where the shade graph exists — see the honesty rule above.
    ...(coolRoutingAvailable
      ? [
          {
            id: 'cool' as const,
            icon: 'partly-sunny-outline',
            title: 'premium.benefitCoolTitle',
            body: 'premium.benefitCoolBody',
          },
        ]
      : []),
  ];

  // Numbers come from the catalog. `null` means unlimited, which never appears
  // in the free-tier copy, so a missing value falls back to the plain string.
  const ceilingBenefits: BenefitRow[] = [
    {
      id: 'savedRoutes',
      icon: 'bookmark-outline',
      title: 'premium.benefitRoutesTitle',
      body: 'premium.benefitRoutesBody',
      vars: { count: limits.savedRoutes ?? 0 },
    },
    {
      id: 'offlinePacks',
      icon: 'cloud-download-outline',
      title: 'premium.benefitPacksTitle',
      body: 'premium.benefitPacksBody',
      vars: { days: limits.offlinePackExpiryDays ?? 0 },
    },
    {
      id: 'history',
      icon: 'time-outline',
      title: 'premium.benefitHistoryTitle',
      body: 'premium.benefitHistoryBody',
      vars: { days: limits.historyWindowDays ?? 0 },
    },
  ];

  /*
   * Ceilings that are real but not worth a permanent row. They appear only
   * when they are what the rider just ran into, so a rider stopped at the
   * course limit reads about courses, while the everyday sheet stays short.
   */
  const contextualBenefits: BenefitRow[] = [
    ...(focus === 'importedCourses'
      ? [
          {
            id: 'importedCourses' as const,
            icon: 'map-outline',
            title: 'premium.benefitCoursesTitle',
            body: 'premium.benefitCoursesBody',
            vars: { count: limits.importedCourses ?? 0 },
          },
        ]
      : []),
    ...(focus === 'loopSearches'
      ? [
          {
            id: 'loopSearches' as const,
            icon: 'sync-outline',
            title: 'premium.benefitLoopsTitle',
            body: 'premium.benefitLoopsBody',
            vars: { count: limits.loopSessionsPerMonth ?? 0 },
          },
        ]
      : []),
  ];

  const ordered: BenefitRow[] = [...modeBenefits, ...ceilingBenefits, ...contextualBenefits];
  // The focused benefit leads; everything else keeps its order. A focus the
  // sheet cannot show (Cool outside shade coverage) changes nothing.
  const benefits: BenefitRow[] = focus
    ? [
        ...ordered.filter((b) => b.id === focus),
        ...ordered.filter((b) => b.id !== focus),
      ]
    : ordered;

  // Annual is pre-selected when the store prices it: it is the better deal for
  // the rider and the plan that survives a slow month. Re-derived whenever the
  // sheet opens, so a rider who picked monthly last time is not surprised.
  const defaultPlan: PaywallPlan = annualPrice ? 'annual' : 'monthly';
  const [selectedPlan, setSelectedPlan] = useState<PaywallPlan>(defaultPlan);
  useEffect(() => {
    if (visible) setSelectedPlan(defaultPlan);
  }, [visible, defaultPlan]);

  const selectedPerPeriod =
    selectedPlan === 'annual' && annualPrice
      ? t('premium.perYear', { price: annualPrice })
      : monthlyPrice
        ? t('premium.perMonth', { price: monthlyPrice })
        : null;

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
              <View
                key={b.id}
                style={[
                  styles.benefit,
                  b.id === focus
                    ? [styles.benefitFocused, { borderColor: colors.accent }]
                    : null,
                ]}
              >
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
            {/* Reassurance, not decoration: the fear a paywall raises is "what
                will they take away next". The safety core never moves. */}
            <Text style={[styles.freeStaysFree, { color: colors.textMuted }]}>
              {t('premium.freeStaysFree')}
            </Text>
          </ScrollView>

          {isSubscribed ? (
            <View style={styles.activeBlock}>
              <Text style={[styles.activeTitle, { color: colors.textPrimary }]}>
                {t('premium.activeTitle')}
              </Text>
              {isInBillingRetry ? (
                <Text style={[styles.activeMeta, { color: colors.danger }]}>
                  {t('premium.billingRetry')}
                </Text>
              ) : expiresAt ? (
                <Text style={[styles.activeMeta, { color: colors.textSecondary }]}>
                  {t('premium.renews', {
                    date: new Date(expiresAt).toLocaleDateString(intlLocaleTag(locale)),
                  })}
                </Text>
              ) : null}
              {onManage ? (
                <Button fullWidth variant="secondary" onPress={onManage}>
                  {t('premium.manage')}
                </Button>
              ) : null}
            </View>
          ) : (
          <View style={styles.plans} accessibilityRole="radiogroup">
            {annualPrice ? (
              <PlanOption
                selected={selectedPlan === 'annual'}
                onPress={() => setSelectedPlan('annual')}
                label={t('premium.planAnnual')}
                price={t('premium.perYear', { price: annualPrice })}
                detail={
                  annualPerMonth
                    ? t('premium.perMonthBilledYearly', { price: annualPerMonth })
                    : undefined
                }
                chip={
                  annualSavingsPercent
                    ? t('premium.savePercent', { percent: annualSavingsPercent })
                    : t('premium.bestValue')
                }
              />
            ) : null}
            {monthlyPrice ? (
              <PlanOption
                selected={selectedPlan === 'monthly'}
                onPress={() => setSelectedPlan('monthly')}
                label={t('premium.planMonthly')}
                price={t('premium.perMonth', { price: monthlyPrice })}
              />
            ) : null}

            {selectedPerPeriod ? (
              <Button
                fullWidth
                variant="primary"
                disabled={busy}
                loading={busy}
                onPress={() => onSubscribe(selectedPlan)}
                accessibilityLabel={`${ctaLabel}, ${selectedPerPeriod}`}
              >
                {ctaLabel}
              </Button>
            ) : null}
          </View>
          )}

          {!isSubscribed && trialDays && selectedPerPeriod ? (
            <Text style={[styles.trialNote, { color: colors.textSecondary }]}>
              {t('premium.trialNote', { days: trialDays, price: selectedPerPeriod })}
            </Text>
          ) : null}

          <Pressable onPress={onRestore} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.restore, { color: colors.accent }]}>
              {t('premium.restore')}
            </Text>
          </Pressable>

          <Text style={[styles.legal, { color: colors.textMuted }]}>{t('premium.legal')}</Text>

          <View style={styles.legalLinks}>
            <Pressable
              onPress={() => void Linking.openURL(APPLE_STANDARD_EULA_URL)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={t('premium.termsOfUse')}
            >
              <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
                {t('premium.termsOfUse')}
              </Text>
            </Pressable>
            <Text style={[styles.legalLink, { color: colors.textMuted }]}>{'  ·  '}</Text>
            <Pressable
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={t('premium.privacyPolicy')}
            >
              <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
                {t('premium.privacyPolicy')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

interface PlanOptionProps {
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly label: string;
  /** The billed amount — always the most prominent figure (Guideline 3.1.2). */
  readonly price: string;
  /** Secondary line, e.g. the per-month equivalent. Never larger than `price`. */
  readonly detail?: string;
  readonly chip?: string;
}

const PlanOption: React.FC<PlanOptionProps> = ({
  selected,
  onPress,
  label,
  price,
  detail,
  chip,
}) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={[label, price, detail, chip].filter(Boolean).join(', ')}
      style={[
        styles.planOption,
        {
          borderColor: selected ? colors.accent : colors.borderDefault,
          backgroundColor: colors.bgSecondary,
        },
      ]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.accent : colors.textMuted}
      />
      <View style={styles.planText}>
        <View style={styles.planLabelRow}>
          <Text style={[styles.planLabel, { color: colors.textPrimary }]}>{label}</Text>
          {/* Static pair, same as Button primary: meets 4.5:1 in both themes. */}
          {chip ? (
            <View style={[styles.planChip, { backgroundColor: darkTheme.accent }]}>
              <Text style={[styles.planChipText, { color: darkTheme.textInverse }]}>{chip}</Text>
            </View>
          ) : null}
        </View>
        {detail ? (
          <Text style={[styles.planDetail, { color: colors.textSecondary }]}>{detail}</Text>
        ) : null}
      </View>
      <Text style={[styles.planPrice, { color: colors.textPrimary }]}>{price}</Text>
    </Pressable>
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
  benefitFocused: {
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: space[3],
    marginHorizontal: -space[1],
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  planText: { flex: 1, gap: 2 },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  planLabel: { ...textSm, fontFamily: fontFamily.body.semiBold },
  planChip: { borderRadius: radii.full, paddingHorizontal: space[2], paddingVertical: 1 },
  planChipText: { ...textXs, fontFamily: fontFamily.body.semiBold },
  planDetail: { ...textXs },
  planPrice: { ...textSm, fontFamily: fontFamily.body.semiBold },
  benefitText: { flex: 1, gap: 2 },
  benefitTitle: { ...textSm, fontFamily: fontFamily.body.semiBold },
  benefitBody: { ...textXs, lineHeight: 18 },
  freeStaysFree: { ...textXs, lineHeight: 18, marginTop: space[1] },
  plans: { gap: space[2], marginTop: space[2] },
  activeBlock: { gap: space[2], marginTop: space[2], alignItems: 'center' },
  activeTitle: { ...textSm, fontFamily: fontFamily.body.semiBold },
  activeMeta: { ...textXs, textAlign: 'center' },
  trialNote: { ...textXs, textAlign: 'center', marginTop: space[2] },
  restore: { ...textSm, textAlign: 'center', marginTop: space[3] },
  legal: { ...textXs, textAlign: 'center', marginTop: space[2], lineHeight: 16 },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space[1],
  },
  legalLink: { ...textXs, lineHeight: 16, textDecorationLine: 'underline' },
});
