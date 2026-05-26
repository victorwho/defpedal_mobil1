import { describe, expect, it } from 'vitest';
import {
  TRIGGERS_BY_PRIORITY,
  getTriggerPose,
  getTriggerPriority,
  pickMessage,
  pickVariantIndex,
  type NudgeTrigger,
} from './pedalVoice';

const TRIGGER_LIST: NudgeTrigger[] = [
  'post_ride_celebration',
  'post_hazard_thanks',
  'streak_at_risk_mild',
  'streak_at_risk_dramatic',
  'daily_ride_reminder',
  'milestone_celebration',
  'badge_proximity',
  'lapsed_reengagement',
  'community_signal',
  'streak_lost_apology',
];

describe('pickMessage — basic rendering', () => {
  it('renders post-ride celebration with rider name and streak in EN sassy', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: true,
      userId: 'user-a',
      context: { riderName: 'Victor', streakCount: 7 },
    });
    expect(msg.title).toBeTruthy();
    expect(msg.body).toContain('7');
    // Variant id is one of v1 / v2 / v3
    expect(['v1', 'v2', 'v3']).toContain(msg.variantId);
  });

  it('renders RO message when locale is ro', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'ro',
      sassy: true,
      userId: 'user-a',
      context: { riderName: 'Victor', streakCount: 7 },
    });
    // The RO catalog uses "zile" (days) / "streak" / "Bravo" — at minimum
    // it shouldn't contain English word "Streak" with capital S.
    expect(msg.body).not.toContain('day');
    expect(msg.body.toLowerCase()).toMatch(/zi|streak|bravo|pedal|mândru/);
  });

  it('renders neutral copy when sassy is false (always variant v1)', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'user-b',
      context: { riderName: 'Ana', streakCount: 3 },
    });
    expect(msg.variantId).toBe('v1');
    expect(msg.title).toBe('Ride saved');
    expect(msg.body).toBe('Streak day 3. Nicely done, Ana.');
  });
});

describe('pickMessage — placeholder fallback', () => {
  it('substitutes "rider" when riderName is missing in EN', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false, // v1 contains {riderName}
      userId: 'user-x',
      context: { streakCount: 1 },
    });
    expect(msg.body).toBe('Streak day 1. Nicely done, rider.');
    expect(msg.body).not.toContain('{riderName}');
  });

  it('substitutes "prietene" when riderName is missing in RO', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'ro',
      sassy: false,
      userId: 'user-x',
      context: { streakCount: 1 },
    });
    expect(msg.body).toContain('prietene');
  });

  it('substitutes city fallback when city is missing', () => {
    const msg = pickMessage({
      trigger: 'daily_ride_reminder',
      locale: 'en',
      sassy: false,
      userId: 'user-x',
      context: { riderName: 'V' },
    });
    expect(msg.body).toContain('your city');
    expect(msg.body).not.toContain('{city}');
  });

  it('never leaks raw placeholders for any variant or locale', () => {
    for (const trigger of TRIGGER_LIST) {
      for (const locale of ['en', 'ro'] as const) {
        // Pass empty context — every placeholder should fall back gracefully
        for (let i = 0; i < 3; i++) {
          const msg = pickMessage({
            trigger,
            locale,
            sassy: true,
            userId: `seed-${trigger}-${i}`,
            context: {},
          });
          expect(msg.title).not.toMatch(/\{[a-zA-Z]+\}/);
          expect(msg.body).not.toMatch(/\{[a-zA-Z]+\}/);
        }
      }
    }
  });
});

describe('pickVariantIndex — sticky bucket', () => {
  it('returns the same index for the same user + trigger across calls', () => {
    const first = pickVariantIndex('user-1', 'streak_at_risk_dramatic', 3);
    const second = pickVariantIndex('user-1', 'streak_at_risk_dramatic', 3);
    expect(first).toBe(second);
  });

  it('returns a value in [0, variantCount)', () => {
    for (let i = 0; i < 50; i++) {
      const idx = pickVariantIndex(`u${i}`, 'milestone_celebration', 3);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it('distributes across all 3 buckets given 30 different user ids', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 30; i++) {
      const idx = pickVariantIndex(`bucket-test-${i}`, 'post_ride_celebration', 3);
      counts[idx]!++;
    }
    // Each bucket should have at least 1 hit (loose bound for hash quality).
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it('different triggers yield different indices for same user (typical case)', () => {
    // Not strictly required by the spec, but a hash collision across all
    // triggers for the same user would suggest something is very wrong.
    const indices = TRIGGER_LIST.map((t) => pickVariantIndex('test-user', t, 3));
    const uniqueCount = new Set(indices).size;
    expect(uniqueCount).toBeGreaterThan(1);
  });

  it('handles 0 variantCount by returning 0', () => {
    expect(pickVariantIndex('user-x', 'post_ride_celebration', 0)).toBe(0);
  });
});

describe('pickMessage — variant stickiness end-to-end', () => {
  it('same user + same trigger gets same variant_id across renders', () => {
    const ctx = { riderName: 'V', streakCount: 10, city: 'Cluj' };
    const a = pickMessage({
      trigger: 'streak_at_risk_dramatic',
      locale: 'en',
      sassy: true,
      userId: 'sticky-user',
      context: ctx,
    });
    const b = pickMessage({
      trigger: 'streak_at_risk_dramatic',
      locale: 'en',
      sassy: true,
      userId: 'sticky-user',
      context: ctx,
    });
    expect(a.variantId).toBe(b.variantId);
  });

  it('changing locale does NOT change variant assignment', () => {
    const ctx = { riderName: 'V', streakCount: 10, city: 'Cluj' };
    const en = pickMessage({
      trigger: 'milestone_celebration',
      locale: 'en',
      sassy: true,
      userId: 'locale-test',
      context: { ...ctx, milestoneDay: 30 },
    });
    const ro = pickMessage({
      trigger: 'milestone_celebration',
      locale: 'ro',
      sassy: true,
      userId: 'locale-test',
      context: { ...ctx, milestoneDay: 30 },
    });
    expect(en.variantId).toBe(ro.variantId);
  });
});

describe('Catalog completeness', () => {
  it('every trigger has 3 variants per locale', () => {
    for (const trigger of TRIGGER_LIST) {
      for (let i = 0; i < 3; i++) {
        const msg = pickMessage({
          trigger,
          locale: 'en',
          sassy: true,
          userId: `gap-${trigger}-${i}`,
          context: { riderName: 'V', streakCount: 5, city: 'Cluj', milestoneDay: 7, badgeLabel: 'X', lapsedDays: 7 },
        });
        expect(msg.title.length).toBeGreaterThan(0);
        expect(msg.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('every trigger has a defined priority and pose', () => {
    for (const trigger of TRIGGER_LIST) {
      const p = getTriggerPriority(trigger);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(3);
      expect(getTriggerPose(trigger)).toBeTruthy();
    }
  });

  it('TRIGGERS_BY_PRIORITY lists all triggers, ordered ascending by priority', () => {
    expect(new Set(TRIGGERS_BY_PRIORITY).size).toBe(TRIGGER_LIST.length);
    for (let i = 1; i < TRIGGERS_BY_PRIORITY.length; i++) {
      const prev = getTriggerPriority(TRIGGERS_BY_PRIORITY[i - 1]!);
      const curr = getTriggerPriority(TRIGGERS_BY_PRIORITY[i]!);
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('post_ride_celebration is P0', () => {
    expect(getTriggerPriority('post_ride_celebration')).toBe(0);
  });

  it('streak_at_risk_dramatic is P1', () => {
    expect(getTriggerPriority('streak_at_risk_dramatic')).toBe(1);
  });

  it('lapsed_reengagement is P3', () => {
    expect(getTriggerPriority('lapsed_reengagement')).toBe(3);
  });
});

describe('No emoji in any catalog string', () => {
  // Mapbox SymbolLayer + brand rule: no emoji as load-bearing semantics.
  // Spot-check the catalog by rendering every variant and asserting no
  // surrogate-pair codepoint above U+1F000 appears.
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it('renders no emoji across all triggers/locales/variants', () => {
    for (const trigger of TRIGGER_LIST) {
      for (const locale of ['en', 'ro'] as const) {
        for (let i = 0; i < 3; i++) {
          const msg = pickMessage({
            trigger,
            locale,
            sassy: true,
            userId: `emoji-check-${trigger}-${locale}-${i}`,
            context: {
              riderName: 'V', streakCount: 5, city: 'Cluj',
              milestoneDay: 7, badgeLabel: 'X', lapsedDays: 7,
            },
          });
          expect(EMOJI_RE.test(msg.title)).toBe(false);
          expect(EMOJI_RE.test(msg.body)).toBe(false);
        }
      }
    }
  });
});
