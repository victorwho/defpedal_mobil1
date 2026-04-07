/**
 * Design System v1.0 — Modal Organism
 *
 * Scale-in animation, dark overlay.
 * 2 variants: default | critical (red border + non-dismissable overlay).
 * Header, body, footer slots.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal as RNModal,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, text2xl, textBase } from '../tokens/typography';
import { safetyColors } from '../tokens/colors';
import { duration, easing } from '../tokens/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptics } from '../hooks/useHaptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModalProps {
  visible: boolean;
  onClose?: () => void;
  variant?: 'default' | 'critical';
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  variant = 'default',
  title,
  description,
  children,
  footer,
}) => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (variant === 'critical') haptics.error();
      else haptics.medium();

      if (reducedMotion) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: duration.normal,
          easing: easing.out,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration.fast,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
    }
  }, [visible, reducedMotion]);

  const isCritical = variant === 'critical';
  const dismissable = !isCritical && !!onClose;

  const cardBorder: ViewStyle = isCritical
    ? { borderColor: safetyColors.danger, borderWidth: 2 }
    : { borderColor: colors.borderDefault, borderWidth: 1 };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      {/* Overlay */}
      <Pressable
        style={styles.overlay}
        onPress={dismissable ? onClose : undefined}
        disabled={!dismissable}
      >
        {/* Card — stop propagation */}
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={[
            styles.card,
            { backgroundColor: colors.bgPrimary },
            cardBorder,
            shadows.xl,
            { transform: [{ scale }], opacity },
          ]}
        >
          <Pressable>
            {/* Header */}
            <View style={styles.header}>
              <Text
                style={[
                  text2xl,
                  {
                    color: isCritical
                      ? safetyColors.danger
                      : colors.textPrimary,
                  },
                ]}
              >
                {title}
              </Text>
              {description ? (
                <Text style={[textBase, { color: colors.textSecondary }]}>
                  {description}
                </Text>
              ) : null}
            </View>

            {/* Body */}
            {children ? <View style={styles.body}>{children}</View> : null}

            {/* Footer */}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
        </Animated.View>
      </Pressable>
    </RNModal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[6],
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.xl,
    borderCurve: 'continuous', // Smooth squircle corners on iOS
    overflow: 'hidden',
  },
  header: {
    padding: space[6],
    gap: space[2],
  },
  body: {
    paddingHorizontal: space[6],
    paddingBottom: space[4],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space[3],
    paddingHorizontal: space[6],
    paddingBottom: space[6],
  },
});
