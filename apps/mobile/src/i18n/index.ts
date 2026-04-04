/**
 * Lightweight i18n system for Defensive Pedal.
 *
 * - Two locales: 'en' (default) and 'ro'
 * - Detects device locale via React Native NativeModules (no native dependency)
 * - Persisted locale override via Zustand appStore
 * - Simple dot-path key lookup with {{variable}} interpolation
 */
import { NativeModules, Platform } from 'react-native';

import { en, type TranslationKeys } from './en';
import { ro } from './ro';

export type Locale = 'en' | 'ro';

const translations: Record<Locale, TranslationKeys> = { en, ro };

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
  return deviceLang === 'ro' ? 'ro' : 'en';
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
