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
