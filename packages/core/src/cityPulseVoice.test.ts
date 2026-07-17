import { describe, expect, it } from 'vitest';

import {
  CITY_PULSE_ROTATION_MEMORY,
  CITY_PULSE_VARIANT_COUNT,
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

  it('falls back to the EN catalog for es (no Spanish copy commissioned)', () => {
    const es = pickMessage(baseRequest({ locale: 'es', sassy: false }));
    const en = pickMessage(baseRequest({ locale: 'en', sassy: false }));
    expect(es.body).toBe(en.body);
    expect(es.variantId).toBe(en.variantId);
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
