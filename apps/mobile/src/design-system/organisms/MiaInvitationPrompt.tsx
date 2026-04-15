/**
 * Design System — MiaInvitationPrompt Organism
 *
 * Non-blocking bottom sheet shown when the server flags a user for behavioral
 * detection (persona still 'alex', miaPromptShown === false, onboarding done,
 * multiple app opens without riding).
 *
 * Layout: semi-transparent backdrop + animated bottom card with warm copy
 * and two equally-prominent action buttons.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePersonaT } from '../../hooks/usePersonaT';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import {
  fontFamily,
  textXl,
  textBase,
  textSm,
} from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaInvitationPromptProps {
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const { height: SCREEN_H } = Dimensions.get('window');
const CARD_TRANSLATE_START = 400;

export const MiaInvitationPrompt: React.FC<MiaInvitationPromptProps> = ({
  onAccept,
  onDecline,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const themed = themedStyles(colors);
  const t = usePersonaT();

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(CARD_TRANSLATE_START)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(cardTranslateY, {
        toValue: 0,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Semi-transparent backdrop — tappable to dismiss (decline) */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDecline}
        accessibilityRole="button"
        accessibilityLabel="Dismiss invitation"
      >
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Bottom card */}
      <Animated.View
        style={[
          themed.card,
          {
            paddingBottom: insets.bottom + space[4],
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
      >
        {/* Headline */}
        <Text
          style={themed.headline}
          accessibilityRole="header"
        >
          {t('mia.detection.headline')}
        </Text>

        {/* Body */}
        <Text style={themed.body}>
          {t('mia.detection.body')}
        </Text>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [
              themed.acceptButton,
              pressed && themed.acceptButtonPressed,
            ]}
            onPress={onAccept}
            accessibilityRole="button"
            accessibilityLabel={t('mia.detection.accept')}
          >
            <Text style={themed.acceptText}>{t('mia.detection.accept')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              themed.declineButton,
              pressed && themed.declineButtonPressed,
            ]}
            onPress={onDecline}
            accessibilityRole="button"
            accessibilityLabel={t('mia.detection.decline')}
          >
            <Text style={themed.declineText}>
              {t('mia.detection.decline')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: zIndex.modal,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  buttonRow: {
    gap: space[3],
    marginTop: space[5],
  },
});

// ---------------------------------------------------------------------------
// Themed styles (dark/light aware)
// ---------------------------------------------------------------------------

const themedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bgPrimary,
      borderTopLeftRadius: radii['2xl'],
      borderTopRightRadius: radii['2xl'],
      paddingHorizontal: space[5],
      paddingTop: space[6],
      ...shadows.lg,
    },
    headline: {
      ...textXl,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      marginBottom: space[3],
    },
    body: {
      ...textBase,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
      lineHeight: 24,
    },
    acceptButton: {
      height: 48,
      borderRadius: radii.full,
      backgroundColor: colors.accent,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    acceptButtonPressed: {
      backgroundColor: colors.accentHover,
      transform: [{ scale: 0.97 }],
    },
    acceptText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      fontSize: 16,
      color: colors.textInverse,
    },
    declineButton: {
      height: 48,
      borderRadius: radii.full,
      backgroundColor: colors.bgSecondary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    declineButtonPressed: {
      backgroundColor: colors.bgTertiary,
      transform: [{ scale: 0.97 }],
    },
    declineText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
  });
