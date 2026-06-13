/**
 * useCelebrationStage — one-overlay-at-a-time coordination for the post-ride
 * celebration overlays (review 2026-06-12, P2). See
 * `src/store/celebrationStage.ts` for the priority/stickiness model.
 *
 * Each overlay manager calls this with its `kind` and whether it currently
 * `wants` to show. The hook registers that want with the store and returns
 * whether this kind currently holds the stage. Managers should only render /
 * advance their overlay while `canShow` is true.
 *
 * Usage:
 *   const wants = appState !== 'NAVIGATING' && hasContent;
 *   const canShow = useCelebrationStage('badge', wants);
 *   if (!canShow) return null;
 */
import { useEffect } from 'react';

import type { CelebrationKind } from '../../store/celebrationStage';
import { useAppStore } from '../../store/appStore';

export const useCelebrationStage = (
  kind: CelebrationKind,
  wants: boolean,
): boolean => {
  const setCelebrationWant = useAppStore((s) => s.setCelebrationWant);
  const active = useAppStore((s) => s.activeCelebration);

  useEffect(() => {
    setCelebrationWant(kind, wants);
  }, [kind, wants, setCelebrationWant]);

  // Release the stage on unmount so a manager that unmounts mid-celebration
  // (e.g. a screen teardown) never deadlocks the queue.
  useEffect(() => {
    return () => setCelebrationWant(kind, false);
  }, [kind, setCelebrationWant]);

  return active === kind;
};
