/**
 * Design System v1.0 — Card / Surface Atom
 *
 * Standardized card container — the canonical chrome primitive.
 * `<Surface>` is exported as an alias of `<Card>` for readability at call sites.
 *
 * Variants (bg + border treatment):
 *   - solid   → bgPrimary, default border, default elevation md
 *   - glass   → translucent dark, default border, default elevation flat
 *   - outline → transparent, default border, default elevation flat
 *   - form    → bgForm (warm paper), NO border, default elevation md
 *   - accent  → bgPrimary, accent border, default elevation md (use sparingly — §10)
 *   - panel   → bgPrimary, NO border (raised borderless surface — pair with elevation lg)
 *
 * Elevation (shadow depth, default depends on variant):
 *   - inset → no shadow, deeper bg (pressed-in look — solid only)
 *   - flat  → no shadow
 *   - sm    → shadows.sm (subtle — list items)
 *   - md    → shadows.md (standard — cards)
 *   - lg    → shadows.lg (prominent — sheets, modals)
 *
 * Surface owns chrome (bg + border + shadow + radius). Layout (padding, gap,
 * flexDirection) belongs to the caller via `style`.
 *
 * See docs/design-context.md §4 (Component primitives) and §10 (Accent discipline).
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { surfaceTints } from '../tokens/tints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardVariant = 'solid' | 'glass' | 'outline' | 'form' | 'accent' | 'panel';
export type CardElevation = 'inset' | 'flat' | 'sm' | 'md' | 'lg';
export type CardRadius = 'lg' | 'xl' | '2xl';

export interface CardProps {
  variant?: CardVariant;
  /**
   * Shadow / depth knob. Defaults to `'md'` for `solid`, `'flat'` for `glass`/`outline`.
   * Use `'inset'` for a pressed-in look (works on `solid` only — falls back to flat
   * on glass/outline since they don't have an opaque bg to deepen).
   */
  elevation?: CardElevation;
  /**
   * Border radius scale — direct mapping to `radii` tokens. Default `'xl'`.
   * Use `'2xl'` for hero cards (auth, profile, etc.); `'lg'` for compact rows.
   */
  radius?: CardRadius;
  children: React.ReactNode;
  style?: ViewStyle;

  // -------------------------------------------------------------------------
  // Optional pressable behaviour — when `onPress`/`onLongPress` is provided,
  // Surface renders as a Pressable. Default press feedback is a subtle opacity
  // dim that works on both platforms without conflicting with the rounded
  // shadow chrome. Use `pressedStyle` to encode bespoke pressed states (e.g.
  // border-color flip on a goal selection card).
  // -------------------------------------------------------------------------
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * RN passthrough — set to `false` to hide the surface from the accessibility
   * tree entirely (descendants remain reachable). Useful for wrappers whose
   * only job is event propagation, not interaction.
   */
  accessible?: boolean;
  /** Style applied while pressed. Default: `{ opacity: 0.85 }`. */
  pressedStyle?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

const elevationShadow: Record<CardElevation, ViewStyle> = {
  inset: {},
  flat: {},
  sm: { ...shadows.sm },
  md: { ...shadows.md },
  lg: { ...shadows.lg },
};

const radiusValue: Record<CardRadius, number> = {
  lg: radii.lg,
  xl: radii.xl,
  '2xl': radii['2xl'],
};

const defaultElevationFor = (variant: CardVariant): CardElevation =>
  variant === 'solid' ? 'md' : 'flat';

const buildVariantStyle = (
  variant: CardVariant,
  elevation: CardElevation,
  colors: ThemeColors,
): ViewStyle => {
  const defaultBorder: ViewStyle = {
    borderWidth: 1,
    borderColor: colors.borderDefault,
  };

  switch (variant) {
    case 'solid':
      return {
        ...defaultBorder,
        backgroundColor: elevation === 'inset' ? colors.bgDeep : colors.bgPrimary,
      };
    case 'glass':
      return {
        ...defaultBorder,
        backgroundColor: surfaceTints.glass,
      };
    case 'outline':
      return {
        ...defaultBorder,
        backgroundColor: 'transparent',
      };
    case 'form':
      // Warm-paper surface; intentionally borderless to read as a writing canvas.
      return {
        backgroundColor: colors.bgForm,
      };
    case 'accent':
      return {
        borderWidth: 1,
        borderColor: colors.borderAccent,
        backgroundColor: colors.bgPrimary,
      };
    case 'panel':
      // Borderless raised surface — relies on elevation for separation.
      return {
        backgroundColor: colors.bgPrimary,
      };
  }
};

const DEFAULT_PRESSED_STYLE: ViewStyle = { opacity: 0.85 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Card: React.FC<CardProps> = ({
  variant = 'solid',
  elevation,
  radius = 'xl',
  onPress,
  onLongPress,
  disabled,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessible,
  pressedStyle,
  children,
  style,
}) => {
  const { colors } = useTheme();
  const resolvedElevation = elevation ?? defaultElevationFor(variant);
  const variantStyle = buildVariantStyle(variant, resolvedElevation, colors);
  const radiusStyle: ViewStyle = { borderRadius: radiusValue[radius] };
  const baseStyles = [styles.base, radiusStyle, variantStyle, elevationShadow[resolvedElevation]];

  if (onPress || onLongPress) {
    const resolvedPressedStyle = pressedStyle ?? DEFAULT_PRESSED_STYLE;
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessible={accessible}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={({ pressed }) => [
          ...baseStyles,
          style,
          pressed && resolvedPressedStyle,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View accessible={accessible} style={[...baseStyles, style]}>
      {children}
    </View>
  );
};

/** `<Surface>` is the canonical name in the design plan (R3); kept as an alias of `<Card>`. */
export const Surface = Card;
export type SurfaceProps = CardProps;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    // borderRadius is supplied dynamically per `radius` prop (default 'xl').
    borderCurve: 'continuous', // Smooth squircle corners on iOS
    padding: space[4],
    gap: space[3],
  },
});
