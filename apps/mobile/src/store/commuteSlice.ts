/**
 * Commute mode settings: which days the rider commutes, when they leave, and
 * the last route estimate for each direction. Plan: docs/plans/commute-mode.md.
 *
 * USER-SCOPED, like `savedPlaces`, which it depends on: a commute schedule
 * describes where one account lives and works, so `resetUserScopedState`
 * clears it and it must never greet the next account on this device.
 *
 * Commute is only scheduled once `departTime` is set. There is no default
 * departure time on purpose: the rider picks it during setup.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommuteDirection = 'to_work' | 'to_home';

/** Safe-route estimate for one direction, refreshed at most once a day. */
export interface CommuteRouteEstimate {
  readonly direction: CommuteDirection;
  readonly durationSeconds: number;
  readonly distanceMeters: number;
  /** Route ascent; absent on estimates cached before it was recorded. */
  readonly climbMeters?: number | null;
  readonly fetchedAt: string;
  /** Identifies the Home/Work pair it was fetched for; a change invalidates it. */
  readonly placesKey: string;
}

export interface CommuteSettings {
  readonly enabled: boolean;
  /** ISO weekdays, 1 = Monday to 7 = Sunday, sorted and unique. */
  readonly days: readonly number[];
  /** 'HH:MM' departure from Home; null until chosen in setup. */
  readonly departTime: string | null;
  /** 'HH:MM' departure from Work; null = no evening briefing. */
  readonly returnTime: string | null;
  readonly routeEstimates: readonly CommuteRouteEstimate[];
}

export type CommuteSliceState = {
  commute: CommuteSettings;
};

export type CommuteSliceActions = {
  /** Finish setup: turns Commute on with the chosen departure time. */
  enableCommute: (departTime: string) => void;
  disableCommute: () => void;
  setCommuteDays: (days: readonly number[]) => void;
  setCommuteDepartTime: (time: string) => void;
  setCommuteReturnTime: (time: string | null) => void;
  setCommuteRouteEstimate: (estimate: CommuteRouteEstimate) => void;
};

export type CommuteSlice = CommuteSliceState & CommuteSliceActions;

// ---------------------------------------------------------------------------
// Defaults + validation
// ---------------------------------------------------------------------------

/** The briefing fires this long before the departure time. */
export const COMMUTE_LEAD_MINUTES = 15;

export const DEFAULT_COMMUTE_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export const DEFAULT_COMMUTE_SLICE_STATE: CommuteSliceState = {
  commute: {
    enabled: false,
    days: DEFAULT_COMMUTE_DAYS,
    departTime: null,
    returnTime: null,
    routeEstimates: [],
  },
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Zero-padded 24 h 'HH:MM', the format the schedule builder compares on. */
export const isCommuteTime = (value: string): boolean => TIME_PATTERN.test(value);

const normalizeDays = (days: readonly number[]): number[] =>
  [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const createCommuteSlice = (
  set: (fn: (state: CommuteSliceState) => Partial<CommuteSliceState>) => void,
): CommuteSlice => {
  const update = (patch: (c: CommuteSettings) => Partial<CommuteSettings> | null) =>
    set((state) => {
      const change = patch(state.commute);
      return change ? { commute: { ...state.commute, ...change } } : {};
    });

  return {
    ...DEFAULT_COMMUTE_SLICE_STATE,

    // Invalid input is ignored rather than stored: a malformed time would
    // otherwise sit in persisted state and silently schedule nothing.
    enableCommute: (departTime) =>
      update(() => (isCommuteTime(departTime) ? { enabled: true, departTime } : null)),
    disableCommute: () => update(() => ({ enabled: false })),
    setCommuteDays: (days) => update(() => ({ days: normalizeDays(days) })),
    setCommuteDepartTime: (time) =>
      update(() => (isCommuteTime(time) ? { departTime: time } : null)),
    setCommuteReturnTime: (time) =>
      update(() => (time === null || isCommuteTime(time) ? { returnTime: time } : null)),
    setCommuteRouteEstimate: (estimate) =>
      update((c) => ({
        routeEstimates: [
          ...c.routeEstimates.filter((e) => e.direction !== estimate.direction),
          estimate,
        ],
      })),
  };
};
