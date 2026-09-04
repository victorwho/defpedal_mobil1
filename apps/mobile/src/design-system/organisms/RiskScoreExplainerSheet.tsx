/**
 * RiskScoreExplainerSheet — "How we score every street".
 *
 * The single Tier-2 education surface for the Risk Score. Opened only by
 * explicit user taps (ⓘ on RiskDistributionCard, onboarding "How we score
 * streets" link) — never self-triggered, never during NAVIGATING.
 *
 * Content order is deliberate (progressive disclosure): the color legend
 * first (what the rider came to decode), then the factor groups, then the
 * routing trade-off note and the "street, not the moment" disclaimer.
 *
 * Copy source of truth: docs/APP_RISK_COPY.md, adapted to the live server
 * band labels (Option B, 2026-08-12). No numeric thresholds or factor
 * weights appear anywhere — factors are named with direction only, and score
 * thresholds stay server-side (2026-04-13 hardening).
 *
 * Dismissal: backdrop tap, swipe down on the header, Android back, close
 * button, screen-reader escape. Respects `useReducedMotion`.
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

import { useTheme } from '../ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { gray } from '../tokens/colors';
import { duration as dur, easing } from '../tokens/motion';
import { radii } from '../tokens/radii';
import { RISK_LEGEND_BANDS } from '../tokens/riskLegend';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

const SWIPE_DISMISS_DY = 120;
const SWIPE_DISMISS_VY = 0.6;

const FACTOR_ROWS: readonly { icon: string; key: string }[] = [
  { icon: 'shield-checkmark-outline', key: 'factorSeparation' },
  { icon: 'speedometer-outline', key: 'factorTraffic' },
  { icon: 'car-outline', key: 'factorVolume' },
  { icon: 'git-merge-outline', key: 'factorDesign' },
  { icon: 'layers-outline', key: 'factorSurface' },
  { icon: 'moon-outline', key: 'factorEnvironment' },
];

export interface RiskScoreExplainerSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export const RiskScoreExplainerSheet: React.FC<RiskScoreExplainerSheetProps> = ({
  visible,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const t = useT();

  const translateY = useRef(new Animated.Value(320)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.setValue(0);
        backdropOpacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: dur.fast,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(320);
      backdropOpacity.setValue(0);
    }
  }, [visible, reducedMotion, translateY, backdropOpacity]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Swipe-to-dismiss is attached to the header/drag-handle zone only so the
  // inner ScrollView keeps full control of vertical scrolling.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > SWIPE_DISMISS_DY || gesture.vy > SWIPE_DISMISS_VY) {
          Animated.timing(translateY, {
            toValue: 360,
            duration: dur.fast,
            easing: easing.in,
            useNativeDriver: true,
          }).start(() => onDismissRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
        </Animated.View>

        <Animated.View
          onAccessibilityEscape={onDismiss}
          style={[
            styles.sheet,
            shadows.xl,
            {
              backgroundColor: colors.bgPrimary,
              paddingBottom: insets.bottom + space[4],
              transform: [{ translateY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.dragHandleContainer}>
              <View style={[styles.dragHandle, { backgroundColor: gray[400] }]} />
            </View>

            <View style={styles.header}>
              <Text
                style={[styles.title, { color: colors.textPrimary }]}
                accessibilityRole="header"
              >
                {t('risk.explainer.title')}
              </Text>
              <Pressable
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                hitSlop={12}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {t('risk.explainer.intro')}
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              {t('risk.explainer.legendTitle')}
            </Text>
            <View style={styles.legendList}>
              {RISK_LEGEND_BANDS.map((band) => (
                <View key={band.key} style={styles.legendRow}>
                  {/*
                    A ramp, not a swatch: the map paints several shades inside
                    each tier, and a single chip made the legend look like it
                    disagreed with the map. Shades are shown but never
                    labelled — the tier is the only level at which risk may be
                    named or compared (BAND_REANCHOR_B46V1.md).
                  */}
                  <View
                    style={[styles.legendRamp, { borderColor: colors.borderDefault }]}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('risk.bands.rampA11y', {
                      band: t(`risk.bands.${band.key}.label`),
                      count: band.shades.length,
                    })}
                  >
                    {band.shades.map((shade) => (
                      <View
                        key={shade}
                        style={[styles.legendRampShade, { backgroundColor: shade }]}
                      />
                    ))}
                  </View>
                  <View style={styles.legendTextColumn}>
                    <Text style={[styles.legendLabel, { color: colors.textPrimary }]}>
                      {t(`risk.bands.${band.key}.label`)}
                    </Text>
                    <Text style={[styles.legendDesc, { color: colors.textSecondary }]}>
                      {t(`risk.bands.${band.key}.desc`)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.anchorCallout,
                { backgroundColor: colors.bgSecondary, borderColor: colors.borderDefault },
              ]}
            >
              <Text style={[styles.anchorText, { color: colors.textSecondary }]}>
                {t('risk.explainer.anchor')}
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              {t('risk.explainer.factorsTitle')}
            </Text>
            <View style={styles.factorList}>
              {FACTOR_ROWS.map((factor) => (
                <View key={factor.key} style={styles.factorRow}>
                  <Ionicons
                    name={factor.icon as any}
                    size={18}
                    color={colors.textSecondary}
                    style={styles.factorIcon}
                  />
                  <Text style={[styles.factorText, { color: colors.textSecondary }]}>
                    {t(`risk.explainer.${factor.key}`)}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {t('risk.explainer.routing')}
            </Text>

            <Text style={[styles.smallPrint, { color: colors.textMuted }]}>
              {t('risk.explainer.disclaimer')}
            </Text>
            <Text style={[styles.smallPrint, { color: colors.textMuted }]}>
              {t('risk.explainer.attribution')}
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: space[2],
    paddingBottom: space[1],
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    gap: space[2],
  },
  title: {
    ...textBase,
    fontFamily: fontFamily.heading.semiBold,
    flex: 1,
  },
  closeButton: {
    padding: space[1],
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: space[4],
    paddingBottom: space[4],
    gap: space[3],
  },
  body: {
    ...textSm,
    fontFamily: fontFamily.body.regular,
    lineHeight: 20,
  },
  sectionTitle: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space[1],
  },
  legendList: {
    gap: space[2],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  legendChip: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  // Fixed width so every tier's ramp is the same length and the label column
  // stays aligned — the number of shades per tier differs (2 / 4 / 4 / 1).
  legendRamp: {
    width: 40,
    height: 16,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  legendRampShade: {
    flex: 1,
    height: '100%',
  },
  legendTextColumn: {
    flex: 1,
    gap: 1,
  },
  legendLabel: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
  },
  legendDesc: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    lineHeight: 16,
  },
  anchorCallout: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  anchorText: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  factorList: {
    gap: space[2],
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  factorIcon: {
    marginTop: 1,
  },
  factorText: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    flex: 1,
    lineHeight: 16,
  },
  smallPrint: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    lineHeight: 15,
  },
});
