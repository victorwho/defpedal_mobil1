import { describe, expect, it } from 'vitest';

import {
  CITY_PULSE_ROTATION_MEMORY,
  CITY_PULSE_VARIANT_COUNT,
  getCityPulsePools,
  getTriggerPose,
  getTriggerPriority,
  pickMessage,
  type PedalVoiceRequest,
} from './pedalVoice';

const baseRequest = (overrides: Partial<PedalVoiceRequest> = {}): PedalVoiceRequest => ({
  trigger: 'city_riders_pulse',
  locale: 'en',
  sassy: true,
  userId: 'user-pulse-1',
  context: { city: 'Bucharest', n: 1240 },
  sendDateISO: '2026-07-17',
  recentVariantIds: [],
  ...overrides,
});

describe('city_riders_pulse — variant rotation', () => {
  it('is deterministic for the same (user, sendDate)', () => {
    const a = pickMessage(baseRequest());
    const b = pickMessage(baseRequest());
    expect(a.variantId).toBe(b.variantId);
    expect(a.body).toBe(b.body);
  });

  it('never repeats any of the last 3 variant ids', () => {
    // Simulate four consecutive sends, feeding back the rotation memory the
    // way the cron does (most recent first, capped at 3).
    const recent: string[] = [];
    const days = ['2026-07-01', '2026-07-03', '2026-07-06', '2026-07-11', '2026-07-14'];
    for (const day of days) {
      const msg = pickMessage(
        baseRequest({ sendDateISO: day, recentVariantIds: [...recent] }),
      );
      expect(recent.slice(0, CITY_PULSE_ROTATION_MEMORY)).not.toContain(msg.variantId);
      recent.unshift(msg.variantId);
    }
  });

  it('skips forward when the hash lands on a recently-shown variant', () => {
    const natural = pickMessage(baseRequest());
    const skipped = pickMessage(baseRequest({ recentVariantIds: [natural.variantId] }));
    expect(skipped.variantId).not.toBe(natural.variantId);
  });

  it('varies across users on the same day', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, i) =>
        pickMessage(baseRequest({ userId: `user-${i}` })).variantId,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('city_riders_pulse — voice and locale', () => {
  it('keeps voice sticky: sassy picks sassy variants, neutral picks neutral', () => {
    expect(pickMessage(baseRequest({ sassy: true })).variantId).toMatch(/^sassy-v\d+$/);
    expect(pickMessage(baseRequest({ sassy: false })).variantId).toMatch(/^neutral-v\d+$/);
  });

  it('renders {n} and {city} in EN and RO', () => {
    const en = pickMessage(baseRequest({ sassy: false }));
    expect(en.body).toContain('1240');
    expect(en.body).toContain('Bucharest');
    expect(en.body).not.toMatch(/\{n\}|\{city\}/);

    const ro = pickMessage(baseRequest({ locale: 'ro', sassy: false, context: { city: 'București', n: 380 } }));
    expect(ro.body).toContain('380');
    expect(ro.body).toContain('București');
    // RO grammar: N >= 40 keeps the "de" article correct in every variant.
    expect(ro.body).toContain('380 de ');
    expect(ro.body).not.toMatch(/\{n\}|\{city\}/);
  });

  it('renders {n} and {city} in ES from the Spanish pool (G-24)', () => {
    const es = pickMessage(
      baseRequest({ locale: 'es', sassy: false, context: { city: 'Madrid', n: 520 } }),
    );
    const en = pickMessage(
      baseRequest({ locale: 'en', sassy: false, context: { city: 'Madrid', n: 520 } }),
    );
    expect(es.body).toContain('520');
    expect(es.body).toContain('Madrid');
    expect(es.body).not.toMatch(/\{n\}|\{city\}/);
    // Same index, different language — ES no longer borrows the EN catalog.
    expect(es.variantId).toBe(en.variantId);
    expect(es.body).not.toBe(en.body);
    expect(es.title).toBe('Ciclistas en Madrid');
  });

  it('never leaks raw placeholders when context is empty', () => {
    for (const locale of ['en', 'ro', 'es'] as const) {
      for (const sassy of [true, false]) {
        for (let i = 0; i < CITY_PULSE_VARIANT_COUNT; i++) {
          // Walk all 20 variants by seeding the rotation with distinct users.
          const msg = pickMessage(
            baseRequest({ locale, sassy, userId: `leak-check-${i}`, context: {} }),
          );
          expect(msg.title).not.toMatch(/\{[a-zA-Z]+\}/);
          expect(msg.body).not.toMatch(/\{[a-zA-Z]+\}/);
        }
      }
    }
  });

  it('renders the localized count fallback mid-sentence', () => {
    const en = pickMessage(baseRequest({ sassy: false, context: { city: 'Bucharest' } }));
    expect(en.body).toContain('dozens of');
    const ro = pickMessage(
      baseRequest({ locale: 'ro', sassy: false, context: { city: 'București' } }),
    );
    expect(ro.body).toContain('zeci');
    const es = pickMessage(
      baseRequest({ locale: 'es', sassy: false, context: { city: 'Madrid' } }),
    );
    expect(es.body).toContain('decenas de');
  });
});

describe('city_riders_pulse — pool completeness', () => {
  const LOCALES = ['en', 'ro', 'es'] as const;

  it('every locale has 20 sassy + 20 neutral variants and a title', () => {
    for (const locale of LOCALES) {
      const pools = getCityPulsePools(locale);
      expect(pools.sassy, `${locale} sassy`).toHaveLength(CITY_PULSE_VARIANT_COUNT);
      expect(pools.neutral, `${locale} neutral`).toHaveLength(CITY_PULSE_VARIANT_COUNT);
      expect(pools.title).toContain('{city}');
      for (const body of [...pools.sassy, ...pools.neutral]) {
        expect(body.length).toBeGreaterThan(0);
      }
    }
  });

  it('every variant carries the rider count — the point of the trigger', () => {
    for (const locale of LOCALES) {
      const pools = getCityPulsePools(locale);
      pools.sassy.forEach((body, i) =>
        expect(body, `${locale} sassy #${i + 1}`).toContain('{n}'),
      );
      pools.neutral.forEach((body, i) =>
        expect(body, `${locale} neutral #${i + 1}`).toContain('{n}'),
      );
    }
  });

  it('every ES variant names the city (the title alone is not enough)', () => {
    // EN sassy #6 says "Your city" instead of interpolating — grandfathered.
    // The ES pool authored for G-24 names the city in every line.
    const pools = getCityPulsePools('es');
    pools.sassy.forEach((body, i) =>
      expect(body, `es sassy #${i + 1}`).toContain('{city}'),
    );
    pools.neutral.forEach((body, i) =>
      expect(body, `es neutral #${i + 1}`).toContain('{city}'),
    );
  });

  it('uses only placeholders the renderer knows', () => {
    const KNOWN = new Set(['n', 'city']);
    for (const locale of LOCALES) {
      const pools = getCityPulsePools(locale);
      for (const text of [pools.title, ...pools.sassy, ...pools.neutral]) {
        for (const match of text.matchAll(/\{([a-zA-Z]+)\}/g)) {
          expect(KNOWN.has(match[1]!), `unknown placeholder {${match[1]}} in ${locale}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('the ES pool carries no emoji', () => {
    // EN/RO variant 1 predates the no-emoji rule and is grandfathered; every
    // pool authored since (ES, 2026-08-13) follows the brand rule.
    const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const pools = getCityPulsePools('es');
    for (const text of [pools.title, ...pools.sassy, ...pools.neutral]) {
      expect(EMOJI_RE.test(text), `emoji in ES City Pulse copy: ${text}`).toBe(false);
    }
  });
});

describe('city_riders_pulse — catalog metadata', () => {
  it('is P3 with the ride pose', () => {
    expect(getTriggerPriority('city_riders_pulse')).toBe(3);
    expect(getTriggerPose('city_riders_pulse')).toBe('ride');
    expect(pickMessage(baseRequest()).priority).toBe(3);
    expect(pickMessage(baseRequest()).mascotPose).toBe('ride');
  });
});
