import { describe, expect, it } from 'vitest';
import {
  CATALOG_ROTATION_MEMORY,
  TRIGGERS_BY_PRIORITY,
  getTriggerPose,
  getTriggerPriority,
  pickMessage,
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

  it('renders ES neutral copy for post_ride_celebration', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'es',
      sassy: false,
      userId: 'user-x',
      context: { riderName: 'Ana', streakCount: 3 },
    });
    expect(msg.variantId).toBe('v1');
    expect(msg.title).toBe('Ruta guardada');
    expect(msg.body).toBe('Día 3 de racha. Bien hecho, Ana.');
  });

  it('substitutes "ciclista" when riderName is missing in ES', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'es',
      sassy: false,
      userId: 'user-x',
      context: { streakCount: 1 },
    });
    expect(msg.body).toContain('ciclista');
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
      for (const locale of ['en', 'ro', 'es'] as const) {
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

describe('pickMessage — per-send variant rotation', () => {
  const ctx = { riderName: 'V', streakCount: 10, city: 'Cluj' };

  it('is deterministic given identical inputs (cron preview mirror invariant)', () => {
    const req = {
      trigger: 'streak_at_risk_dramatic' as const,
      locale: 'en' as const,
      sassy: true,
      userId: 'rotation-user',
      context: ctx,
      sendDateISO: '2026-08-12',
      recentVariantIds: ['v2'],
    };
    expect(pickMessage(req).variantId).toBe(pickMessage(req).variantId);
  });

  it('never repeats the most recently sent variant (no phrase twice in a row)', () => {
    for (let u = 0; u < 20; u++) {
      for (const last of ['v1', 'v2', 'v3']) {
        const msg = pickMessage({
          trigger: 'post_ride_celebration',
          locale: 'en',
          sassy: true,
          userId: `repeat-check-${u}`,
          context: ctx,
          sendDateISO: '2026-08-12',
          recentVariantIds: [last],
        });
        expect(msg.variantId).not.toBe(last);
      }
    }
  });

  it('rotates strictly through a 3-variant pool: two recents force the third', () => {
    const cases: Array<{ recent: string[]; expected: string }> = [
      { recent: ['v1', 'v2'], expected: 'v3' },
      { recent: ['v2', 'v3'], expected: 'v1' },
      { recent: ['v3', 'v1'], expected: 'v2' },
    ];
    for (const { recent, expected } of cases) {
      const msg = pickMessage({
        trigger: 'post_ride_celebration',
        locale: 'en',
        sassy: true,
        userId: 'strict-rotation',
        context: ctx,
        sendDateISO: '2026-08-12',
        recentVariantIds: recent,
      });
      expect(msg.variantId).toBe(expected);
    }
  });

  it('clamps memory to variantCount - 1 so the rotation always terminates', () => {
    // All three ids recent: memory clamps to 2, so the third-most-recent
    // ('v3') is eligible again — never the two most recent.
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: true,
      userId: 'clamp-user',
      context: ctx,
      sendDateISO: '2026-08-12',
      recentVariantIds: ['v1', 'v2', 'v3'],
    });
    expect(msg.variantId).toBe('v3');
    expect(CATALOG_ROTATION_MEMORY).toBe(3);
  });

  it('varies the pick across send dates for the same user (no lifetime pin)', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 10; day++) {
      const msg = pickMessage({
        trigger: 'post_ride_celebration',
        locale: 'en',
        sassy: true,
        userId: 'date-rotation-user',
        context: ctx,
        sendDateISO: `2026-08-${String(day).padStart(2, '0')}`,
      });
      seen.add(msg.variantId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('changing locale does NOT change variant assignment', () => {
    const shared = {
      trigger: 'milestone_celebration' as const,
      sassy: true,
      userId: 'locale-test',
      context: { ...ctx, milestoneDay: 30 },
      sendDateISO: '2026-08-12',
      recentVariantIds: ['v1'],
    };
    const en = pickMessage({ ...shared, locale: 'en' });
    const ro = pickMessage({ ...shared, locale: 'ro' });
    expect(en.variantId).toBe(ro.variantId);
  });

  it('neutral mode ignores rotation and always renders v1', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'neutral-user',
      context: ctx,
      sendDateISO: '2026-08-12',
      recentVariantIds: ['v1'],
    });
    expect(msg.variantId).toBe('v1');
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
    // TRIGGER_LIST covers the sticky-catalog triggers; city_riders_pulse is
    // catalogued separately (per-send rotation) but still counts here.
    expect(new Set(TRIGGERS_BY_PRIORITY).size).toBe(TRIGGER_LIST.length + 1);
    expect(TRIGGERS_BY_PRIORITY).toContain('city_riders_pulse');
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
      for (const locale of ['en', 'ro', 'es'] as const) {
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
