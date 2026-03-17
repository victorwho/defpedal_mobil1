/**
 * Design System v1.0 — Font Loading
 *
 * Central map of font assets for expo-font / useFonts().
 * Keys must match the fontFamily strings used in typography.ts.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

export const fontAssets = {
  // Montserrat — headings, HUD
  'Montserrat-SemiBold': require('../../assets/fonts/Montserrat-SemiBold.ttf'),
  'Montserrat-Bold': require('../../assets/fonts/Montserrat-Bold.ttf'),
  'Montserrat-ExtraBold': require('../../assets/fonts/Montserrat-ExtraBold.ttf'),

  // DM Sans — body, UI labels
  'DMSans-Regular': require('../../assets/fonts/DMSans-Regular.ttf'),
  'DMSans-Medium': require('../../assets/fonts/DMSans-Medium.ttf'),
  'DMSans-SemiBold': require('../../assets/fonts/DMSans-SemiBold.ttf'),
  'DMSans-Bold': require('../../assets/fonts/DMSans-Bold.ttf'),

  // Roboto Mono — data display
  'RobotoMono-Medium': require('../../assets/fonts/RobotoMono-Medium.ttf'),
  'RobotoMono-SemiBold': require('../../assets/fonts/RobotoMono-SemiBold.ttf'),
  'RobotoMono-Bold': require('../../assets/fonts/RobotoMono-Bold.ttf'),
} as const;
