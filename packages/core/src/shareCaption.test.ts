import { describe, expect, it } from 'vitest';

import { buildShareCaption } from './shareCaption';

describe('buildShareCaption — ride', () => {
  it('produces the baseline ride caption with required fields', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 12.34,
      durationMinutes: 47.8,
      co2SavedKg: 1.48,
    });

    // Distance rounded to 1 decimal (12.3)
    expect(caption).toContain('12.3 km');
    // Duration rounded to whole minutes (48)
    expect(caption).toContain('48 min');
    // CO2 rounded to 1 decimal (1.5)
    expect(caption).toContain('1.5 kg CO₂ saved');
    expect(caption).toContain('#DefensivePedal');
    expect(caption).toContain('#SaferCycling');
    // No optional hashtags when those fields are absent
    expect(caption).not.toContain('#SafetyScore');
    expect(caption).not.toContain('#LifeEarned');
  });

  it('appends #SafetyScore{N} when safetyScore is provided', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 10,
      durationMinutes: 30,
      co2SavedKg: 1.2,
      safetyScore: 87,
    });
    expect(caption).toContain('#SafetyScore87');
  });

  it('appends #LifeEarned when microlivesGained > 0', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 10,
      durationMinutes: 30,
      co2SavedKg: 1.2,
      microlivesGained: 3,
    });
    expect(caption).toContain('#LifeEarned');
  });

  it('does NOT append #LifeEarned when microlivesGained is 0', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 10,
      durationMinutes: 30,
      co2SavedKg: 1.2,
      microlivesGained: 0,
    });
    expect(caption).not.toContain('#LifeEarned');
  });

  it('appends both #SafetyScore and #LifeEarned when both present', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 5.5,
      durationMinutes: 20,
      co2SavedKg: 0.66,
      safetyScore: 92,
      microlivesGained: 1,
    });
    expect(caption).toContain('#SafetyScore92');
    expect(caption).toContain('#LifeEarned');
    expect(caption).toContain('#SaferCycling');
  });

  it('handles integer distances without unnecessary decimals', () => {
    const caption = buildShareCaption({
      type: 'ride',
      distanceKm: 10,
      durationMinutes: 30,
      co2SavedKg: 1,
    });
    expect(caption).toContain('10 km');
    expect(caption).toContain('1 kg CO₂ saved');
  });
});

describe('buildShareCaption — milestone', () => {
  it('renders milestone title and value', () => {
    const caption = buildShareCaption({
      type: 'milestone',
      milestoneTitle: 'First 100 km',
      milestoneValue: '100 km total',
    });

    expect(caption).toBe(
      'Unlocked the First 100 km milestone on Defensive Pedal (100 km total). #DefensivePedal',
    );
  });
});

describe('buildShareCaption — badge', () => {
  it('renders a minimal badge caption without tier or rarity', () => {
    const caption = buildShareCaption({
      type: 'badge',
      badgeName: 'Commuter',
    });

    expect(caption).toBe(
      'Just earned the Commuter badge on Defensive Pedal. #DefensivePedal',
    );
  });

  it('includes tier and rarity when provided', () => {
    const caption = buildShareCaption({
      type: 'badge',
      badgeName: 'Hazard Hunter',
      tier: 'Gold',
      rarity: 'Epic',
    });

    expect(caption).toContain('Hazard Hunter badge');
    expect(caption).toContain('Gold');
    expect(caption).toContain('Epic');
    expect(caption).toContain('#DefensivePedal');
  });

  it('handles tier without rarity', () => {
    const caption = buildShareCaption({
      type: 'badge',
      badgeName: 'Streak Master',
      tier: 'Silver',
    });

    expect(caption).toContain('Streak Master badge');
    expect(caption).toContain('Silver');
    expect(caption).not.toContain('undefined');
  });

  it('handles rarity without tier', () => {
    const caption = buildShareCaption({
      type: 'badge',
      badgeName: 'First Ride',
      rarity: 'Common',
    });

    expect(caption).toContain('First Ride badge');
    expect(caption).toContain('Common');
    expect(caption).not.toContain('undefined');
  });
});

describe('buildShareCaption — mia', () => {
  it('renders level number and title with Mia hashtag', () => {
    const caption = buildShareCaption({
      type: 'mia',
      level: 3,
      levelTitle: 'Confident Rider',
    });

    expect(caption).toBe(
      'Level 3: Confident Rider on Defensive Pedal. Riding safer every day. #DefensivePedal #MiaJourney',
    );
  });
});

describe('buildShareCaption — English-only', () => {
  it('always returns English even though the project supports i18n elsewhere', () => {
    // This is more of a spec guardrail — the function takes no locale input,
    // so the output is deterministic. Assert the known English phrases.
    const ride = buildShareCaption({
      type: 'ride',
      distanceKm: 1,
      durationMinutes: 1,
      co2SavedKg: 0.1,
    });
    expect(ride).toMatch(/I just rode/);
    expect(ride).toMatch(/kg CO₂ saved/);

    const milestone = buildShareCaption({
      type: 'milestone',
      milestoneTitle: 'x',
      milestoneValue: 'y',
    });
    expect(milestone).toMatch(/Unlocked the/);

    const badge = buildShareCaption({
      type: 'badge',
      badgeName: 'x',
    });
    expect(badge).toMatch(/Just earned the/);

    const mia = buildShareCaption({
      type: 'mia',
      level: 1,
      levelTitle: 'x',
    });
    expect(mia).toMatch(/Riding safer every day/);
  });
});
