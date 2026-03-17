/**
 * Design System v1.0 — Border Radius Tokens
 *
 * Shape language:
 *   - Interactive elements (buttons, chips, FABs) -> full
 *   - Containers (cards, sheets, modals) -> lg or xl
 *   - Inputs -> md
 *   - Search bar -> full
 */

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;
