/**
 * Lightweight i18n system for Defensive Pedal.
 *
 * - Three locales: 'en' (default), 'ro', 'es'
 * - Detects device locale via React Native NativeModules (no native dependency)
 * - Persisted locale override via Zustand appStore
 * - Simple dot-path key lookup with {{variable}} interpolation
 */
import { NativeModules, Platform } from 'react-native';

import { en, type TranslationKeys } from './en';
import { es } from './es';
import { ro } from './ro';

export type Locale = 'en' | 'ro' | 'es';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ro', 'es'] as const;

const translations: Record<Locale, TranslationKeys> = { en, ro, es };

/**
 * Detect the device's preferred locale, falling back to 'en'.
 * Uses React Native built-ins — no expo-localization needed.
 */
export const getDeviceLocale = (): Locale => {
  const deviceLang =
    Platform.OS === 'android'
      ? NativeModules.I18nManager?.localeIdentifier?.split('_')[0]
      : NativeModules.SettingsManager?.settings?.AppleLocale?.split('_')[0] ??
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]?.split('-')[0];
  if (deviceLang === 'ro') return 'ro';
  if (deviceLang === 'es') return 'es';
  return 'en';
};

/**
 * Detect the device locale's region code (e.g. `'RO'`, `'ES'`, `'US'`).
 *
 * Returns the uppercase two-letter region segment of the locale identifier,
 * or `null` when no region is set (e.g. `'en'` with no country) or when the
 * native module isn't available. Used by the quiz country resolver as a
 * fallback when GPS is unavailable.
 *
 * Why not `expo-localization`?
 * The existing `getDeviceLocale()` already extracts the language via
 * `NativeModules`; reusing the same path avoids adding a native module that
 * would also need an `hasExpoNativeModule` guard for bridgeless release builds
 * (see `.claude/error-log.md` #21).
 */
export const getDeviceRegion = (): string | null => {
  const identifier =
    Platform.OS === 'android'
      ? (NativeModules.I18nManager?.localeIdentifier as string | undefined)
      : ((NativeModules.SettingsManager?.settings?.AppleLocale as string | undefined) ??
          (NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] as string | undefined));

  if (!identifier) return null;

  // Locale identifiers come as `ro_RO` (Android), `en_US@calendar=gregorian`,
  // or `en-US` (some iOS variants). The region is the segment after `_` or `-`.
  const match = identifier.match(/[_-]([A-Za-z]{2})(?=[_@]|$)/);
  return match ? match[1].toUpperCase() : null;
};

/**
 * Resolve a dot-path key (e.g. "profile.title") to the translated string.
 * Supports {{variable}} interpolation.
 */
export const translate = (
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string => {
  const dict = translations[locale] ?? translations.en;

  // Walk the dot path
  const parts = key.split('.');
  let value: unknown = dict;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return key;
    value = (value as Record<string, unknown>)[part];
  }

  if (typeof value !== 'string') return key;

  // Interpolate {{variable}} placeholders
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`,
  );
};
