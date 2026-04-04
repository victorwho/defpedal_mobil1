import { useCallback } from 'react';

import { translate, type Locale } from '../i18n';
import { useAppStore } from '../store/appStore';

/**
 * Returns a `t()` function bound to the current locale.
 *
 * Usage:
 *   const t = useT();
 *   <Text>{t('profile.title')}</Text>
 *   <Text>{t('nav.inMeters', { distance: 200, instruction: 'turn left' })}</Text>
 */
export const useT = () => {
  const locale = useAppStore((state) => state.locale) as Locale;
  return useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );
};

/**
 * Returns the current locale and setter.
 */
export const useLocale = () => {
  const locale = useAppStore((state) => state.locale) as Locale;
  const setLocale = useAppStore((state) => state.setLocale);
  return { locale, setLocale };
};
