import { beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_PLUS_NUDGE_STATE,
  PLUS_NUDGE_SPACING_DAYS,
  claimPlusNudgeSlot,
  isHotDayForCool,
  isPlusNudgeEligible,
  isPlusNudgeSlotAvailable,
  isPlusUpsellAllowed,
  modesMovedToPlusFor,
  isLastAllowedAddition,
  resetPlusNudgeSessionForTest,
  shouldSuggestEbikeAfterRide,
  withPlusNudgeDismissed,
  withPlusNudgeShown,
  withPlusNudgesRetired,
  type PlusNudgeContext,
} from './plus-nudges';

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const ctx = (overrides: Partial<PlusNudgeContext> = {}): PlusNudgeContext => ({
  state: EMPTY_PLUS_NUDGE_STATE,
  uiEnabled: true,
  isPlus: false,
  appState: 'IDLE',
  now: NOW,
  ...overrides,
});

describe('isPlusUpsellAllowed — the gates every Plus surface shares', () => {
  it('allows a free rider with the paywall live', () => {
    expect(isPlusUpsellAllowed(ctx())).toBe(true);
  });

  it('shows nothing during the dark launch', () => {
    expect(isPlusUpsellAllowed(ctx({ uiEnabled: false }))).toBe(false);
  });

  it('never sells Plus to a subscriber', () => {
    expect(isPlusUpsellAllowed(ctx({ isPlus: true }))).toBe(false);
  });

  it('never shows mid-ride', () => {
    expect(isPlusUpsellAllowed(ctx({ appState: 'NAVIGATING' }))).toBe(false);
  });
});

describe('isPlusNudgeEligible — caps', () => {
  it('is eligible on a fresh state', () => {
    expect(isPlusNudgeEligible('ebike_post_ride', ctx())).toBe(true);
  });

  it('waits the spacing window after a show', () => {
    const shown = withPlusNudgeShown(EMPTY_PLUS_NUDGE_STATE, 'ebike_post_ride', daysAgo(3));
    expect(isPlusNudgeEligible('ebike_post_ride', ctx({ state: shown }))).toBe(false);

    const old = withPlusNudgeShown(
      EMPTY_PLUS_NUDGE_STATE,
      'ebike_post_ride',
      daysAgo(PLUS_NUDGE_SPACING_DAYS),
    );
    expect(isPlusNudgeEligible('ebike_post_ride', ctx({ state: old }))).toBe(true);
  });

  it('spaces each surface independently', () => {
    const shown = withPlusNudgeShown(EMPTY_PLUS_NUDGE_STATE, 'ebike_post_ride', daysAgo(1));
    expect(isPlusNudgeEligible('cool_hot_day', ctx({ state: shown }))).toBe(true);
  });

  it('retires a surface after two dismissals', () => {
    const once = withPlusNudgeDismissed(EMPTY_PLUS_NUDGE_STATE, 'cool_hot_day');
    expect(isPlusNudgeEligible('cool_hot_day', ctx({ state: once }))).toBe(true);
    const twice = withPlusNudgeDismissed(once, 'cool_hot_day');
    expect(isPlusNudgeEligible('cool_hot_day', ctx({ state: twice }))).toBe(false);
  });

  it('retires every surface once the rider subscribes', () => {
    const retired = withPlusNudgesRetired(EMPTY_PLUS_NUDGE_STATE, NOW.toISOString());
    expect(isPlusNudgeEligible('modes_moved', ctx({ state: retired }))).toBe(false);
    expect(isPlusNudgeEligible('ebike_post_ride', ctx({ state: retired }))).toBe(false);
  });

  it('does not mutate the state it is given', () => {
    const before = EMPTY_PLUS_NUDGE_STATE;
    withPlusNudgeShown(before, 'modes_moved', NOW.toISOString());
    withPlusNudgeDismissed(before, 'modes_moved');
    expect(before).toEqual({ surfaces: {}, retiredAt: null });
  });
});

describe('session latch — one unsolicited Plus surface per session', () => {
  beforeEach(() => resetPlusNudgeSessionForTest());

  it('lets the first surface claim and blocks the others', () => {
    expect(claimPlusNudgeSlot('cool_hot_day')).toBe(true);
    expect(claimPlusNudgeSlot('ebike_post_ride')).toBe(false);
    expect(isPlusNudgeSlotAvailable('modes_moved')).toBe(false);
  });

  it('keeps the slot for the surface that holds it across re-renders', () => {
    expect(claimPlusNudgeSlot('cool_hot_day')).toBe(true);
    expect(claimPlusNudgeSlot('cool_hot_day')).toBe(true);
  });
});

describe('modesMovedToPlusFor', () => {
  it('names E-bike for a rider who used it', () => {
    expect(
      modesMovedToPlusFor({ used: { ebike: 'x' }, bikeTypeId: null, coolCovered: true }),
    ).toEqual(['ebike']);
  });

  it('names E-bike for an e-bike owner with no usage record', () => {
    // Fielded builds predate the usage stamp; the bike type is the fallback.
    expect(
      modesMovedToPlusFor({ used: {}, bikeTypeId: 'ebike', coolCovered: true }),
    ).toEqual(['ebike']);
  });

  it('names Cool only where the shade graph exists', () => {
    expect(
      modesMovedToPlusFor({ used: { cool: 'x' }, bikeTypeId: null, coolCovered: false }),
    ).toEqual([]);
    expect(
      modesMovedToPlusFor({ used: { cool: 'x' }, bikeTypeId: null, coolCovered: true }),
    ).toEqual(['cool']);
  });

  it('names nothing for a rider who never touched either', () => {
    expect(modesMovedToPlusFor({ used: {}, bikeTypeId: 'road', coolCovered: true })).toEqual([]);
  });
});

describe('isHotDayForCool', () => {
  it('is hot at the threshold and above', () => {
    expect(isHotDayForCool(28)).toBe(true);
    expect(isHotDayForCool(33.4)).toBe(true);
  });

  it('is not hot below it, or without a reading', () => {
    expect(isHotDayForCool(27.9)).toBe(false);
    expect(isHotDayForCool(null)).toBe(false);
    expect(isHotDayForCool(Number.NaN)).toBe(false);
  });
});

describe('shouldSuggestEbikeAfterRide', () => {
  const base = { bikeTypeId: 'ebike', rodeEbikeMode: false, completedRideCount: 5, rating: 5 };

  it('suggests E-bike mode to an e-bike owner who rode another mode', () => {
    expect(shouldSuggestEbikeAfterRide(base)).toBe(true);
  });

  it('stays quiet for anyone who does not ride an e-bike', () => {
    expect(shouldSuggestEbikeAfterRide({ ...base, bikeTypeId: 'road' })).toBe(false);
  });

  it('stays quiet when they already rode E-bike mode', () => {
    expect(shouldSuggestEbikeAfterRide({ ...base, rodeEbikeMode: true })).toBe(false);
  });

  it('leaves the first two rides alone', () => {
    expect(shouldSuggestEbikeAfterRide({ ...base, completedRideCount: 2 })).toBe(false);
  });

  it('only follows a ride the rider liked', () => {
    expect(shouldSuggestEbikeAfterRide({ ...base, rating: 3 })).toBe(false);
    expect(shouldSuggestEbikeAfterRide({ ...base, rating: null })).toBe(false);
  });
});

describe('isLastAllowedAddition', () => {
  const capAt5 = (n: number) => n >= 5;

  it('is true when this addition is the last one allowed', () => {
    expect(isLastAllowedAddition(capAt5, 4)).toBe(true);
  });

  it('is false earlier, and once already blocked', () => {
    expect(isLastAllowedAddition(capAt5, 3)).toBe(false);
    expect(isLastAllowedAddition(capAt5, 5)).toBe(false);
  });

  it('is silent when nothing is enforced (Plus, grandfathered, dark launch)', () => {
    expect(isLastAllowedAddition(() => false, 4)).toBe(false);
  });
});
