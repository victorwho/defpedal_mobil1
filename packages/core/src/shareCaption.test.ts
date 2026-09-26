import { describe, expect, it } from 'vitest';

import { IOS_APP_STORE_ID, appStoreUrl, buildShareCaption } from './shareCaption';

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
      'Unlocked the First 100 km milestone on Defensive Pedal (100 km total). #DefensivePedal https://play.google.com/store/apps/details?id=com.defensivepedal.mobile&pcampaignid=web_share',
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
      'Just earned the Commuter badge on Defensive Pedal. #DefensivePedal https://play.google.com/store/apps/details?id=com.defensivepedal.mobile&pcampaignid=web_share',
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
  });

  it('always appends the public Play Store install URL', () => {
    const expectedUrl =
      'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile&pcampaignid=web_share';

    const ride = buildShareCaption({
      type: 'ride',
      distanceKm: 1,
      durationMinutes: 1,
      co2SavedKg: 0.1,
    });
    expect(ride).toContain(expectedUrl);

    const milestone = buildShareCaption({
      type: 'milestone',
      milestoneTitle: 'x',
      milestoneValue: 'y',
    });
    expect(milestone).toContain(expectedUrl);

    const badge = buildShareCaption({
      type: 'badge',
      badgeName: 'x',
    });
    expect(badge).toContain(expectedUrl);
  });
});

// ---------------------------------------------------------------------------
// appStoreUrl
//
// The web share page's iOS button was a disabled "Coming to iOS" placeholder
// that outlived the actual release by a month. Replacing it turned up something
// worth pinning: the app is deliberately NOT sold in the United States, and a
// country-less Apple URL resolves to the US storefront — so the obvious
// `https://apps.apple.com/app/id<id>` 404s for EVERY visitor. Verified against
// Apple's iTunes lookup (`country=us` -> resultCount 0) and by following
// redirects: bare and /us/ both 404, /ro/ and /gb/ both 200 (2026-09-26).
// ---------------------------------------------------------------------------

describe('appStoreUrl', () => {
  it('always includes a storefront segment — the bare form 404s', () => {
    // This is the assertion that matters: never emit apps.apple.com/app/id...
    expect(appStoreUrl('ro')).toBe(
      `https://apps.apple.com/ro/app/defensive-pedal/id${IOS_APP_STORE_ID}`,
    );
    expect(appStoreUrl('ro')).not.toMatch(/apple\.com\/app\//);
  });

  it('lowercases the storefront, since Apple paths are lowercase', () => {
    expect(appStoreUrl('GB')).toContain('/gb/app/');
  });

  it('defaults to a supported English-language storefront', () => {
    // Must never default to 'us': the app is not available there.
    expect(appStoreUrl()).toContain('/gb/app/');
    expect(appStoreUrl()).not.toContain('/us/');
  });
});
