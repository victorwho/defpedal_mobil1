/**
 * Drives the app-open Loop feature intro (`LoopIntroSheet`).
 *
 * WHEN is `shouldShowLoopIntro` in `lib/loop-intro.ts` (never used loops,
 * covered country, past onboarding, not mid-ride, weekly, three closes or one
 * "Try it" retire it). This hook adds what only a live screen can know:
 *
 *  - It never stacks on another app-open notice. The one-time free-modes
 *    notice and the Meet Pedal card are modals that `app/_layout.tsx` renders
 *    from store flags, so their pending state is read here directly.
 *  - It takes the session's `feature_intro` prompt slot, so it yields to any
 *    ask already shown and keeps the Plus nudges and the analytics ask out of
 *    the session it appears in.
 *
 * The claim happens once, in an effect: after it, recording the showing makes
 * `shouldShowLoopIntro` false (the weekly spacing), so visibility is held in
 * local state from the moment of the claim.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { isPlusModesPromoActive } from '@defensivepedal/core';

import { hasUsedLoops, shouldShowLoopIntro } from '../lib/loop-intro';
import { claimPromptSlot, isPromptSlotAvailable } from '../lib/prompt-arbitration';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';

export interface UseLoopIntroResult {
  readonly visible: boolean;
  /** Close X / back / backdrop. Counts toward the three-close retirement. */
  readonly close: () => void;
  /** "Try it": retire the intro and open the Loop planner. */
  readonly tryIt: () => void;
}

export const useLoopIntro = (): UseLoopIntroResult => {
  const loopIntro = useAppStore((s) => s.loopIntro);
  const hasOpenedLoopPlanner = useAppStore((s) => s.hasOpenedLoopPlanner);
  const savedLoopCount = useAppStore((s) => s.savedLoops.length);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const appState = useAppStore((s) => s.appState);
  const countryCode = useAppStore((s) => s.regionGate.countryCode);
  const promoNoticePending = useAppStore(
    (s) => !s.hasSeenPlusModesNotice && isPlusModesPromoActive(),
  );
  const meetPedalPending = useAppStore(
    (s) => !s.hasSeenMeetPedalCard && s.completedRideCount >= 1,
  );
  const markShown = useAppStore((s) => s.markLoopIntroShown);
  const markClosed = useAppStore((s) => s.markLoopIntroClosed);
  const markTried = useAppStore((s) => s.markLoopIntroTried);

  const [claimed, setClaimed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (claimed || done) return;
    if (promoNoticePending || meetPedalPending) return;
    const eligible = shouldShowLoopIntro({
      state: loopIntro,
      hasUsedLoops: hasUsedLoops({ hasOpenedLoopPlanner, savedLoopCount }),
      countryCode,
      onboardingCompleted,
      appState,
      now: new Date(),
    });
    if (!eligible || !isPromptSlotAvailable('feature_intro')) return;
    if (!claimPromptSlot('feature_intro')) return;

    markShown();
    telemetry.capture('loop_intro_shown', { showing: loopIntro.closes + 1 });
    setClaimed(true);
  }, [
    claimed,
    done,
    promoNoticePending,
    meetPedalPending,
    loopIntro,
    hasOpenedLoopPlanner,
    savedLoopCount,
    countryCode,
    onboardingCompleted,
    appState,
    markShown,
  ]);

  const close = useCallback(() => {
    markClosed();
    telemetry.capture('loop_intro_closed', {});
    setDone(true);
  }, [markClosed]);

  const tryIt = useCallback(() => {
    markTried();
    telemetry.capture('loop_intro_tried', {});
    setDone(true);
    router.push('/loop-planner');
  }, [markTried]);

  // Re-checked every render: if the app leaves IDLE while it is up — a ride
  // started from a notification, a resumed route preview — it must go.
  return { visible: claimed && !done && appState === 'IDLE', close, tryIt };
};
