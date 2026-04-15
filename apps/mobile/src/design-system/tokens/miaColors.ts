/**
 * Design System — Mia Journey Level Colors
 *
 * Level-specific color palettes used in the MiaLevelUpOverlay
 * particle burst, badge circle, and progress indicators.
 */

export const miaLevelColors = {
  level2: { primary: '#22C55E', secondary: '#4ADE80', particle: '#86EFAC' },
  level3: { primary: '#F59E0B', secondary: '#FBBF24', particle: '#FDE68A' },
  level4: { primary: '#3B82F6', secondary: '#60A5FA', particle: '#93C5FD' },
  level5: { primary: '#FACC15', secondary: '#FDE68A', particle: '#FEF9C3' },
} as const;

export type MiaLevelColorKey = keyof typeof miaLevelColors;
