import { describe, expect, it } from 'vitest';

import {
  LADDER_COPY,
  LADDER_TRIGGER_HOUR,
  LADDER_TRIGGER_MINUTE,
  MAX_LADDER_RUNGS,
  RUNG_THRESHOLD_HOURS,
  buildRungContent,
  computeRungFireTime,
  computeSecondsUntilFire,
  deriveActivationStage,
  hasScheduledRungFired,
  resolveLadderLocale,
  selectNextRung,
  shouldStopLadder,
  type ActivationRung,
  type ActivationStage,
} from './activation-ladder-messages';

const HOUR_MS = 3_600_000;

describe('deriveActivationStage', () => {
  it.each([
    [false, false, 'A'],
    [true, false, 'B'],
    [false, true, 'C'],
    // Started-trip evidence dominates preview evidence.
    [true, true, 'C'],
  ] as const)(
    'previewed=%s started=%s → stage %s',
    (hasPreviewedRoute, hasStartedTrip, expected) => {
      expect(deriveActivationStage({ hasPreviewedRoute, hasStartedTrip })).toBe(expected);
    },
  );
});

describe('shouldStopLadder', () => {
  const base = {
    completedRideCount: 0,
    isAnonymous: true,
    rungsFiredCount: 0,
    toggleEnabled: true,
    completed: false,
  };

  it('does not stop for a fresh anonymous zero-ride user', () => {
    expect(shouldStopLadder(base)).toBe(false);
  });

  it('stops when a ride was completed', () => {
    expect(shouldStopLadder({ ...base, completedRideCount: 1 })).toBe(true);
  });

  it('stops when the user registered (no longer anonymous)', () => {
    expect(shouldStopLadder({ ...base, isAnonymous: false })).toBe(true);
  });

  it('stops after all 3 rungs fired', () => {
    expect(shouldStopLadder({ ...base, rungsFiredCount: MAX_LADDER_RUNGS })).toBe(true);
  });

  it('stops when the toggle is off', () => {
    expect(shouldStopLadder({ ...base, toggleEnabled: false })).toBe(true);
  });

  it('stops when already completed (terminal)', () => {
    expect(shouldStopLadder({ ...base, completed: true })).toBe(true);
  });
});

describe('selectNextRung', () => {
  it('selects rung 1 when none fired', () => {
    expect(selectNextRung([])).toBe(1);
  });
  it('selects the lowest unfired rung', () => {
    expect(selectNextRung([1])).toBe(2);
    expect(selectNextRung([1, 2])).toBe(3);
    // Out-of-order history still resolves the lowest gap.
    expect(selectNextRung([2])).toBe(1);
  });
  it('returns null when exhausted', () => {
    expect(selectNextRung([1, 2, 3])).toBeNull();
  });
});

describe('computeRungFireTime', () => {
  const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
    new Date(y, mo - 1, d, h, mi, 0, 0);

  const expectFireSlot = (fire: Date) => {
    expect(fire.getHours()).toBe(LADDER_TRIGGER_HOUR);
    expect(fire.getMinutes()).toBe(LADDER_TRIGGER_MINUTE);
    expect(fire.getSeconds()).toBe(0);
  };

  it('rung 1 (+28h): noon first-open fires next day at 18:45', () => {
    const firstOpen = at(2026, 7, 16, 12); // threshold → Jul 17 16:00
    const fire = computeRungFireTime(firstOpen, 1, firstOpen);
    expectFireSlot(fire);
    expect(fire.getDate()).toBe(17);
    expect(fire.getMonth()).toBe(6);
  });

  it('rung 1 (+28h): evening first-open rolls to the day after next', () => {
    const firstOpen = at(2026, 7, 16, 20); // threshold → Jul 18 00:00 (past 18:45 of Jul 17)
    const fire = computeRungFireTime(firstOpen, 1, firstOpen);
    expectFireSlot(fire);
    expect(fire.getDate()).toBe(18);
  });

  it('rung 2 (day 3) and rung 3 (day 7) honor their thresholds', () => {
    const firstOpen = at(2026, 7, 16, 12);
    const fire2 = computeRungFireTime(firstOpen, 2, firstOpen);
    const fire3 = computeRungFireTime(firstOpen, 3, firstOpen);
    expectFireSlot(fire2);
    expectFireSlot(fire3);
    expect(fire2.getTime()).toBeGreaterThanOrEqual(
      firstOpen.getTime() + RUNG_THRESHOLD_HOURS[2] * HOUR_MS,
    );
    expect(fire3.getTime()).toBeGreaterThanOrEqual(
      firstOpen.getTime() + RUNG_THRESHOLD_HOURS[3] * HOUR_MS,
    );
    // Day 3 threshold lands Jul 19 12:00 → fire Jul 19 18:45.
    expect(fire2.getDate()).toBe(19);
    // Day 7 threshold lands Jul 23 12:00 → fire Jul 23 18:45.
    expect(fire3.getDate()).toBe(23);
  });

  it('past-threshold pass (user away for days): schedules the next 18:45 from now', () => {
    const firstOpen = at(2026, 7, 1, 12);
    const nowMorning = at(2026, 7, 20, 10);
    const fireSameDay = computeRungFireTime(firstOpen, 1, nowMorning);
    expectFireSlot(fireSameDay);
    expect(fireSameDay.getDate()).toBe(20);

    const nowEvening = at(2026, 7, 20, 19);
    const fireNextDay = computeRungFireTime(firstOpen, 1, nowEvening);
    expectFireSlot(fireNextDay);
    expect(fireNextDay.getDate()).toBe(21);
  });

  it('exactly at 18:45 rolls to the next day (never fires instantly)', () => {
    const firstOpen = at(2026, 7, 1, 12);
    const now = at(2026, 7, 20, LADDER_TRIGGER_HOUR, LADDER_TRIGGER_MINUTE);
    const fire = computeRungFireTime(firstOpen, 1, now);
    expectFireSlot(fire);
    expect(fire.getDate()).toBe(21);
    expect(fire.getTime()).toBeGreaterThan(now.getTime());
  });

  // DST invariants: the fire slot is defined in LOCAL wall-clock. Whatever
  // timezone the test host runs in (UTC CI has no DST; Europe/Bucharest
  // shifts Mar 29 / Oct 25 2026), the slot must stay 18:45 local, in the
  // future, and within ~25h of the earliest allowed moment.
  it.each([
    // Spring forward (EU 2026-03-29): threshold crosses the missing hour.
    [at(2026, 3, 28, 12), 1 as ActivationRung],
    // Fall back (EU 2026-10-25): threshold crosses the doubled hour.
    [at(2026, 10, 24, 12), 1 as ActivationRung],
  ])('keeps the 18:45 local slot across DST boundaries (firstOpen=%s)', (firstOpen, rung) => {
    const fire = computeRungFireTime(firstOpen, rung, firstOpen);
    expectFireSlot(fire);
    const earliest = firstOpen.getTime() + RUNG_THRESHOLD_HOURS[rung] * HOUR_MS;
    expect(fire.getTime()).toBeGreaterThan(firstOpen.getTime());
    // Next 18:45 after the threshold is at most ~25h later even with a DST
    // hour inserted or removed.
    expect(fire.getTime() - earliest).toBeLessThanOrEqual(25 * HOUR_MS);
  });
});

describe('computeSecondsUntilFire', () => {
  it('returns the whole-second delta', () => {
    const now = new Date(2026, 6, 16, 12, 0, 0);
    const fire = new Date(2026, 6, 16, 18, 45, 0);
    expect(computeSecondsUntilFire(fire, now)).toBe(((18 - 12) * 60 + 45) * 60);
  });

  it('clamps to ≥60 seconds', () => {
    const now = new Date(2026, 6, 16, 18, 44, 50);
    const fire = new Date(2026, 6, 16, 18, 45, 0);
    expect(computeSecondsUntilFire(fire, now)).toBe(60);
    expect(computeSecondsUntilFire(now, now)).toBe(60);
  });
});

describe('hasScheduledRungFired', () => {
  const now = new Date(2026, 6, 16, 12, 0, 0);
  it('false for null', () => {
    expect(hasScheduledRungFired(null, now)).toBe(false);
  });
  it('false for a future fire time', () => {
    expect(
      hasScheduledRungFired({ fireAt: new Date(now.getTime() + HOUR_MS).toISOString() }, now),
    ).toBe(false);
  });
  it('true for a past fire time', () => {
    expect(
      hasScheduledRungFired({ fireAt: new Date(now.getTime() - HOUR_MS).toISOString() }, now),
    ).toBe(true);
  });
  it('false for a malformed fire time', () => {
    expect(hasScheduledRungFired({ fireAt: 'not-a-date' }, now)).toBe(false);
  });
});

describe('copy catalog', () => {
  const locales = ['en', 'ro'] as const;
  const rungs = ['rung1', 'rung2', 'rung3'] as const;
  const stages = ['stageA', 'stageB'] as const;

  it('is complete for both locales — every rung × stage has non-empty title and body', () => {
    for (const locale of locales) {
      for (const rung of rungs) {
        for (const stage of stages) {
          const copy = LADDER_COPY[locale][rung][stage];
          expect(copy.title.length, `${locale}.${rung}.${stage}.title`).toBeGreaterThan(0);
          expect(copy.body.length, `${locale}.${rung}.${stage}.body`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('rung 3 is stage-independent (spec §4: stage B/C same as A)', () => {
    for (const locale of locales) {
      expect(LADDER_COPY[locale].rung3.stageB).toEqual(LADDER_COPY[locale].rung3.stageA);
    }
  });
});

describe('resolveLadderLocale', () => {
  it('ro stays ro; everything else (en, es, unknown) falls back to en', () => {
    expect(resolveLadderLocale('ro')).toBe('ro');
    expect(resolveLadderLocale('en')).toBe('en');
    expect(resolveLadderLocale('es')).toBe('en');
    expect(resolveLadderLocale('de')).toBe('en');
  });
});

describe('buildRungContent', () => {
  const allCombos: Array<[string, ActivationRung, ActivationStage]> = [];
  for (const locale of ['en', 'ro', 'es']) {
    for (const rung of [1, 2, 3] as const) {
      for (const stage of ['A', 'B', 'C'] as const) {
        allCombos.push([locale, rung, stage]);
      }
    }
  }

  it('substitutes {city} when provided', () => {
    const content = buildRungContent('en', 2, 'A', { city: 'Bucharest' });
    expect(content.body).toContain('Bucharest');
    expect(content.body).not.toContain('{city}');
  });

  it('falls back per-locale when city is missing or blank', () => {
    expect(buildRungContent('en', 2, 'A').body).toContain('your city');
    expect(buildRungContent('ro', 2, 'A').body).toContain('orașul tău');
    expect(buildRungContent('en', 2, 'A', { city: '   ' }).body).toContain('your city');
  });

  it.each(allCombos)(
    'never leaks a raw placeholder (locale=%s rung=%s stage=%s)',
    (locale, rung, stage) => {
      const { title, body } = buildRungContent(locale, rung, stage);
      expect(title).not.toMatch(/\{\w+\}/);
      expect(body).not.toMatch(/\{\w+\}/);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    },
  );

  it('stage C uses stage-B copy', () => {
    expect(buildRungContent('en', 1, 'C')).toEqual(buildRungContent('en', 1, 'B'));
  });

  it('es falls back to the EN catalog', () => {
    expect(buildRungContent('es', 1, 'A')).toEqual(buildRungContent('en', 1, 'A'));
  });
});
