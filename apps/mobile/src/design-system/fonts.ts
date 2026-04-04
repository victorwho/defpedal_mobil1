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

  // Roboto — body, UI labels
  'Roboto-Regular': require('../../assets/fonts/Roboto-Regular.ttf'),
  'Roboto-Medium': require('../../assets/fonts/Roboto-Medium.ttf'),
  'Roboto-SemiBold': require('../../assets/fonts/Roboto-SemiBold.ttf'),
  'Roboto-Bold': require('../../assets/fonts/Roboto-Bold.ttf'),

  // Roboto Mono — data display
  'RobotoMono-Medium': require('../../assets/fonts/RobotoMono-Medium.ttf'),
  'RobotoMono-SemiBold': require('../../assets/fonts/RobotoMono-SemiBold.ttf'),
  'RobotoMono-Bold': require('../../assets/fonts/RobotoMono-Bold.ttf'),
} as const;
