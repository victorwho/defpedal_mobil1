/**
 * Design System v1.0 — Spacing Tokens
 *
 * Base unit: 4px. Components snap to 8px increments.
 */

export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Layout constants from the design system spec */
export const layout = {
  /** Screen horizontal padding — both sides */
  screenHorizontalPadding: space[4], // 16px

  /** Bottom nav height — excluding safe area */
  bottomNavHeight: space[16], // 64px

  /** Search bar height — touch target minimum */
  searchBarHeight: space[12], // 48px

  /** Card minimum height — for list items */
  cardMinHeight: 56,

  /** Maximum content width — largest phone viewport */
  maxContentWidth: 428,
} as const;
