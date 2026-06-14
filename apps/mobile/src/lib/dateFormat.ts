/**
 * App-locale → BCP-47 tag for Intl / `toLocale*` date formatting.
 *
 * Several display helpers hardcoded `'en-US'`, so Romanian/Spanish users saw
 * English weekday/month/date labels (review 2026-06-12 a11y/i18n). Passing an
 * explicit tag (rather than `undefined`) matches the working hardcoded pattern
 * and is the safest on Hermes, whose default-locale resolution is less certain.
 */
import type { Locale } from '../i18n';

const INTL_LOCALE_TAG: Record<Locale, string> = {
  en: 'en-US',
  ro: 'ro-RO',
  es: 'es-ES',
};

export const intlLocaleTag = (locale: Locale): string =>
  INTL_LOCALE_TAG[locale] ?? 'en-US';
