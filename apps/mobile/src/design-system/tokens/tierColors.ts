/**
 * Rider Tier Design Tokens
 *
 * 10-tier progression from Kickstand to Legend.
 * Tier pill is a horizontal pill (not a shield — that's for badges).
 */

export const riderTiers = {
  kickstand:    { level: 1,  displayName: 'Kickstand',    color: '#94A3B8', pillText: '#FFFFFF', xp: 0 },
  spoke:        { level: 2,  displayName: 'Spoke',        color: '#64748B', pillText: '#FFFFFF', xp: 500 },
  pedaler:      { level: 3,  displayName: 'Pedaler',      color: '#14B8A6', pillText: '#FFFFFF', xp: 2_000 },
  street_smart: { level: 4,  displayName: 'Street Smart', color: '#06B6D4', pillText: '#FFFFFF', xp: 5_000 },
  road_regular: { level: 5,  displayName: 'Road Regular', color: '#3B82F6', pillText: '#FFFFFF', xp: 10_000 },
  trail_blazer: { level: 6,  displayName: 'Trail Blazer', color: '#F59E0B', pillText: '#111827', xp: 20_000 },
  road_captain: { level: 7,  displayName: 'Road Captain', color: '#F97316', pillText: '#FFFFFF', xp: 35_000 },
  city_guardian: { level: 8, displayName: 'City Guardian', color: '#8B5CF6', pillText: '#FFFFFF', xp: 60_000 },
  iron_cyclist: { level: 9,  displayName: 'Iron Cyclist',  color: '#F43F5E', pillText: '#FFFFFF', xp: 100_000 },
  legend:       { level: 10, displayName: 'Legend',        color: '#FACC15', pillText: '#111827', xp: 150_000 },
} as const;

export type RiderTierKey = keyof typeof riderTiers;

/** Get the next tier (or null if already Legend) */
export function getNextTier(current: RiderTierKey): RiderTierKey | null {
  const entries = Object.entries(riderTiers) as [RiderTierKey, (typeof riderTiers)[RiderTierKey]][];
  const idx = entries.findIndex(([k]) => k === current);
  return idx < entries.length - 1 ? entries[idx + 1][0] : null;
}

/** Get XP progress toward next tier as 0-1 fraction */
export function getTierProgress(totalXp: number, currentTier: RiderTierKey): number {
  const current = riderTiers[currentTier];
  const next = getNextTier(currentTier);
  if (!next) return 1; // Legend = 100%
  const nextDef = riderTiers[next];
  const range = nextDef.xp - current.xp;
  const progress = totalXp - current.xp;
  return Math.min(Math.max(progress / range, 0), 1);
}

/** Get XP remaining to reach next tier */
export function getXpToNextTier(totalXp: number, currentTier: RiderTierKey): number | null {
  const next = getNextTier(currentTier);
  if (!next) return null;
  return riderTiers[next].xp - totalXp;
}
