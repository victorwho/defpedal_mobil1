/**
 * Lifecycle of ONE unsolicited Pedal Plus nudge on screen.
 *
 * The caller decides whether its own trigger holds (`wanted` — "it is hot",
 * "this was an e-bike owner's ride"). This hook decides whether the nudge may
 * appear at all, and records that it did:
 *
 *   1. the persistent caps in `lib/plus-nudges.ts` (dark launch, subscriber,
 *      mid-ride, spacing, dismissals, retirement);
 *   2. the session latch — one unsolicited Plus surface per session;
 *   3. cross-surface arbitration — Plus is the lowest-priority ask
 *      (`claimPromptSlot('plus')`), so it never shares a session with a
 *      save-ride, review, civic-report or consent card that came first.
 *
 * Claims happen in an effect, never during render, and are recorded once:
 * once shown, the spacing cap would make the nudge ineligible on the very next
 * render, so visibility is held in local state from the moment of the claim.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  claimPlusNudgeSlot,
  isPlusNudgeEligible,
  isPlusNudgeSlotAvailable,
  isPlusUpsellAllowed,
  type PlusNudgeSurface,
} from '../lib/plus-nudges';
import { claimPromptSlot, isPromptSlotAvailable } from '../lib/prompt-arbitration';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';
import { usePremium } from './usePremium';

export interface UsePlusNudgeResult {
  readonly visible: boolean;
  /** The rider closed it. Counts toward the two-dismissal retirement. */
  readonly dismiss: () => void;
  /** The rider tapped its call to action. Hides it without a dismissal. */
  readonly accept: () => void;
}

export const usePlusNudge = (surface: PlusNudgeSurface, wanted: boolean): UsePlusNudgeResult => {
  const premium = usePremium();
  const appState = useAppStore((s) => s.appState);
  const nudgeState = useAppStore((s) => s.plusNudgeState);
  const markShown = useAppStore((s) => s.markPlusNudgeShown);
  const markDismissed = useAppStore((s) => s.markPlusNudgeDismissed);

  const [claimed, setClaimed] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (claimed || closed || !wanted) return;
    const eligible = isPlusNudgeEligible(surface, {
      state: nudgeState,
      uiEnabled: premium.uiEnabled,
      isPlus: premium.isPlus,
      appState,
      now: new Date(),
    });
    if (!eligible) return;
    if (!isPlusNudgeSlotAvailable(surface) || !isPromptSlotAvailable('plus')) return;
    if (!claimPlusNudgeSlot(surface) || !claimPromptSlot('plus')) return;

    markShown(surface);
    telemetry.capture('plus_nudge_shown', { surface });
    setClaimed(true);
  }, [
    claimed,
    closed,
    wanted,
    surface,
    nudgeState,
    premium.uiEnabled,
    premium.isPlus,
    appState,
    markShown,
  ]);

  const dismiss = useCallback(() => {
    markDismissed(surface);
    telemetry.capture('plus_nudge_dismissed', { surface });
    setClosed(true);
  }, [markDismissed, surface]);

  const accept = useCallback(() => {
    telemetry.capture('plus_nudge_accepted', { surface });
    setClosed(true);
  }, [surface]);

  // Re-checked every render: a rider who subscribes, or starts a ride, while
  // the nudge is up must not keep seeing it.
  const allowedNow = isPlusUpsellAllowed({
    uiEnabled: premium.uiEnabled,
    isPlus: premium.isPlus,
    appState,
  });

  return { visible: claimed && !closed && wanted && allowedNow, dismiss, accept };
};
