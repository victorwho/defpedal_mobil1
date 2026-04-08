import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { BrandLogo } from '../../components/BrandLogo';
import { useTheme } from '../ThemeContext';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { surfaceTints } from '../tokens/tints';
import {
  fontFamily,
  text3xl,
  textBase,
  textLg,
  textXs,
} from '../tokens/typography';

export type ScreenHeaderVariant = 'back' | 'close' | 'brand-logo' | 'title-only';

export type ScreenHeaderProps = {
  /** Header layout variant */
  variant: ScreenHeaderVariant;
  /** Screen title (required for all variants) */
  title: string;
  /** Eyebrow text above title (brand-logo variant only) */
  eyebrow?: string;
  /** Subtitle below title (brand-logo variant only) */
  subtitle?: string;
  /** Right-side accessory (e.g. action button) */
  rightAccessory?: ReactNode;
  /** Custom back/close handler (defaults to router.back()) */
  onBack?: () => void;
};

/**
 * Unified screen header atom with four layout variants:
 * - `back`: Yellow circle back button + title (detail screens)
 * - `close`: X button + title (modal-style screens)
 * - `brand-logo`: Logo + title/eyebrow/subtitle (main screens)
 * - `title-only`: Centered title only (simple screens)
 */
export const ScreenHeader = ({
  variant,
  title,
  eyebrow,
  subtitle,
  rightAccessory,
  onBack,
}: ScreenHeaderProps) => {
  const { colors, mode } = useTheme();

  const handleBack = onBack ?? (() => router.back());

  // ── Back button variant ──
  if (variant === 'back') {
    return (
      <View style={styles.navRow}>
        <Pressable
          style={styles.backButton}
          onPress={handleBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={brandColors.textInverse} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    );
  }

  // ── Close button variant ──
  if (variant === 'close') {
    return (
      <View style={styles.navRow}>
        <Pressable
          style={styles.closeButton}
          onPress={handleBack}
          accessibilityLabel="Close"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    );
  }

  // ── Title-only variant ──
  if (variant === 'title-only') {
    return (
      <View style={styles.navRow}>
        <View style={styles.spacer} />
        <Text style={[styles.navTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    );
  }

  // ── Brand-logo variant (default) ──
  const headerBg = mode === 'dark' ? surfaceTints.glass : surfaceTints.glassLight;

  return (
    <View style={[styles.brandShell, { borderColor: colors.borderDefault, backgroundColor: headerBg }]}>
      <View style={styles.brandRow}>
        <BrandLogo />
        <View style={styles.titleWrap}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text>
          ) : null}
          <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
        {rightAccessory ? <View style={styles.brandAccessory}>{rightAccessory}</View> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // ── Navigation row (back/close/title-only) ──
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brandColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    ...textLg,
    fontFamily: fontFamily.heading.bold,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: space[2],
  },
  spacer: {
    width: 44,
  },
  rightAccessory: {
    width: 44,
    alignItems: 'flex-end',
  },

  // ── Brand-logo variant ──
  brandShell: {
    borderRadius: radii['2xl'] + space[1],
    borderWidth: 1,
    padding: space[4] + space[0.5],
    overflow: 'hidden',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3] + space[0.5],
  },
  titleWrap: {
    flex: 1,
    gap: space[1] + space[0.5],
  },
  eyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  brandTitle: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  subtitle: {
    ...textBase,
    fontSize: 15,
    lineHeight: 22,
  },
  brandAccessory: {
    alignItems: 'flex-end',
  },
});
