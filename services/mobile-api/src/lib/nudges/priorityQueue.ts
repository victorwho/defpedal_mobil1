/**
 * Pedal Nudge — priority queue.
 *
 * Given the set of triggers the cron has CANDIDATES for this user at this
 * tick (e.g. streak-at-risk + lapsed + community-signal all eligible), pick
 * the one to actually send. Higher priority wins; within a priority tier,
 * the deterministic listing in TRIGGERS_BY_PRIORITY breaks ties.
 *
 * Phase 1 wiring: cron only evaluates `streak_at_risk_{mild,dramatic}` and
 * `milestone_celebration`. Phase 2 adds the other 5 triggers — the picker
 * is forward-compatible so adding them only requires expanding the
 * candidates list at the call site.
 */

import {
  TRIGGERS_BY_PRIORITY,
  getTriggerPriority,
  type NudgePriority,
  type NudgeTrigger,
} from '@defensivepedal/core';

import {
  evaluateEligibility,
  type EligibilityResult,
  type NudgeWindowContext,
  type UserNudgeProfile,
} from './eligibility';

export interface QueueCandidate {
  readonly trigger: NudgeTrigger;
  readonly priority: NudgePriority;
}

export interface QueueDecision {
  /** The winning trigger, or null if none were eligible. */
  readonly trigger: NudgeTrigger | null;
  /** Eligibility breakdown for every candidate considered — useful for nudge_log. */
  readonly considered: ReadonlyArray<{
    readonly trigger: NudgeTrigger;
    readonly priority: NudgePriority;
    readonly result: EligibilityResult;
  }>;
}

export interface PickRequest {
  readonly candidates: ReadonlyArray<NudgeTrigger>;
  readonly profile: UserNudgeProfile;
  readonly window: NudgeWindowContext;
  readonly dailyCap?: number;
  /** Cron path: make P0 triggers respect quiet hours (review 2026-06-12). */
  readonly enforceQuietHours?: boolean;
  readonly now?: Date;
}

/**
 * Resolve a set of candidate triggers to a single dispatch decision.
 *
 * Algorithm:
 *   1. Map every candidate to {trigger, priority, eligibility}.
 *   2. Filter eligible.
 *   3. Sort by priority ascending (P0 first).
 *   4. Among equal priority, prefer the order in TRIGGERS_BY_PRIORITY
 *      so the choice is stable across runs.
 *   5. First wins.
 *
 * Returns the full `considered` array so the cron can log each decision
 * to `nudge_log` with its `outcome`, even for the losers.
 */
export const pickHighestPriorityTrigger = (req: PickRequest): QueueDecision => {
  const considered = req.candidates.map((trigger) => {
    const priority = getTriggerPriority(trigger);
    const result = evaluateEligibility({
      trigger,
      priority,
      profile: req.profile,
      window: req.window,
      dailyCap: req.dailyCap,
      enforceQuietHours: req.enforceQuietHours,
      now: req.now,
    });
    return { trigger, priority, result };
  });

  const eligible = considered.filter((c) => c.result.eligible);
  if (eligible.length === 0) {
    return { trigger: null, considered };
  }

  // Order of TRIGGERS_BY_PRIORITY provides a stable tiebreak.
  const orderIndex = new Map<NudgeTrigger, number>(
    TRIGGERS_BY_PRIORITY.map((t, i) => [t, i] as const),
  );

  const sorted = [...eligible].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ai = orderIndex.get(a.trigger) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.trigger) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  return { trigger: sorted[0]!.trigger, considered };
};
