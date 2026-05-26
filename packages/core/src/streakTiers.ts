/**
 * Streak-tier mapping for the Pedal Nudge System.
 *
 * Pure functions only — no I/O, no clock, no platform APIs. Given a streak
 * day count, returns the tier metadata (flame color, mascot pose, label).
 * The mobile layer uses this to render the StreakFlame atom + StreakCard.
 *
 * Tier ladder (locked in plan section 3.2):
 *   1–6     yellow flame   + Pedal `stand`
 *   7–20    orange flame   + Pedal `cheer`
 *   21–41   red flame      + Pedal `ride`    ("commute habit")
 *   42–87   blue flame     + Pedal `climb`   ("half-marathon riding")
 *   88–99   purple flame   + Pedal `trophy`  ("binary year")
 *   100–364 gold flame     + Pedal `podium`
 *   365+    rainbow flame  + Pedal `legend`
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identifier for the streak tier. Used in telemetry + UI keying. */
export type StreakTierId =
  | 'kindling'   // 1–6
  | 'spark'      // 7–20
  | 'commute'    // 21–41
  | 'endurance'  // 42–87
  | 'binary'     // 88–99
  | 'century'    // 100–364
  | 'legend';    // 365+

import type { MascotPose } from './mascotPose';

/**
 * The subset of MascotPose used by streak tiers. Re-exports MascotPose so
 * callers can still import a single symbol.
 */
export type StreakMascotPose = Extract<
  MascotPose,
  'stand' | 'cheer' | 'ride' | 'climb' | 'trophy' | 'podium' | 'legend'
>;

/** Flame palette tier (the mobile StreakFlame atom resolves to actual hex). */
export type FlameColor =
  | 'yellow'
  | 'orange'
  | 'red'
  | 'blue'
  | 'purple'
  | 'gold'
  | 'rainbow';

export interface StreakTier {
  readonly tier: StreakTierId;
  readonly minDays: number;
  readonly maxDays: number | null; // null = open-ended (legend)
  readonly flameColor: FlameColor;
  readonly mascotPose: StreakMascotPose;
  /** Short label, e.g. "Kindling", "Commute Habit". */
  readonly label: string;
  /** Optional Pedal-themed nickname for the tier (used in milestone copy). */
  readonly nickname?: string;
}

// ---------------------------------------------------------------------------
// Tier table — the single source of truth
// ---------------------------------------------------------------------------

export const STREAK_TIERS: readonly StreakTier[] = [
  {
    tier: 'kindling',
    minDays: 1,
    maxDays: 6,
    flameColor: 'yellow',
    mascotPose: 'stand',
    label: 'Kindling',
  },
  {
    tier: 'spark',
    minDays: 7,
    maxDays: 20,
    flameColor: 'orange',
    mascotPose: 'cheer',
    label: 'Spark',
  },
  {
    tier: 'commute',
    minDays: 21,
    maxDays: 41,
    flameColor: 'red',
    mascotPose: 'ride',
    label: 'Commute Habit',
    nickname: 'commute habit',
  },
  {
    tier: 'endurance',
    minDays: 42,
    maxDays: 87,
    flameColor: 'blue',
    mascotPose: 'climb',
    label: 'Half-Marathon Riding',
    nickname: 'half-marathon riding',
  },
  {
    tier: 'binary',
    minDays: 88,
    maxDays: 99,
    flameColor: 'purple',
    mascotPose: 'trophy',
    label: 'Binary Year',
    nickname: 'binary year',
  },
  {
    tier: 'century',
    minDays: 100,
    maxDays: 364,
    flameColor: 'gold',
    mascotPose: 'podium',
    label: 'Century',
  },
  {
    tier: 'legend',
    minDays: 365,
    maxDays: null,
    flameColor: 'rainbow',
    mascotPose: 'legend',
    label: 'Legend',
  },
] as const;

/**
 * Milestone day-counts that should trigger a `milestone_celebration` nudge.
 * Locked ladder: 7 / 21 / 30 / 42 / 88 / 100 / 365 (standard + Pedal-themed).
 */
export const STREAK_MILESTONES: readonly number[] = [
  7, 21, 30, 42, 88, 100, 365,
] as const;

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Map a streak day count to its tier. Returns the `kindling` tier for 0/1
 * so callers always get a non-null tier — UI can render the dormant state
 * separately if needed.
 */
export const getTierForStreak = (days: number): StreakTier => {
  // Guard against negative or non-finite inputs.
  const safe = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;

  // 0 days = kindling tier rendering, but the UI treats it as dormant.
  if (safe <= 0) {
    return STREAK_TIERS[0]!;
  }

  for (const tier of STREAK_TIERS) {
    if (safe < tier.minDays) continue;
    if (tier.maxDays === null || safe <= tier.maxDays) {
      return tier;
    }
  }
  // Unreachable if STREAK_TIERS includes a `null`-max entry.
  return STREAK_TIERS[STREAK_TIERS.length - 1]!;
};

/**
 * Returns true when the given day count is a milestone celebration day.
 * Used by the priority queue to fire `milestone_celebration` nudges.
 */
export const isMilestoneDay = (days: number): boolean => {
  if (!Number.isFinite(days)) return false;
  return STREAK_MILESTONES.includes(Math.floor(days));
};

/**
 * Returns the next milestone day that the user is approaching (strictly
 * greater than `days`), or `null` if they're past the last milestone.
 *
 * Used by the badge-proximity-style "X days to your next milestone" copy.
 */
export const getNextMilestone = (days: number): number | null => {
  if (!Number.isFinite(days)) return STREAK_MILESTONES[0] ?? null;
  const safe = Math.max(0, Math.floor(days));
  for (const m of STREAK_MILESTONES) {
    if (m > safe) return m;
  }
  return null;
};

/**
 * Returns true when crossing from `previous` to `current` advances the
 * rider into a new tier. Lets the post-ride flow fire a tier-up animation
 * even on non-milestone days.
 */
export const didTierAdvance = (previous: number, current: number): boolean => {
  if (current <= previous) return false;
  return getTierForStreak(previous).tier !== getTierForStreak(current).tier;
};
