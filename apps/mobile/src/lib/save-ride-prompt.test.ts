import { describe, expect, it } from 'vitest';

import {
  SAVE_RIDE_MAX_DISMISSALS,
  isSaveRideScheduledRide,
  shouldShowSaveRidePrompt,
  type SaveRidePromptInput,
} from './save-ride-prompt';

const base: SaveRidePromptInput = {
  isAnonymous: true,
  completedRideCount: 1,
  state: { lastShownRide: 0, dismissCount: 0 },
  isNavigating: false,
};

describe('isSaveRideScheduledRide', () => {
  it.each([
    [1, true],
    [2, false],
    [3, true],
    [4, false],
    [5, false],
    [6, false],
    [7, false],
    [8, true],
    [9, false],
    [12, false],
    [13, true],
    [18, true],
    [23, true],
    [0, false],
  ])('ride %s → %s', (ride, expected) => {
    expect(isSaveRideScheduledRide(ride)).toBe(expected);
  });
});

describe('shouldShowSaveRidePrompt', () => {
  it('shows for an anonymous rider on ride 1', () => {
    expect(shouldShowSaveRidePrompt(base)).toBe(true);
  });

  it('never shows for a registered user', () => {
    expect(shouldShowSaveRidePrompt({ ...base, isAnonymous: false })).toBe(false);
  });

  it('never shows during navigation', () => {
    expect(shouldShowSaveRidePrompt({ ...base, isNavigating: true })).toBe(false);
  });

  it('never shows before the first completed ride', () => {
    expect(shouldShowSaveRidePrompt({ ...base, completedRideCount: 0 })).toBe(false);
  });

  it('follows the ride schedule (1, 3, then every 5th)', () => {
    const at = (ride: number) =>
      shouldShowSaveRidePrompt({ ...base, completedRideCount: ride });
    expect(at(1)).toBe(true);
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
    expect(at(4)).toBe(false);
    expect(at(5)).toBe(false);
    expect(at(7)).toBe(false);
    expect(at(8)).toBe(true);
    expect(at(13)).toBe(true);
  });

  it('stops forever after the dismissal cap', () => {
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        state: { lastShownRide: 0, dismissCount: SAVE_RIDE_MAX_DISMISSALS },
      }),
    ).toBe(false);
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        completedRideCount: 8,
        state: { lastShownRide: 3, dismissCount: 3 },
      }),
    ).toBe(false);
  });

  it('still shows with one dismissal recorded', () => {
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        completedRideCount: 3,
        state: { lastShownRide: 1, dismissCount: 1 },
      }),
    ).toBe(true);
  });

  it('does not re-show for a ride it was already shown on', () => {
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        completedRideCount: 3,
        state: { lastShownRide: 3, dismissCount: 0 },
      }),
    ).toBe(false);
    // Defensive: lastShownRide ahead of count (reset races) also suppresses.
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        completedRideCount: 3,
        state: { lastShownRide: 8, dismissCount: 0 },
      }),
    ).toBe(false);
  });

  it('a fresh state (new account relationship) starts the schedule over', () => {
    // resetUserScopedState clears the slice → lastShownRide 0, dismissCount 0.
    expect(
      shouldShowSaveRidePrompt({
        ...base,
        completedRideCount: 1,
        state: { lastShownRide: 0, dismissCount: 0 },
      }),
    ).toBe(true);
  });
});
