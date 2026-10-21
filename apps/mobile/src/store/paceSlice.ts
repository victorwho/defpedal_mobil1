import type { RiderPace } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Ride times at the rider's own pace (docs/plans/adaptive-eta.md, Phase 1).
// ---------------------------------------------------------------------------

export type PaceSliceState = {
  /**
   * Profile > Display > "Ride times at my pace". DEVICE-scoped like the other
   * Display toggles: NOT reset by resetUserScopedState.
   */
  paceEtaEnabled: boolean;
  /**
   * The pace last computed from trip history, kept so cold starts and
   * offline rides still show a personal time. USER-scoped: it describes how
   * one account rides, so resetUserScopedState clears it.
   */
  riderPaceSnapshot: RiderPace | null;
};

export type PaceSliceActions = {
  setPaceEtaEnabled: (enabled: boolean) => void;
  setRiderPaceSnapshot: (pace: RiderPace) => void;
};

export type PaceSlice = PaceSliceState & PaceSliceActions;

export const DEFAULT_PACE_SLICE_STATE: PaceSliceState = {
  paceEtaEnabled: true,
  riderPaceSnapshot: null,
};

/** The user-scoped part, spread into resetUserScopedState. */
export const RESET_PACE_SLICE_STATE: Pick<PaceSliceState, 'riderPaceSnapshot'> = {
  riderPaceSnapshot: null,
};

const samePace = (a: RiderPace | null, b: RiderPace): boolean =>
  a !== null && a.kmh === b.kmh && a.personal === b.personal && a.rideCount === b.rideCount;

export const createPaceSlice = (
  set: (fn: (state: PaceSliceState) => Partial<PaceSliceState>) => void,
): PaceSlice => ({
  ...DEFAULT_PACE_SLICE_STATE,
  setPaceEtaEnabled: (enabled) => set(() => ({ paceEtaEnabled: enabled })),
  // Unchanged pace = no write: every screen that shows a time recomputes it
  // when trip history refetches, and a persist write per screen is waste.
  setRiderPaceSnapshot: (pace) =>
    set((state) => (samePace(state.riderPaceSnapshot, pace) ? {} : { riderPaceSnapshot: pace })),
});
