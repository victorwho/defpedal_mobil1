/**
 * Celebration-stage coordination (review 2026-06-12, P2).
 *
 * The post-ride celebration overlays — badge unlock, tier rank-up, and the
 * one-time "meet Pedal" card — used to render as independent root-level
 * siblings, each gated only on `appState !== 'NAVIGATING'`. After a first
 * ride a brand-new user typically triggers ALL THREE at once (First Ride +
 * Confident Cyclist badges, the Kickstand→first-tier promotion, and the
 * MeetPedal card), so they stacked on top of each other and over the impact
 * summary the user was actually trying to read.
 *
 * The coordinator gives them a single shared "stage": each overlay registers
 * whether it currently WANTS to show, and exactly one — the highest-priority
 * wanter — holds the stage at any moment. The holder is sticky: a
 * higher-priority overlay that becomes available later does NOT preempt one
 * that's already showing; it waits its turn. When the holder stops wanting
 * (its overlay is dismissed / its queue drains), the next-highest wanter
 * takes the stage.
 *
 * Pure helpers live here so the priority/stickiness logic is unit-testable
 * without the store or React.
 */

export type CelebrationKind = 'badge' | 'rankup' | 'meetpedal';

/** Highest priority first. */
export const CELEBRATION_PRIORITY: readonly CelebrationKind[] = [
  'badge',
  'rankup',
  'meetpedal',
];

export type CelebrationWants = Record<CelebrationKind, boolean>;

export const INITIAL_CELEBRATION_WANTS: CelebrationWants = {
  badge: false,
  rankup: false,
  meetpedal: false,
};

/**
 * Given the current stage holder and the set of overlays that want to show,
 * return who should hold the stage next.
 *
 *   - If the current holder still wants the stage, it keeps it (sticky — no
 *     preemption of a showing overlay).
 *   - Otherwise the highest-priority wanter takes the stage (or null if none).
 */
export const resolveActiveCelebration = (
  current: CelebrationKind | null,
  wants: CelebrationWants,
): CelebrationKind | null => {
  if (current && wants[current]) return current;
  return CELEBRATION_PRIORITY.find((kind) => wants[kind]) ?? null;
};
