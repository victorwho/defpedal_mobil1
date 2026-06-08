import { describe, expect, it } from 'vitest';

import { normalizeXpAwardResult } from '../lib/xp';

// Regression coverage for the post-ride impact card bug where the tier always
// rendered as "Kickstand" with 0 progress. Root cause: the award_xp Postgres
// RPC returns snake_case JSONB (xp_awarded/total_xp/new_tier/...), but the
// handler cast it straight to the camelCase XpAwardResult contract with `as`,
// so every read returned undefined and fell back to 0 / 'kickstand'.
// normalizeXpAwardResult performs the runtime key mapping that the cast did not.

describe('normalizeXpAwardResult', () => {
  it('maps snake_case RPC fields to the camelCase contract (promoted)', () => {
    const raw = {
      xp_awarded: 150,
      total_xp: 21_350,
      old_tier: 'road_regular',
      new_tier: 'trail_blazer',
      promoted: true,
      tier_display_name: 'Trail Blazer',
      tier_tagline: 'Where you ride, others follow.',
      tier_color: '#F59E0B',
      tier_level: 6,
      tier_perk: 'Map theme customization',
    };

    expect(normalizeXpAwardResult(raw)).toEqual({
      xpAwarded: 150,
      totalXp: 21_350,
      oldTier: 'road_regular',
      newTier: 'trail_blazer',
      promoted: true,
      tierDisplayName: 'Trail Blazer',
      tierTagline: 'Where you ride, others follow.',
      tierColor: '#F59E0B',
      tierLevel: 6,
      tierPerk: 'Map theme customization',
    });
  });

  it('maps the non-promotion shape (no tier_* fields) and surfaces real total/tier', () => {
    // This is the everyday case that was previously collapsing to 0 / kickstand
    // for advanced riders: a normal ride that does not cross a tier boundary.
    const raw = {
      xp_awarded: 100,
      total_xp: 62_000,
      old_tier: 'city_guardian',
      new_tier: 'city_guardian',
      promoted: false,
    };

    const result = normalizeXpAwardResult(raw);

    expect(result?.totalXp).toBe(62_000);
    expect(result?.newTier).toBe('city_guardian');
    expect(result?.promoted).toBe(false);
    // Optional tier_* fields are absent on the non-promotion path.
    expect(result?.tierDisplayName).toBeUndefined();
    expect(result?.tierLevel).toBeUndefined();
  });

  it('returns null for nullish/non-object input (RPC returned nothing)', () => {
    expect(normalizeXpAwardResult(null)).toBeNull();
    expect(normalizeXpAwardResult(undefined)).toBeNull();
    expect(normalizeXpAwardResult('oops')).toBeNull();
    expect(normalizeXpAwardResult(42)).toBeNull();
  });

  it('coerces missing fields to safe defaults rather than NaN/undefined', () => {
    // A malformed/partial RPC payload must never produce NaN totals (which is
    // what the old `reduce(... + item.finalXp)` produced from undefined).
    const result = normalizeXpAwardResult({});

    expect(result).toEqual({
      xpAwarded: 0,
      totalXp: 0,
      oldTier: 'kickstand',
      newTier: 'kickstand',
      promoted: false,
      tierDisplayName: undefined,
      tierTagline: undefined,
      tierColor: undefined,
      tierLevel: undefined,
      tierPerk: undefined,
    });
    expect(Number.isNaN(result?.totalXp)).toBe(false);
  });
});
