/**
 * Design System v1.0 — Typography Tokens
 *
 * Three font families:
 *   - Montserrat  → Display, headings, HUD
 *   - DM Sans     → Body, UI labels, descriptions
 *   - Roboto Mono → Risk scores, distances, times, data
 *
 * Font names must match the keys used in useFonts() / expo-font loading.
 */
import type { TextStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Font family constants
// ---------------------------------------------------------------------------

export const fontFamily = {
  /** Display, headings, HUD */
  heading: {
    semiBold: 'Montserrat-SemiBold',
    bold: 'Montserrat-Bold',
    extraBold: 'Montserrat-ExtraBold',
  },

  /** Body, UI labels, descriptions */
  body: {
    regular: 'DMSans-Regular',
    medium: 'DMSans-Medium',
    semiBold: 'DMSans-SemiBold',
    bold: 'DMSans-Bold',
  },

  /** Risk scores, distances, times, data */
  mono: {
    medium: 'RobotoMono-Medium',
    semiBold: 'RobotoMono-SemiBold',
    bold: 'RobotoMono-Bold',
  },
} as const;

// ---------------------------------------------------------------------------
// Type scale
// ---------------------------------------------------------------------------

export type TypeToken = TextStyle;

/** Hero risk score overlay */
export const text4xl: TypeToken = {
  fontFamily: fontFamily.heading.extraBold,
  fontSize: 36,
  lineHeight: 36 * 1.1,
};

/** Screen titles */
export const text3xl: TypeToken = {
  fontFamily: fontFamily.heading.bold,
  fontSize: 30,
  lineHeight: 30 * 1.2,
};

/** Section headings, route name in HUD */
export const text2xl: TypeToken = {
  fontFamily: fontFamily.heading.bold,
  fontSize: 24,
  lineHeight: 24 * 1.25,
};

/** Card titles, modal headers */
export const textXl: TypeToken = {
  fontFamily: fontFamily.heading.semiBold,
  fontSize: 20,
  lineHeight: 20 * 1.3,
};

/** Subheadings, emphasized body */
export const textLg: TypeToken = {
  fontFamily: fontFamily.body.semiBold,
  fontSize: 18,
  lineHeight: 18 * 1.4,
};

/** Body text, descriptions */
export const textBase: TypeToken = {
  fontFamily: fontFamily.body.regular,
  fontSize: 16,
  lineHeight: 16 * 1.5,
};

/** Secondary text, form labels */
export const textSm: TypeToken = {
  fontFamily: fontFamily.body.regular,
  fontSize: 14,
  lineHeight: 14 * 1.5,
};

/** Badges, timestamps, captions */
export const textXs: TypeToken = {
  fontFamily: fontFamily.body.medium,
  fontSize: 12,
  lineHeight: 12 * 1.4,
};

/** Map labels, tab bar labels */
export const text2xs: TypeToken = {
  fontFamily: fontFamily.body.semiBold,
  fontSize: 10,
  lineHeight: 10 * 1.3,
};

// ---------------------------------------------------------------------------
// Data display (monospace)
// ---------------------------------------------------------------------------

/** Distance to next turn (large HUD number) */
export const textDataLg: TypeToken = {
  fontFamily: fontFamily.mono.bold,
  fontSize: 30,
  lineHeight: 30 * 1.1,
};

/** Risk score in badge */
export const textDataMd: TypeToken = {
  fontFamily: fontFamily.mono.semiBold,
  fontSize: 20,
  lineHeight: 20 * 1.2,
};

/** ETA, distance values, coordinates */
export const textDataSm: TypeToken = {
  fontFamily: fontFamily.mono.medium,
  fontSize: 14,
  lineHeight: 14 * 1.3,
};

// ---------------------------------------------------------------------------
// Convenience scale object
// ---------------------------------------------------------------------------

export const typeScale = {
  '4xl': text4xl,
  '3xl': text3xl,
  '2xl': text2xl,
  xl: textXl,
  lg: textLg,
  base: textBase,
  sm: textSm,
  xs: textXs,
  '2xs': text2xs,
  'data-lg': textDataLg,
  'data-md': textDataMd,
  'data-sm': textDataSm,
} as const;
