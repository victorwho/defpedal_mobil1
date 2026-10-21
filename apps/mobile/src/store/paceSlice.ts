import type { RiderPace, RiderPaces } from '@defensivepedal/core';

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
   * The paces (one per bike) last computed from trip history, kept so cold
   * starts and offline rides still show a personal time. USER-scoped: they
   * describe how one account rides, so resetUserScopedState clears them.
   * Replaced `riderPaceSnapshot` (one pace) in Phase 3; an old persisted
   * value under that name is simply ignored.
   */
  riderPaces: RiderPaces | null;
};

export type PaceSliceActions = {
  setPaceEtaEnabled: (enabled: boolean) => void;
  setRiderPaces: (paces: RiderPaces) => void;
};

export type PaceSlice = PaceSliceState & PaceSliceActions;

export const DEFAULT_PACE_SLICE_STATE: PaceSliceState = {
  paceEtaEnabled: true,
  riderPaces: null,
};

/** The user-scoped part, spread into resetUserScopedState. */
export const RESET_PACE_SLICE_STATE: Pick<PaceSliceState, 'riderPaces'> = {
  riderPaces: null,
};

const samePace = (a: RiderPace, b: RiderPace): boolean =>
  a.kmh === b.kmh &&
  a.personal === b.personal &&
  a.rideCount === b.rideCount &&
  a.routerFactor === b.routerFactor;

const samePaces = (a: RiderPaces | null, b: RiderPaces): boolean =>
  a !== null && samePace(a.normal, b.normal) && samePace(a.ebike, b.ebike);

export const createPaceSlice = (
  set: (fn: (state: PaceSliceState) => Partial<PaceSliceState>) => void,
): PaceSlice => ({
  ...DEFAULT_PACE_SLICE_STATE,
  setPaceEtaEnabled: (enabled) => set(() => ({ paceEtaEnabled: enabled })),
  // Unchanged pace = no write: every screen that shows a time recomputes it
  // when trip history refetches, and a persist write per screen is waste.
  setRiderPaces: (paces) =>
    set((state) => (samePaces(state.riderPaces, paces) ? {} : { riderPaces: paces })),
});
