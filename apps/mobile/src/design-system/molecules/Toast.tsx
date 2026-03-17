/**
 * Design System v1.0 — Toast Molecule
 *
 * Bottom pill snackbar. 4s auto-dismiss. Slide-up entrance.
 * 4 variants: info | success | warning | error
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, textSm } from '../tokens/typography';
import { darkTheme, safetyColors, gray } from '../tokens/colors';
import { duration as dur, easing } from '../tokens/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. 0 = manual dismiss only. */
  durationMs?: number;
  /** Called when toast should be removed */
  onDismiss?: () => void;
  /** Optional action button text */
  action?: string;
  /** Action press handler */
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// Variant styling
// ---------------------------------------------------------------------------

const variantConfig: Record<
  ToastVariant,
  { bg: string; accent: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  info: {
    bg: gray[800],
    accent: safetyColors.info,
    icon: 'information-circle',
  },
  success: {
    bg: gray[800],
    accent: safetyColors.safe,
    icon: 'checkmark-circle',
  },
  warning: {
    bg: gray[800],
    accent: safetyColors.caution,
    icon: 'alert-circle',
  },
  error: {
    bg: gray[800],
    accent: safetyColors.danger,
    icon: 'close-circle',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'info',
  durationMs = 4000,
  onDismiss,
  action,
  onAction,
}) => {
  const reducedMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const cfg = variantConfig[variant];

  // Slide in
  useEffect(() => {
    if (reducedMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: dur.normal,
        easing: easing.out,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: dur.fast,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reducedMotion]);

  // Auto-dismiss
  useEffect(() => {
    if (durationMs <= 0 || !onDismiss) return;

    const timer = setTimeout(() => {
      if (reducedMotion) {
        onDismiss();
        return;
      }
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: dur.normal,
          easing: easing.in,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: dur.normal,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onDismiss, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: cfg.bg, transform: [{ translateY }], opacity },
        shadows.lg,
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name={cfg.icon} size={20} color={cfg.accent} />
      <Text
        style={[textSm, styles.message, { fontFamily: fontFamily.body.medium }]}
        numberOfLines={2}
      >
        {message}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={action}>
          <Text
            style={[
              textSm,
              { color: darkTheme.accent, fontFamily: fontFamily.body.bold },
            ]}
          >
            {action}
          </Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          hitSlop={13}
          style={styles.dismissButton}
        >
          <Ionicons name="close" size={18} color={gray[400]} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.full,
    gap: space[3],
    maxWidth: '92%',
    minWidth: 200,
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
  },
  actionButton: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  dismissButton: {
    width: 44,
    height: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: -space[2],
  },
});
