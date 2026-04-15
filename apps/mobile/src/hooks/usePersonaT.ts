import { useCallback } from 'react';

import { translate, type Locale } from '../i18n';
import { useAppStore } from '../store/appStore';

/**
 * Persona-aware translation hook.
 *
 * When the active persona is 'mia', keys are first resolved as `mia.${key}`.
 * If the mia-prefixed key exists (i.e. translate returns something other than
 * the raw key), the persona copy is used. Otherwise falls back to the standard
 * key — identical to useT().
 *
 * Usage:
 *   const t = usePersonaT();
 *   <Text>{t('planning.emptyState')}</Text>
 *   // → If persona is 'mia' and 'mia.planning.emptyState' exists,
 *   //   returns the Mia copy. Otherwise returns the standard string.
 */
export const usePersonaT = () => {
  const locale = useAppStore((state) => state.locale) as Locale;
  const persona = useAppStore((state) => state.persona);

  return useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      if (persona === 'mia') {
        const miaKey = `mia.${key}`;
        const miaResult = translate(locale, miaKey, vars);
        // translate() returns the raw key when the path doesn't resolve
        if (miaResult !== miaKey) {
          return miaResult;
        }
      }
      return translate(locale, key, vars);
    },
    [locale, persona],
  );
};
