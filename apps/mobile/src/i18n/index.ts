/**
 * Lightweight i18n system for Defensive Pedal.
 *
 * - Two locales: 'en' (default) and 'ro'
 * - Detects device locale at startup via expo-localization
 * - Persisted locale override via Zustand appStore
 * - Simple dot-path key lookup with {{variable}} interpolation
 */
import { getLocales } from 'expo-localization';

import { en, type TranslationKeys } from './en';
import { ro } from './ro';

export type Locale = 'en' | 'ro';

const translations: Record<Locale, TranslationKeys> = { en, ro };

/**
 * Detect the device's preferred locale, falling back to 'en'.
 */
export const getDeviceLocale = (): Locale => {
  const deviceLocales = getLocales();
  const primary = deviceLocales[0]?.languageCode ?? 'en';
  return primary === 'ro' ? 'ro' : 'en';
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
