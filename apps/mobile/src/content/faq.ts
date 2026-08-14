import type { Locale } from '../i18n';

import { faqEn } from './faq.en';
import { faqEs } from './faq.es';
import { faqRo } from './faq.ro';
import type { FaqSections } from './faqTypes';

const FAQ_BY_LOCALE: Record<Locale, FaqSections> = {
  en: faqEn,
  ro: faqRo,
  es: faqEs,
};

/**
 * FAQ content for the given locale, falling back to English.
 */
export const getFaqSections = (locale: Locale): FaqSections =>
  FAQ_BY_LOCALE[locale] ?? faqEn;

export { FAQ_SECTION_ICONS } from './faqTypes';
export type { FaqItem, FaqItemId, FaqSection, FaqSectionId, FaqSections } from './faqTypes';
