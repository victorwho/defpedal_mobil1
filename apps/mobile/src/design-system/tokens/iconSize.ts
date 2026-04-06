/**
 * Design System v1.0 — Icon Size Tokens
 *
 * Standardized icon sizes for Ionicons usage across the app.
 * Sizes are derived from actual usage frequency analysis.
 *
 * Usage:
 *   <Ionicons name="close" size={iconSize.md} color={...} />
 */

export const iconSize = {
  /** Inline text icons, badges, chips (12-14px) */
  xs: 14,

  /** Secondary actions, chevrons, close buttons (16px) */
  sm: 16,

  /** Default — list items, form icons, nav actions (20px) */
  md: 20,

  /** FABs, card headers, nav bar icons (22px) */
  lg: 22,

  /** Primary actions, back buttons, prominent icons (24px) */
  xl: 24,

  /** Hero/HUD elements (32px) */
  '2xl': 32,

  /** Empty states, large placeholders (48px) */
  '3xl': 48,
} as const;
