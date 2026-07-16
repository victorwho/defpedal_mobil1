/**
 * Anonymous Activation Ladder — pure logic module.
 *
 * Spec: docs/plans/anonymous-activation-ladder.md. Max-3 local-notification
 * ladder nudging anonymous users toward their first completed ride. This file
 * mirrors `daily-weather-messages.ts`: copy catalog (EN/RO), rung selection,
 * stage derivation, trigger-time math, stop conditions. Pure functions — no
 * native modules, no IO — trivially testable in Node-env Vitest.
 *
 * Copy is plan-framed ("check your route"), NOT ride-now-framed, so the nudge
 * system's weather/sunset safety floor is deliberately not needed here (v1
 * simplification, spec §3).
 */

export type ActivationStage = 'A' | 'B' | 'C';
export type ActivationRung = 1 | 2 | 3;
export type LadderLocale = 'en' | 'ro';

/** Persisted slice shape (device-scoped — NOT reset by resetUserScopedState). */
export interface ActivationLadderState {
  /** ISO timestamp of the first post-onboarding app open. Null until initialized. */
  firstOpenAt: string | null;
  /** Rungs recorded as fired (spec §5.4: recorded on the first pass that sees fireAt < now). */
  rungsFired: readonly number[];
  /** Terminal flag — any stop condition sets it; never schedule again. */
  completed: boolean;
  /**
   * The currently pending one-shot, so a later pass can record it as fired
   * (spec §5.4 — expo-notifications gives no reliable delivered callback).
   */
  scheduledRung: { rung: ActivationRung; fireAt: string } | null;
}

export const MAX_LADDER_RUNGS = 3;

/** Evening slot: outside quiet hours, ≥6h from the 8:30 weather ping (spec §3). */
export const LADDER_TRIGGER_HOUR = 18;
export const LADDER_TRIGGER_MINUTE = 45;

/** Rung thresholds relative to firstOpenAt (spec §4: +28h, day 3, day 7). */
export const RUNG_THRESHOLD_HOURS: Record<ActivationRung, number> = {
  1: 28,
  2: 72,
  3: 168,
};

// ---------------------------------------------------------------------------
// Stage derivation (spec §4 table)
// ---------------------------------------------------------------------------

/**
 * A = onboarded, never previewed a route; B = previewed, never rode;
 * C = started a trip, never finished. Caller derives the booleans from store
 * state (routePreview / recentDestinations evidence for B; queued trip_start /
 * activeTripClientId / tripServerIds evidence for C).
 */
export const deriveActivationStage = (input: {
  hasPreviewedRoute: boolean;
  hasStartedTrip: boolean;
}): ActivationStage => {
  if (input.hasStartedTrip) return 'C';
  if (input.hasPreviewedRoute) return 'B';
  return 'A';
};

// ---------------------------------------------------------------------------
// Stop conditions (spec §4)
// ---------------------------------------------------------------------------

export interface LadderStopInput {
  completedRideCount: number;
  isAnonymous: boolean;
  rungsFiredCount: number;
  toggleEnabled: boolean;
  completed: boolean;
}

/**
 * Checked at every schedule pass. Any true → cancel pending, mark completed,
 * never schedule again.
 */
export const shouldStopLadder = (input: LadderStopInput): boolean =>
  input.completed ||
  input.completedRideCount > 0 ||
  !input.isAnonymous ||
  input.rungsFiredCount >= MAX_LADDER_RUNGS ||
  !input.toggleEnabled;

// ---------------------------------------------------------------------------
// Rung selection + trigger math
// ---------------------------------------------------------------------------

/** Lowest rung not yet fired, or null when all 3 are exhausted. */
export const selectNextRung = (
  rungsFired: readonly number[],
): ActivationRung | null => {
  for (const rung of [1, 2, 3] as const) {
    if (!rungsFired.includes(rung)) return rung;
  }
  return null;
};

/**
 * First 18:45 *local wall-clock* at or after max(now, firstOpenAt + rung
 * threshold). Uses Date#setHours so DST transitions keep the 18:45 local slot
 * (the absolute interval stretches/shrinks by the DST hour — intended).
 */
export const computeRungFireTime = (
  firstOpenAt: Date,
  rung: ActivationRung,
  now: Date,
): Date => {
  const thresholdMs =
    firstOpenAt.getTime() + RUNG_THRESHOLD_HOURS[rung] * 3_600_000;
  const earliest = new Date(Math.max(thresholdMs, now.getTime()));
  const fire = new Date(earliest);
  fire.setHours(LADDER_TRIGGER_HOUR, LADDER_TRIGGER_MINUTE, 0, 0);
  if (fire.getTime() <= earliest.getTime()) {
    fire.setDate(fire.getDate() + 1);
  }
  return fire;
};

/**
 * Seconds from `now` until `fireAt` for the one-shot timeInterval trigger.
 * Clamped to ≥60 (same rule as the weather ping) so a same-minute pass never
 * fires instantly. Doze drift of 5–15 min is accepted (spec §5).
 */
export const computeSecondsUntilFire = (fireAt: Date, now: Date): number =>
  Math.max(60, Math.floor((fireAt.getTime() - now.getTime()) / 1000));

/** Spec §5.4: a previously scheduled rung whose fire time has passed counts as fired. */
export const hasScheduledRungFired = (
  scheduled: { fireAt: string } | null,
  now: Date,
): boolean => {
  if (!scheduled) return false;
  const fireAt = Date.parse(scheduled.fireAt);
  return Number.isFinite(fireAt) && fireAt <= now.getTime();
};

// ---------------------------------------------------------------------------
// Copy catalog (spec §4). Pedal voice — cheeky, never mean. EN + RO; other
// app locales (es) fall back to EN, same as the pedalVoice nudge catalog.
// Stage B copy is shared by stages B and C; rung 3 is stage-independent.
// ---------------------------------------------------------------------------

interface RungCopy {
  readonly title: string;
  readonly body: string;
}
interface RungStageCopy {
  readonly stageA: RungCopy;
  readonly stageB: RungCopy;
}
export type LadderCopyCatalog = Record<
  'rung1' | 'rung2' | 'rung3',
  RungStageCopy
>;

export const LADDER_COPY: Record<LadderLocale, LadderCopyCatalog> = {
  en: {
    rung1: {
      // Stage-A copy replaced 2026-07-16: the spec's original "Your safety
      // score is waiting" referenced the onboarding safety-score screen cut
      // on 2026-07-04 — stage-A users have never seen a safety score. The
      // fast≠safe framing is accurate in all 31 supported countries (OSRM
      // safety profile), unlike per-street risk ratings (RO+ES only).
      stageA: {
        title: "Your fastest route isn't your safest",
        body: "Type where you're headed — Pedal picks the calm streets, not just the quick ones. See the difference in two minutes.",
      },
      stageB: {
        title: "That route isn't going to ride itself",
        body: 'Your preview is saved. One tap and Pedal leads the way.',
      },
    },
    rung2: {
      stageA: {
        title: 'Still parked?',
        body: 'Two minutes: pick a destination, get the safest route in {city}. Pedal insists.',
      },
      stageB: {
        title: 'Pedal kept your route warm',
        body: 'Your safest route is still here. So is Pedal. Awkward.',
      },
    },
    rung3: {
      stageA: {
        title: 'Last call from Pedal',
        body: "One safe ride. That's all it takes to see what the fuss is about.",
      },
      stageB: {
        title: 'Last call from Pedal',
        body: "One safe ride. That's all it takes to see what the fuss is about.",
      },
    },
  },
  ro: {
    rung1: {
      stageA: {
        title: 'Traseul cel mai rapid nu e și cel mai sigur',
        body: 'Scrie unde mergi — Pedal alege străzile liniștite, nu doar pe cele rapide. Vezi diferența în două minute.',
      },
      stageB: {
        title: 'Traseul ăla nu se pedalează singur',
        body: 'Previzualizarea ta e salvată. O atingere și Pedal deschide drumul.',
      },
    },
    rung2: {
      stageA: {
        title: 'Tot pe loc?',
        body: 'Două minute: alegi o destinație, primești cel mai sigur traseu din {city}. Pedal insistă.',
      },
      stageB: {
        title: 'Pedal ți-a ținut traseul la cald',
        body: 'Cel mai sigur traseu al tău e tot aici. Și Pedal la fel. Stânjenitor.',
      },
    },
    rung3: {
      stageA: {
        title: 'Ultimul apel de la Pedal',
        body: 'O singură tură sigură. Atât îți trebuie ca să vezi despre ce e vorba.',
      },
      stageB: {
        title: 'Ultimul apel de la Pedal',
        body: 'O singură tură sigură. Atât îți trebuie ca să vezi despre ce e vorba.',
      },
    },
  },
};

/** City fallback when the caller can't provide one — the copy must read naturally. */
const CITY_FALLBACK: Record<LadderLocale, string> = {
  en: 'your city',
  ro: 'orașul tău',
};

/** App locales beyond EN/RO (es) fall back to EN — same policy as pedalVoice. */
export const resolveLadderLocale = (locale: string): LadderLocale =>
  locale === 'ro' ? 'ro' : 'en';

/**
 * Final {title, body} for a rung/stage. Substitutes {city}; any placeholder
 * left unsubstituted is replaced with the locale's fallback so raw `{...}`
 * can never leak to the lock screen (spec §8).
 */
export const buildRungContent = (
  locale: string,
  rung: ActivationRung,
  stage: ActivationStage,
  vars?: { city?: string },
): RungCopy => {
  const resolved = resolveLadderLocale(locale);
  const catalog = LADDER_COPY[resolved][`rung${rung}` as const];
  const copy = stage === 'A' ? catalog.stageA : catalog.stageB;
  const city = vars?.city?.trim() || CITY_FALLBACK[resolved];
  const substitute = (text: string): string =>
    text
      .replace(/\{city\}/g, city)
      // Defensive: no other placeholders exist today, but a future catalog
      // edit must fail soft (fallback text), never leak `{token}` raw.
      .replace(/\{\w+\}/g, CITY_FALLBACK[resolved]);
  return { title: substitute(copy.title), body: substitute(copy.body) };
};
