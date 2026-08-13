/**
 * Pedal voice — shared catalog types.
 *
 * Split out of pedalVoice.ts so the per-locale catalog files
 * (pedalVoiceCatalog.{en,ro,es}.ts) can import them without a cycle.
 * pedalVoice.ts re-exports everything here, so external importers keep
 * using `@defensivepedal/core` / `./pedalVoice` unchanged.
 */

export type NudgeTrigger =
  | 'post_ride_celebration'
  | 'post_hazard_thanks'
  | 'streak_at_risk_mild'
  | 'streak_at_risk_dramatic'
  | 'daily_ride_reminder'
  | 'milestone_celebration'
  | 'badge_proximity'
  | 'lapsed_reengagement'
  | 'community_signal'
  | 'streak_lost_apology'
  | 'city_riders_pulse';

/**
 * Triggers that live in the standard per-locale catalog (voice-keyed pools,
 * per-send rotation). `city_riders_pulse` is catalogued separately: 20
 * variants per voice with its own voice-prefixed rotation (see plan doc
 * docs/plans/city-riders-pulse-notification.md §Copy).
 */
export type CatalogNudgeTrigger = Exclude<NudgeTrigger, 'city_riders_pulse'>;

export type NudgeLocale = 'en' | 'ro' | 'es';

export type NudgePriority = 0 | 1 | 2 | 3;

export interface VariantTemplate {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/**
 * The two rotating pools for one trigger in one locale. Sassy ids are
 * `v1`..`v12` (v1–v3 are the original 2026-05 lines — ids MUST stay stable,
 * nudge_log history keys the no-repeat rotation). Neutral ids are `n1`..`n6`
 * (n1 is the pre-2026-08 single neutral line). The id namespaces are
 * disjoint on purpose: a rider toggling voice carries inert history.
 */
export interface VoicePools {
  readonly sassy: readonly VariantTemplate[];
  readonly neutral: readonly VariantTemplate[];
}

export type LocaleCatalog = Record<CatalogNudgeTrigger, VoicePools>;
