/**
 * Pedal Plus nudge rulebook — plan: docs/plans/pedal-plus-nudges.md.
 *
 * Pure decisions only. The store holds the persisted state, screens hold the
 * rendering; everything that decides WHETHER a Plus surface may appear lives
 * here so it can be tested without React. Same shape as `analytics-optin.ts`.
 *
 * Two kinds of surface:
 *
 *  - UNSOLICITED (`PlusNudgeSurface`): the rider did not ask. The one-time
 *    "your mode moved to Plus" notice, the post-ride e-bike card and the
 *    hot-day Cool chip. These are capped: at most one per session, each at
 *    most once per 14 days, two dismissals retire a surface for good, and any
 *    subscription retires all of them.
 *
 *  - SOLICITED: a locked mode pill, a limit card, a near-limit counter. The
 *    rider is standing on the thing, or tapped it. Not counted and not capped
 *    here — capping them would hide a control, not a prompt.
 *
 * Every surface, of both kinds, is off while `uiEnabled` is false (the dark
 * launch) and while the rider is NAVIGATING. A rider on the road is not a
 * sales opportunity.
 */
import type { AppState } from '@defensivepedal/core';

export type PlusNudgeSurface = 'modes_moved' | 'ebike_post_ride' | 'cool_hot_day';

export interface PlusNudgeSurfaceState {
  readonly lastShownAt: string | null;
  readonly dismissals: number;
}

export interface PlusNudgeState {
  readonly surfaces: Partial<Record<PlusNudgeSurface, PlusNudgeSurfaceState>>;
  /** Set when the rider subscribes or restores — retires every surface. */
  readonly retiredAt: string | null;
}

export const EMPTY_PLUS_NUDGE_STATE: PlusNudgeState = { surfaces: {}, retiredAt: null };

export const PLUS_NUDGE_SPACING_DAYS = 14;
export const PLUS_NUDGE_MAX_DISMISSALS = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PlusNudgeContext {
  readonly state: PlusNudgeState;
  readonly uiEnabled: boolean;
  readonly isPlus: boolean;
  readonly appState: AppState;
  readonly now: Date;
}

/** Gates every Plus surface, solicited or not. */
export const isPlusUpsellAllowed = (
  ctx: Pick<PlusNudgeContext, 'uiEnabled' | 'isPlus' | 'appState'>,
): boolean => ctx.uiEnabled && !ctx.isPlus && ctx.appState !== 'NAVIGATING';

/** Persistent caps for one unsolicited surface (session latch not included). */
export const isPlusNudgeEligible = (
  surface: PlusNudgeSurface,
  ctx: PlusNudgeContext,
): boolean => {
  if (!isPlusUpsellAllowed(ctx)) return false;
  if (ctx.state.retiredAt) return false;

  const entry = ctx.state.surfaces[surface];
  if (!entry) return true;
  if (entry.dismissals >= PLUS_NUDGE_MAX_DISMISSALS) return false;
  if (!entry.lastShownAt) return true;

  const shown = Date.parse(entry.lastShownAt);
  if (Number.isNaN(shown)) return true;
  return ctx.now.getTime() - shown >= PLUS_NUDGE_SPACING_DAYS * MS_PER_DAY;
};

export const withPlusNudgeShown = (
  state: PlusNudgeState,
  surface: PlusNudgeSurface,
  nowIso: string,
): PlusNudgeState => {
  const prev = state.surfaces[surface] ?? { lastShownAt: null, dismissals: 0 };
  return {
    ...state,
    surfaces: { ...state.surfaces, [surface]: { ...prev, lastShownAt: nowIso } },
  };
};

export const withPlusNudgeDismissed = (
  state: PlusNudgeState,
  surface: PlusNudgeSurface,
): PlusNudgeState => {
  const prev = state.surfaces[surface] ?? { lastShownAt: null, dismissals: 0 };
  return {
    ...state,
    surfaces: { ...state.surfaces, [surface]: { ...prev, dismissals: prev.dismissals + 1 } },
  };
};

export const withPlusNudgesRetired = (state: PlusNudgeState, nowIso: string): PlusNudgeState =>
  state.retiredAt ? state : { ...state, retiredAt: nowIso };

// ---------------------------------------------------------------------------
// Session latch — at most ONE unsolicited Plus surface per app session.
// Module-level state is session-scoped by construction (cleared on process
// restart), the same boundary `prompt-arbitration.ts` uses.
// ---------------------------------------------------------------------------

let claimedThisSession: PlusNudgeSurface | null = null;

/**
 * Claim this session's one unsolicited Plus slot. Re-claiming the surface that
 * already holds it returns true, so a re-render does not hide what is showing.
 */
export const claimPlusNudgeSlot = (surface: PlusNudgeSurface): boolean => {
  if (claimedThisSession === null) {
    claimedThisSession = surface;
    return true;
  }
  return claimedThisSession === surface;
};

export const isPlusNudgeSlotAvailable = (surface: PlusNudgeSurface): boolean =>
  claimedThisSession === null || claimedThisSession === surface;

/** Test-only. */
export const resetPlusNudgeSessionForTest = (): void => {
  claimedThisSession = null;
};

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export type PlusRoutingMode = 'ebike' | 'cool';

export interface PlusModesUsed {
  readonly ebike?: string;
  readonly cool?: string;
}

/**
 * Which modes the "moved to Plus" notice should name, E-bike first.
 *
 * E-bike counts a rider who used the mode OR who told us they ride an e-bike —
 * the only signal that exists for riders whose app predates the usage stamp.
 * Cool counts only a rider who used it, and only where the shade graph exists;
 * naming Cool to a rider who cannot use it would be selling missing coverage.
 */
export const modesMovedToPlusFor = (input: {
  readonly used: PlusModesUsed;
  readonly bikeTypeId: string | null;
  readonly coolCovered: boolean;
}): PlusRoutingMode[] => {
  const modes: PlusRoutingMode[] = [];
  if (input.used.ebike || input.bikeTypeId === 'ebike') modes.push('ebike');
  if (input.used.cool && input.coolCovered) modes.push('cool');
  return modes;
};

/** Hot enough that Cool is worth a mention. Air temperature, °C. */
export const COOL_HOT_DAY_THRESHOLD_C = 28;

export const isHotDayForCool = (temperatureC: number | null | undefined): boolean =>
  typeof temperatureC === 'number' &&
  Number.isFinite(temperatureC) &&
  temperatureC >= COOL_HOT_DAY_THRESHOLD_C;

/**
 * Show the post-ride e-bike suggestion? Only to someone who told us they ride
 * an e-bike, who rode something else, after their first two rides (the first
 * rides belong to the rider, not to a sale), and only after a ride they liked.
 */
export const EBIKE_POST_RIDE_MIN_RIDES = 3;

export const shouldSuggestEbikeAfterRide = (input: {
  readonly bikeTypeId: string | null;
  readonly rodeEbikeMode: boolean;
  readonly completedRideCount: number;
  readonly rating: number | null;
}): boolean =>
  input.bikeTypeId === 'ebike' &&
  !input.rodeEbikeMode &&
  input.completedRideCount >= EBIKE_POST_RIDE_MIN_RIDES &&
  (input.rating ?? 0) >= 4;

/**
 * Is the NEXT addition the last one the free tier allows?
 *
 * Built on the screen's own `block*` predicate from `usePremium` rather than
 * on the raw limit, so every exemption that predicate already folds in —
 * Plus, grandfathered accounts, the dark launch — silences the hint too, with
 * no second copy of those rules (error-log #20).
 */
export const isLastAllowedAddition = (
  block: (currentCount: number) => boolean,
  currentCount: number,
): boolean => !block(currentCount) && block(currentCount + 1);
