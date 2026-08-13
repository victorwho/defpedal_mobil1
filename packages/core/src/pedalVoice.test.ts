import { describe, expect, it } from 'vitest';
import {
  CATALOG_NEUTRAL_VARIANT_COUNT,
  CATALOG_ROTATION_MEMORY,
  CATALOG_SASSY_VARIANT_COUNT,
  TRIGGERS_BY_PRIORITY,
  getCatalogPools,
  getTriggerPose,
  getTriggerPriority,
  pickMessage,
  type CatalogNudgeTrigger,
  type NudgeLocale,
} from './pedalVoice';

const TRIGGER_LIST: CatalogNudgeTrigger[] = [
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

const LOCALES: NudgeLocale[] = ['en', 'ro', 'es'];

const SASSY_ID_RE = /^v([1-9]|1[0-2])$/;
const NEUTRAL_ID_RE = /^n[1-6]$/;

/** Force the rotation onto one specific variant by marking all others recent. */
const allIdsExcept = (
  trigger: CatalogNudgeTrigger,
  voice: 'sassy' | 'neutral',
  keepId: string,
): string[] =>
  getCatalogPools(trigger, 'en')
    [voice].map((v) => v.id)
    .filter((id) => id !== keepId);

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
    expect(msg.variantId).toMatch(SASSY_ID_RE);
  });

  it('renders RO message when locale is ro', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'ro',
      sassy: true,
      userId: 'user-a',
      context: { riderName: 'Victor', streakCount: 7 },
    });
    // The RO catalog talks about "zile" (days) — at minimum it shouldn't
    // contain the English word "day".
    expect(msg.body).not.toContain('day');
  });

  it('renders neutral copy from the neutral pool when sassy is false', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'user-b',
      context: { riderName: 'Ana', streakCount: 3 },
    });
    expect(msg.variantId).toMatch(NEUTRAL_ID_RE);
  });

  it('keeps the legacy n1 neutral line reachable (rotation forced onto n1)', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'user-b',
      context: { riderName: 'Ana', streakCount: 3 },
      recentVariantIds: allIdsExcept('post_ride_celebration', 'neutral', 'n1'),
    });
    expect(msg.variantId).toBe('n1');
    expect(msg.title).toBe('Ride saved');
    expect(msg.body).toBe('Streak day 3. Nicely done, Ana.');
  });
});

describe('pickMessage — placeholder fallback', () => {
  const forceN1 = allIdsExcept('post_ride_celebration', 'neutral', 'n1');

  it('substitutes "rider" when riderName is missing in EN', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'user-x',
      context: { streakCount: 1 },
      recentVariantIds: forceN1,
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
      recentVariantIds: forceN1,
    });
    expect(msg.body).toContain('prietene');
  });

  it('renders ES neutral n1 copy for post_ride_celebration', () => {
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'es',
      sassy: false,
      userId: 'user-x',
      context: { riderName: 'Ana', streakCount: 3 },
      recentVariantIds: forceN1,
    });
    expect(msg.variantId).toBe('n1');
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
      recentVariantIds: forceN1,
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
      recentVariantIds: allIdsExcept('daily_ride_reminder', 'neutral', 'n1'),
    });
    expect(msg.body).toContain('your city');
    expect(msg.body).not.toContain('{city}');
  });

  it('never leaks raw placeholders for any variant or locale', () => {
    // Every {token} in every raw template must be a key the renderer knows,
    // otherwise it would leak to the user verbatim.
    const KNOWN = new Set([
      'riderName',
      'streakCount',
      'milestoneDay',
      'city',
      'badgeLabel',
      'lapsedDays',
      'n',
    ]);
    for (const trigger of TRIGGER_LIST) {
      for (const locale of LOCALES) {
        const pools = getCatalogPools(trigger, locale);
        for (const variant of [...pools.sassy, ...pools.neutral]) {
          for (const text of [variant.title, variant.body]) {
            for (const match of text.matchAll(/\{([a-zA-Z]+)\}/g)) {
              expect(
                KNOWN.has(match[1]!),
                `unknown placeholder {${match[1]}} in ${trigger}/${locale}/${variant.id}`,
              ).toBe(true);
            }
          }
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
    const sassyIds = getCatalogPools('post_ride_celebration', 'en').sassy.map((v) => v.id);
    for (let u = 0; u < 20; u++) {
      for (const last of sassyIds) {
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

  it('sassy rotation avoids everything inside the 6-send memory window', () => {
    const recent = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
    for (let u = 0; u < 20; u++) {
      const msg = pickMessage({
        trigger: 'post_ride_celebration',
        locale: 'en',
        sassy: true,
        userId: `window-check-${u}`,
        context: ctx,
        sendDateISO: '2026-08-12',
        recentVariantIds: recent,
      });
      expect(recent).not.toContain(msg.variantId);
    }
  });

  it('neutral rotates strictly: five recents force the sixth line', () => {
    // Neutral pools have 6 variants; memory clamps to 5, so listing five ids
    // as recent deterministically forces the remaining one.
    const cases: Array<{ recent: string[]; expected: string }> = [
      { recent: ['n1', 'n2', 'n3', 'n4', 'n5'], expected: 'n6' },
      { recent: ['n2', 'n3', 'n4', 'n5', 'n6'], expected: 'n1' },
      { recent: ['n6', 'n1', 'n2', 'n3', 'n4'], expected: 'n5' },
    ];
    for (const { recent, expected } of cases) {
      const msg = pickMessage({
        trigger: 'post_ride_celebration',
        locale: 'en',
        sassy: false,
        userId: 'strict-neutral-rotation',
        context: ctx,
        sendDateISO: '2026-08-12',
        recentVariantIds: recent,
      });
      expect(msg.variantId).toBe(expected);
    }
  });

  it('neutral never repeats the most recent line (the old always-n1 pin is gone)', () => {
    const neutralIds = getCatalogPools('post_ride_celebration', 'en').neutral.map((v) => v.id);
    for (let u = 0; u < 20; u++) {
      for (const last of neutralIds) {
        const msg = pickMessage({
          trigger: 'post_ride_celebration',
          locale: 'en',
          sassy: false,
          userId: `neutral-repeat-${u}`,
          context: ctx,
          sendDateISO: '2026-08-12',
          recentVariantIds: [last],
        });
        expect(msg.variantId).not.toBe(last);
      }
    }
  });

  it('clamps memory below the pool size so the rotation always terminates', () => {
    // Every neutral id marked recent: memory clamps to 5, so the OLDEST
    // recent id ('n6', position 6 in the list) is eligible again — the
    // rotation can never dead-end.
    const msg = pickMessage({
      trigger: 'post_ride_celebration',
      locale: 'en',
      sassy: false,
      userId: 'clamp-user',
      context: ctx,
      sendDateISO: '2026-08-12',
      recentVariantIds: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
    });
    expect(msg.variantId).toBe('n6');
    expect(CATALOG_ROTATION_MEMORY).toBe(6);
  });

  it('varies the pick across send dates for the same user (no lifetime pin)', () => {
    for (const sassy of [true, false]) {
      const seen = new Set<string>();
      for (let day = 1; day <= 10; day++) {
        const msg = pickMessage({
          trigger: 'post_ride_celebration',
          locale: 'en',
          sassy,
          userId: 'date-rotation-user',
          context: ctx,
          sendDateISO: `2026-08-${String(day).padStart(2, '0')}`,
        });
        seen.add(msg.variantId);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
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
});

describe('Catalog completeness', () => {
  it('every trigger has 12 sassy + 6 neutral variants in every locale', () => {
    for (const trigger of TRIGGER_LIST) {
      for (const locale of LOCALES) {
        const pools = getCatalogPools(trigger, locale);
        expect(pools.sassy, `${trigger}/${locale} sassy`).toHaveLength(
          CATALOG_SASSY_VARIANT_COUNT,
        );
        expect(pools.neutral, `${trigger}/${locale} neutral`).toHaveLength(
          CATALOG_NEUTRAL_VARIANT_COUNT,
        );
        for (const variant of [...pools.sassy, ...pools.neutral]) {
          expect(variant.title.length).toBeGreaterThan(0);
          expect(variant.body.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('variant ids are positional and voice-namespaced in every locale', () => {
    // The rotation picks by index and skips by id, so ids must sit at the
    // same position in every locale (v1 first, v12 last; n1 first, n6 last).
    for (const trigger of TRIGGER_LIST) {
      for (const locale of LOCALES) {
        const pools = getCatalogPools(trigger, locale);
        pools.sassy.forEach((v, i) => expect(v.id).toBe(`v${i + 1}`));
        pools.neutral.forEach((v, i) => expect(v.id).toBe(`n${i + 1}`));
      }
    }
  });

  it('legacy lines survive at stable positions (nudge_log history stays coherent)', () => {
    // v1–v3 are the pre-2026-08 sassy lines; n1 mirrors the old v1 neutral
    // duty. Spot-check one per locale.
    expect(getCatalogPools('post_ride_celebration', 'en').sassy[1]!.body).toBe(
      '{streakCount} days in a row. I am not crying, you are crying.',
    );
    expect(getCatalogPools('post_ride_celebration', 'ro').sassy[2]!.body).toBe(
      '{streakCount} zile. Îmi schimb biografia să spună că te cunosc.',
    );
    expect(getCatalogPools('post_ride_celebration', 'es').neutral[0]!.title).toBe(
      'Ruta guardada',
    );
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
  // Check every raw template of every pool — no sampling.
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it('contains no emoji across all triggers/locales/voices/variants', () => {
    for (const trigger of TRIGGER_LIST) {
      for (const locale of LOCALES) {
        const pools = getCatalogPools(trigger, locale);
        for (const variant of [...pools.sassy, ...pools.neutral]) {
          expect(
            EMOJI_RE.test(variant.title),
            `emoji in ${trigger}/${locale}/${variant.id} title`,
          ).toBe(false);
          expect(
            EMOJI_RE.test(variant.body),
            `emoji in ${trigger}/${locale}/${variant.id} body`,
          ).toBe(false);
        }
      }
    }
  });
});
