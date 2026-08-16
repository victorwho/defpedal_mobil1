/**
 * Shape of the FAQ content served to the Help & FAQ screen.
 *
 * Content lives in one module per locale (`faq.en.ts`, `faq.ro.ts`,
 * `faq.es.ts`); `faq.ts` picks one by the active locale. Ids are stable
 * across locales — they key the accordion's expanded state and the React
 * lists, so switching language keeps the same item open.
 */

export type FaqSectionId = 'safety' | 'impact' | 'progression' | 'privacy';

export type FaqItemId =
  // safety
  | 'what-is-defensive-pedal'
  | 'pre-ride-check'
  | 'safe-vs-fast'
  | 'why-not-shortest'
  | 'risk-score-source'
  | 'wrong-street-color'
  | 'green-not-guaranteed'
  | 'supported-countries'
  | 'avoid-unpaved'
  | 'report-hazard'
  | 'offline-use'
  | 'voice-guidance'
  // impact
  | 'microlives'
  | 'community-seconds'
  | 'lifetime-impact'
  | 'co2-calculation'
  | 'ride-equivalents'
  // progression
  | 'xp-system'
  | 'rider-tiers'
  | 'badges'
  | 'streaks'
  | 'streak-qualifying-actions'
  // privacy
  | 'location-data'
  | 'delete-account'
  | 'analytics';

export type FaqItem = {
  id: FaqItemId;
  question: string;
  answer: string;
};

export type FaqSection = {
  id: FaqSectionId;
  title: string;
  items: FaqItem[];
};

export type FaqSections = FaqSection[];

/**
 * Section icons are locale-independent, so they live here rather than being
 * repeated (and drifting) in each translation file.
 */
export const FAQ_SECTION_ICONS: Record<FaqSectionId, string> = {
  safety: 'shield-checkmark-outline',
  impact: 'leaf-outline',
  progression: 'trophy-outline',
  privacy: 'lock-closed-outline',
};
