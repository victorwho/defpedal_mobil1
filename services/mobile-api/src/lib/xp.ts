import type { RiderTierName, XpAwardResult } from '@defensivepedal/core';

/**
 * Normalize the raw JSONB returned by the `award_xp` Postgres RPC into the
 * camelCase `XpAwardResult` contract.
 *
 * The RPC emits **snake_case** keys (`xp_awarded`, `total_xp`, `old_tier`,
 * `new_tier`, `tier_display_name`, …). Casting that object straight to
 * `XpAwardResult` with `as` is a TYPE-only assertion — it does no runtime
 * key mapping, so every camelCase read (`.totalXp`, `.newTier`, `.xpAwarded`)
 * silently returns `undefined`. That bug made the post-ride impact card show
 * 0 XP progress and tier 1 for everyone, because `currentTotalXp` fell back to
 * 0 and `riderTier` fell back to 'kickstand'. Always route the RPC result
 * through this mapper. Returns null when the RPC returned nothing.
 */
export function normalizeXpAwardResult(raw: unknown): XpAwardResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    xpAwarded:       Number(r.xp_awarded ?? 0),
    totalXp:         Number(r.total_xp ?? 0),
    oldTier:         String(r.old_tier ?? 'kickstand') as RiderTierName,
    newTier:         String(r.new_tier ?? 'kickstand') as RiderTierName,
    promoted:        Boolean(r.promoted ?? false),
    tierDisplayName: r.tier_display_name != null ? String(r.tier_display_name) : undefined,
    tierTagline:     r.tier_tagline != null ? String(r.tier_tagline) : undefined,
    tierColor:       r.tier_color != null ? String(r.tier_color) : undefined,
    tierLevel:       r.tier_level != null ? Number(r.tier_level) : undefined,
    tierPerk:        r.tier_perk != null ? String(r.tier_perk) : undefined,
  };
}

/** XP values for each action type. Canonical source — matches DB seeding. */
export const XP_VALUES = {
  ride_safe:       100,
  ride_fast:        70,
  hazard_report:    50,
  hazard_validate:  15,
  quiz_complete:    30,
  quiz_perfect:     20,
  trip_share:       25,
  comment:          10,
  like:              5,
  streak_day:       10,
  badge_first:      50,
  badge_bronze:     50,
  badge_silver:     75,
  badge_gold:      100,
  badge_platinum:  150,
  badge_diamond:   200,
  badge_secret:    150,
  badge_seasonal:  100,
} as const;

/** Map badge tier (0-5) to XP action key */
export function badgeTierToXpAction(tier: number, isHidden: boolean, isSeasonal: boolean): keyof typeof XP_VALUES {
  if (isHidden) return 'badge_secret';
  if (isSeasonal) return 'badge_seasonal';
  switch (tier) {
    case 0: return 'badge_first';
    case 1: return 'badge_bronze';
    case 2: return 'badge_silver';
    case 3: return 'badge_gold';
    case 4: return 'badge_platinum';
    case 5: return 'badge_diamond';
    default: return 'badge_first';
  }
}

/**
 * Calculate XP multiplier for a ride.
 * - 1.5x if first action of the day
 * - +10% per streak week (caps at +30%)
 * - 1.25x for adverse weather
 * Multipliers stack multiplicatively.
 */
export function calculateRideMultiplier(opts: {
  isFirstOfDay: boolean;
  currentStreak: number;
  weatherCondition?: string | null;
}): number {
  let mult = 1.0;

  if (opts.isFirstOfDay) {
    mult *= 1.5;
  }

  const streakWeeks = Math.min(Math.floor(opts.currentStreak / 7), 3);
  if (streakWeeks > 0) {
    mult *= 1 + streakWeeks * 0.1;
  }

  const adverse = ['rain', 'wind', 'cold', 'hot'];
  if (opts.weatherCondition && adverse.includes(opts.weatherCondition)) {
    mult *= 1.25;
  }

  return Math.round(mult * 100) / 100;
}

/** Human-readable labels for XP breakdown display */
export const XP_ACTION_LABELS: Record<string, string> = {
  ride_safe: 'Safe route ride',
  ride_fast: 'Fast route ride',
  hazard_report: 'Hazard reported',
  hazard_validate: 'Hazard validated',
  quiz_complete: 'Safety quiz completed',
  quiz_perfect: 'Perfect score bonus',
  trip_share: 'Trip shared',
  comment: 'Community comment',
  like: 'Community reaction',
  streak_day: 'Streak day bonus',
  badge_first: 'Badge earned',
  badge_bronze: 'Bronze badge earned',
  badge_silver: 'Silver badge earned',
  badge_gold: 'Gold badge earned',
  badge_platinum: 'Platinum badge earned',
  badge_diamond: 'Diamond badge earned',
  badge_secret: 'Secret badge earned',
  badge_seasonal: 'Seasonal badge earned',
};
