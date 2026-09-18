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
  /*
   * Cool glacial blue — the shade/canopy routing identity, NOT a risk tier.
   *
   * Uses #2E86C1 rather than the solid-fill `cool` token (#1B4F72): these are
   * alpha tints that have to work over BOTH the light (#FFFFFF) and dark
   * (#1F2937) card surfaces, and a dark navy at 16% is invisible on dark.
   * #2E86C1 is the one blue in the family that clears the 3:1 non-text
   * contrast bar on both — measured 3.29:1 on the light surface and 3.05:1 on
   * the dark one. Don't swap it for `cool` or `ebike` without re-measuring:
   * `cool` scores 1.39:1 on dark and `ebike` 1.78:1 on light.
   */

  /** Cool blue — card background */
  coolLight: 'rgba(46, 134, 193, 0.16)',

  /** Cool blue — border accent */
  coolBorder: 'rgba(46, 134, 193, 0.38)',

  /**
   * Cool blue — icon and headline colour.
   *
   * Only for LARGE text (>= 18.66px bold) or non-text UI such as icons, where
   * 3:1 is the WCAG bar. Body-size text in this blue fails AA on the light
   * surface, so supporting copy uses the theme's own text colours.
   */
  coolAccent: '#2E86C1',

  /** Safe green — subtle background */
  safeSubtle: 'rgba(34, 197, 94, 0.05)',

  /** Safe green — light background */
  safeLight: 'rgba(34, 197, 94, 0.1)',

  /** Safe green — medium emphasis */
  safeMedium: 'rgba(34, 197, 94, 0.15)',

  /** Safe green — border accent */
  safeBorder: 'rgba(34, 197, 94, 0.3)',

  /** Safe green — strong border for emphasis (e.g. switch-to-safer-route CTA) */
  safeBorderStrong: 'rgba(34, 197, 94, 0.4)',

  /** Caution amber — subtle background */
  cautionSubtle: 'rgba(245, 158, 11, 0.05)',

  /** Caution amber — light background */
  cautionLight: 'rgba(245, 158, 11, 0.1)',

  /** Caution amber — medium emphasis */
  cautionMedium: 'rgba(245, 158, 11, 0.15)',

  /** Caution amber — border accent */
  cautionBorder: 'rgba(245, 158, 11, 0.3)',

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

  /** Safe green — light background (flat routing pill) */
  safeGreenLight: 'rgba(34, 197, 94, 0.12)',

  /** E-bike sky blue — light background (e-bike routing pill). Over the white glass capsule this is #D3F0FD. */
  ebikeLight: 'rgba(56, 189, 248, 0.22)',
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

  /** Track dim — subtle dark stripe for progress-bar tracks on either-theme card surfaces */
  trackDim: 'rgba(15, 23, 42, 0.12)',
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
