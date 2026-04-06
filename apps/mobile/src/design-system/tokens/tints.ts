/**
 * Design System v1.0 — Tint & Opacity Tokens
 *
 * Semi-transparent variations of brand and safety colors.
 * Use for backgrounds, overlays, and subtle highlights.
 */

// ---------------------------------------------------------------------------
// Opacity scale
// ---------------------------------------------------------------------------

export const opacity = {
  /** Barely visible — subtle hover states */
  subtle: 0.05,

  /** Light tint — card backgrounds, hover */
  light: 0.1,

  /** Medium tint — selected states, emphasis */
  medium: 0.15,

  /** Strong tint — active states, overlays */
  strong: 0.3,

  /** Glass effect — frosted overlays */
  glass: 0.86,

  /** Scrim — modal backdrops */
  scrim: 0.7,
} as const;

// ---------------------------------------------------------------------------
// Brand tints
// ---------------------------------------------------------------------------

export const brandTints = {
  /** Accent yellow with subtle opacity — hover states, subtle highlights */
  accentSubtle: 'rgba(250, 204, 21, 0.05)',

  /** Accent yellow with light opacity — card backgrounds, selected states */
  accentLight: 'rgba(250, 204, 21, 0.1)',

  /** Accent yellow with medium opacity — active states */
  accentMedium: 'rgba(250, 204, 21, 0.15)',

  /** Accent yellow with strong opacity — emphasis */
  accentStrong: 'rgba(250, 204, 21, 0.3)',
} as const;

// ---------------------------------------------------------------------------
// Safety tints
// ---------------------------------------------------------------------------

export const safetyTints = {
  /** Safe green — subtle background */
  safeSubtle: 'rgba(34, 197, 94, 0.05)',

  /** Safe green — light background */
  safeLight: 'rgba(34, 197, 94, 0.1)',

  /** Safe green — medium emphasis */
  safeMedium: 'rgba(34, 197, 94, 0.15)',

  /** Safe green — border accent */
  safeBorder: 'rgba(74, 222, 128, 0.2)',

  /** Caution amber — subtle background */
  cautionSubtle: 'rgba(245, 158, 11, 0.05)',

  /** Caution amber — light background */
  cautionLight: 'rgba(245, 158, 11, 0.1)',

  /** Caution amber — medium emphasis */
  cautionMedium: 'rgba(245, 158, 11, 0.15)',

  /** Danger red — subtle background */
  dangerSubtle: 'rgba(239, 68, 68, 0.05)',

  /** Danger red — light background */
  dangerLight: 'rgba(239, 68, 68, 0.1)',

  /** Danger red — medium emphasis (error states) */
  dangerMedium: 'rgba(239, 68, 68, 0.15)',

  /** Danger red — border accent */
  dangerBorder: 'rgba(239, 68, 68, 0.3)',

  /** Info blue — subtle background */
  infoSubtle: 'rgba(59, 130, 246, 0.05)',

  /** Info blue — light background */
  infoLight: 'rgba(59, 130, 246, 0.1)',
} as const;

// ---------------------------------------------------------------------------
// Surface tints (glass/frosted effects)
// ---------------------------------------------------------------------------

export const surfaceTints = {
  /** Dark glass — cards, sheets on dark backgrounds */
  glass: 'rgba(17, 24, 39, 0.86)',

  /** Light glass — cards on light backgrounds */
  glassLight: 'rgba(255, 255, 255, 0.85)',

  /** Scrim — modal/drawer backdrops */
  scrim: 'rgba(0, 0, 0, 0.7)',

  /** Overlay — floating elements */
  overlay: 'rgba(0, 0, 0, 0.6)',

  /** Subtle overlay — map controls */
  overlaySubtle: 'rgba(0, 0, 0, 0.5)',

  /** White subtle — light mode overlays */
  whiteSubtle: 'rgba(255, 255, 255, 0.05)',
} as const;

// ---------------------------------------------------------------------------
// Convenience export
// ---------------------------------------------------------------------------

export const tints = {
  ...brandTints,
  ...safetyTints,
  ...surfaceTints,
  opacity,
} as const;
