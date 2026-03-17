/**
 * Design System v1.0 — Shadow Tokens
 *
 * Platform-split: iOS uses shadow* properties, Android uses elevation.
 * Safety glows are iOS-only (Android doesn't support colored shadows natively).
 */
import { Platform, type ViewStyle } from 'react-native';

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

const createShadow = (
  offsetY: number,
  radius: number,
  opacity: number,
  elevation: number,
  color = '#000000',
): ShadowStyle =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    default: {
      elevation,
    },
  }) as ShadowStyle;

export const shadows = {
  /** Subtle — list items, dividers */
  sm: createShadow(1, 2, 0.3, 1),

  /** Standard — cards, floating elements */
  md: createShadow(4, 6, 0.4, 3),

  /** Prominent — bottom sheets, modals */
  lg: createShadow(10, 15, 0.5, 6),

  /** Maximum — fullscreen overlays */
  xl: createShadow(20, 25, 0.6, 10),
} as const;

/**
 * Safety glow shadows — only for map/safety elements, use sparingly.
 * iOS only — Android will get elevation fallback.
 */
export const safetyGlows = {
  safe: createShadow(0, 12, 0.4, 4, '#22C55E'),
  caution: createShadow(0, 12, 0.4, 4, '#F59E0B'),
  danger: createShadow(0, 12, 0.4, 4, '#EF4444'),
  accent: createShadow(0, 12, 0.3, 4, '#FACC15'),
} as const;
