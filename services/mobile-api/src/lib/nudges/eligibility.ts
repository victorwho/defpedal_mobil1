/**
 * Pedal Nudge — eligibility predicates.
 *
 * Pure functions wherever possible. The cron evaluator wires these against
 * Supabase and the weather/sunset helpers to decide whether to send a
 * specific trigger to a specific user at the current time.
 *
 * Locked in plan section 2.4 (governance) + 4.4 (algorithm):
 *   - Anonymous users get no nudges (sign-up unlocks the system).
 *   - Quiet hours (default 22:00–07:00 local) suppress everything.
 *   - Daily cap = 2 pushes / 24-h rolling window. P0 events bypass the cap.
 *   - Safety floor: no streak-at-risk or daily-ride pushes during bad
 *     weather OR after sunset. Milestones and post-loss apologies are
 *     time-of-day-tolerant because they celebrate completed action.
 */

import type { NudgePriority, NudgeTrigger } from '@defensivepedal/core';

import { isAnonPushEnabled } from './killSwitch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserNudgeProfile {
  /** Supabase user id. */
  readonly userId: string;
  /** Anonymous Supabase users have a null/empty email. */
  readonly hasEmail: boolean;
  /**
   * Explicit "Riding tips & reminders" opt-in (profiles.notify_riding_tips,
   * 2026-07-16). The consent gate for anonymous push — without it anonymous
   * users are suppressed for every trigger. Irrelevant for registered users.
   */
  readonly notifyRidingTips: boolean;
  /**
   * Master switch for the whole nudge system (profiles.notify_pedal_nudges,
   * audit 2026-07-05 UX-14). false = no nudges of ANY kind, including P0
   * celebrations — "off" must mean off.
   */
  readonly notifyPedalNudges: boolean;
  /** Per-category opt-out (existing profiles.notify_streak boolean). */
  readonly notifyStreak: boolean;
  /** Quiet hours start in 24-h "HH:MM" form, e.g. "22:00". */
  readonly quietHoursStart: string;
  /** Quiet hours end in 24-h "HH:MM" form, e.g. "07:00". */
  readonly quietHoursEnd: string;
  /** IANA timezone, e.g. "Europe/Bucharest". */
  readonly timezone: string;
}

export interface NudgeWindowContext {
  /** Number of nudge pushes already sent to this user in the last 24 h. */
  readonly pushesLast24h: number;
  /** Bad weather (storm / freezing / strong wind / heavy rain) for the user's city. */
  readonly badWeatherNow: boolean;
  /** True when the sun has set in the user's location at evaluation time. */
  readonly afterSunset: boolean;
  /**
   * True when the rider has already completed a qualifying streak action
   * today. Used to skip the streak-at-risk trigger silently.
   */
  readonly qualifiedStreakToday: boolean;
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly outcome:
    | 'eligible'
    | 'suppressed_anonymous'
    | 'suppressed_quiet_hours'
    | 'suppressed_weather'
    | 'suppressed_sunset'
    | 'suppressed_cap'
    | 'suppressed_category_pref'
    | 'suppressed_qualified_already';
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current "HH:MM" string in the given IANA timezone. Pure given
 * a clock — defaults to `Date.now()` when no clock is provided, which is
 * how the cron uses it.
 *
 * Exported for unit-test injection.
 */
export const currentHHMMInTimezone = (
  timezone: string,
  now: Date = new Date(),
): string => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
  // Intl returns "23:05" or "24:00" (24:00 only on macOS edge cases) — we
  // normalise the latter to "00:00" since both formatter behaviors exist.
  const formatted = formatter.format(now);
  return formatted === '24:00' ? '00:00' : formatted;
};

/**
 * True when `currentTime` (HH:MM) falls within the (possibly overnight)
 * quiet-hours window. Pure.
 */
export const isInQuietHours = (
  currentTime: string,
  start: string,
  end: string,
): boolean => {
  if (!start || !end || start === end) return false;
  // Overnight window (e.g. 22:00 → 07:00):
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  // Same-day window (e.g. 13:00 → 14:00):
  return currentTime >= start && currentTime < end;
};

/**
 * P0 triggers bypass quiet hours and the daily cap because they celebrate
 * an action the user JUST took (post-ride, post-hazard, milestone). They
 * never wake the user up because they only fire reactively, not on a clock.
 *
 * P1–P3 triggers respect every governance rule.
 */
const isP0 = (priority: NudgePriority): boolean => priority === 0;

/**
 * Triggers that should be suppressed when weather is bad or after sunset.
 * Celebrations / apologies are always allowed; they don't ask for a ride.
 */
const SAFETY_GATED_TRIGGERS = new Set<NudgeTrigger>([
  'streak_at_risk_mild',
  'streak_at_risk_dramatic',
  'daily_ride_reminder',
]);

/**
 * Decide if a trigger needs the streak-related category preference enabled.
 */
const STREAK_CATEGORY_TRIGGERS = new Set<NudgeTrigger>([
  'streak_at_risk_mild',
  'streak_at_risk_dramatic',
  'milestone_celebration',
  'streak_lost_apology',
]);

// ---------------------------------------------------------------------------
// Main predicate
// ---------------------------------------------------------------------------

export interface EligibilityRequest {
  readonly trigger: NudgeTrigger;
  readonly priority: NudgePriority;
  readonly profile: UserNudgeProfile;
  readonly window: NudgeWindowContext;
  /** Daily cap (rolling 24 h) for non-P0 triggers. Locked default = 2. */
  readonly dailyCap?: number;
  /**
   * When true, P0 triggers still respect quiet hours (but keep bypassing the
   * cap + safety floor). Set by the CRON path: a cron-sourced P0 (e.g. the
   * milestone-celebration backstop) must never buzz the user overnight. The
   * real-time P0 fast path leaves this false — those fire within seconds of a
   * completed action while the user is demonstrably awake (review 2026-06-12).
   */
  readonly enforceQuietHours?: boolean;
  /** Clock injection — defaults to wall-clock now. */
  readonly now?: Date;
}

const DEFAULT_DAILY_CAP = 2;

/**
 * The ONLY sends anonymous users may ever receive (2026-07-16, consent-gated
 * anonymous push). Union of the firstride-engine templates and the one nudge
 * trigger allowed for anonymous users — typed as strings because
 * 'first_ride_nudge' / 'weather_invitation' live in the firstride engine, not
 * the NudgeTrigger union; both engines check against this same list.
 */
export const ANONYMOUS_ALLOWED_TRIGGERS: readonly string[] = [
  'first_ride_nudge',
  'weather_invitation',
  'lapsed_reengagement',
];

export const evaluateEligibility = (req: EligibilityRequest): EligibilityResult => {
  // 1. Anonymous users: eligible ONLY when (a) the ANON_PUSH_ENABLED kill
  // switch is on, (b) the trigger is on the anonymous whitelist, and (c) the
  // user explicitly opted into "Riding tips & reminders"
  // (profiles.notify_riding_tips — the GDPR consent gate). Everything else
  // keeps the historical suppressed_anonymous outcome. Whitelisted anonymous
  // sends still run through every gate below (quiet hours, cap, safety
  // floor, category prefs) — consent unlocks the gates, it doesn't skip them.
  if (!req.profile.hasEmail) {
    if (
      !isAnonPushEnabled() ||
      !ANONYMOUS_ALLOWED_TRIGGERS.includes(req.trigger) ||
      !req.profile.notifyRidingTips
    ) {
      return { eligible: false, outcome: 'suppressed_anonymous' };
    }
  }

  // 1b. Master opt-out (audit 2026-07-05 UX-14): Profile > Pedal Nudges >
  // "Pedal nudges" off silences EVERY trigger — including P0 celebrations,
  // which otherwise bypass every other gate below.
  if (!req.profile.notifyPedalNudges) {
    return { eligible: false, outcome: 'suppressed_category_pref' };
  }

  // 2. Streak-category opt-out covers streak-at-risk + milestone + apology.
  if (STREAK_CATEGORY_TRIGGERS.has(req.trigger) && !req.profile.notifyStreak) {
    return { eligible: false, outcome: 'suppressed_category_pref' };
  }

  // 3. Streak-at-risk silently suppresses when the rider already qualified.
  if (
    (req.trigger === 'streak_at_risk_mild' ||
      req.trigger === 'streak_at_risk_dramatic') &&
    req.window.qualifiedStreakToday
  ) {
    return { eligible: false, outcome: 'suppressed_qualified_already' };
  }

  // P0 triggers skip the cap + safety rules — they celebrate a completed
  // action, never ask for a ride. Real-time P0 (post-ride/hazard) also skips
  // quiet hours because it fires within seconds while the user is awake. A
  // CRON-sourced P0 (the milestone backstop) sets enforceQuietHours so it
  // can't buzz overnight (review 2026-06-12).
  if (isP0(req.priority)) {
    if (req.enforceQuietHours) {
      const currentTime = currentHHMMInTimezone(req.profile.timezone, req.now);
      if (isInQuietHours(currentTime, req.profile.quietHoursStart, req.profile.quietHoursEnd)) {
        return { eligible: false, outcome: 'suppressed_quiet_hours' };
      }
    }
    return { eligible: true, outcome: 'eligible' };
  }

  // 4. Safety floor — bad weather and after-sunset suppress ride-ask triggers.
  if (SAFETY_GATED_TRIGGERS.has(req.trigger) && req.window.badWeatherNow) {
    return { eligible: false, outcome: 'suppressed_weather' };
  }
  if (SAFETY_GATED_TRIGGERS.has(req.trigger) && req.window.afterSunset) {
    return { eligible: false, outcome: 'suppressed_sunset' };
  }

  // 5. Quiet hours.
  const currentTime = currentHHMMInTimezone(req.profile.timezone, req.now);
  if (isInQuietHours(currentTime, req.profile.quietHoursStart, req.profile.quietHoursEnd)) {
    return { eligible: false, outcome: 'suppressed_quiet_hours' };
  }

  // 6. Daily cap.
  const cap = req.dailyCap ?? DEFAULT_DAILY_CAP;
  if (req.window.pushesLast24h >= cap) {
    return { eligible: false, outcome: 'suppressed_cap' };
  }

  return { eligible: true, outcome: 'eligible' };
};
