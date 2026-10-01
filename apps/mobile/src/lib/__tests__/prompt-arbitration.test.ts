// @vitest-environment node
/**
 * Session arbitration between attention-asking card surfaces.
 *
 * Priority: SaveRideCard > ReviewPromptCard > SesizareCard > AnalyticsOptInCard.
 * The rule these tests protect is CLAUDE.md's: never two ask-surfaces in one
 * session for the analytics and sesizare cards.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimPromptSlot,
  isPromptSlotAvailable,
  resetPromptArbitrationForTest,
} from '../prompt-arbitration';

beforeEach(() => {
  resetPromptArbitrationForTest();
});

describe('claimPromptSlot — existing behaviour', () => {
  it('lets save_ride and review coexist in one session', () => {
    expect(claimPromptSlot('save_ride')).toBe(true);
    expect(claimPromptSlot('review')).toBe(true);
  });

  it('blocks analytics once save_ride showed', () => {
    claimPromptSlot('save_ride');
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('blocks save_ride and review once analytics showed', () => {
    claimPromptSlot('analytics');
    expect(claimPromptSlot('save_ride')).toBe(false);
    expect(claimPromptSlot('review')).toBe(false);
  });
});

describe('claimPromptSlot — sesizare', () => {
  it('claims freely when nothing else asked this session', () => {
    expect(claimPromptSlot('sesizare')).toBe(true);
  });

  it('yields to the review prompt', () => {
    claimPromptSlot('review');
    expect(claimPromptSlot('sesizare')).toBe(false);
  });

  it('yields to the save-ride card', () => {
    claimPromptSlot('save_ride');
    expect(claimPromptSlot('sesizare')).toBe(false);
  });

  it('yields to an analytics card that already showed', () => {
    claimPromptSlot('analytics');
    expect(claimPromptSlot('sesizare')).toBe(false);
  });

  it('blocks the analytics card once it has claimed — never two asks', () => {
    expect(claimPromptSlot('sesizare')).toBe(true);
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('does not block the review card, which sits above it', () => {
    // Ordering is enforced structurally (the sesizare card renders on the
    // post-submit view, after the review claim), so a sesizare claim must
    // not be able to starve a higher-priority surface.
    claimPromptSlot('sesizare');
    expect(claimPromptSlot('review')).toBe(true);
  });
});

describe('isPromptSlotAvailable', () => {
  it('mirrors claimPromptSlot without recording a claim', () => {
    expect(isPromptSlotAvailable('sesizare')).toBe(true);
    expect(isPromptSlotAvailable('sesizare')).toBe(true);
    expect(claimPromptSlot('sesizare')).toBe(true);
  });

  it('reports sesizare unavailable after a review claim', () => {
    claimPromptSlot('review');
    expect(isPromptSlotAvailable('sesizare')).toBe(false);
  });

  it('reports analytics unavailable after a sesizare claim', () => {
    claimPromptSlot('sesizare');
    expect(isPromptSlotAvailable('analytics')).toBe(false);
  });
});

describe('plus — the lowest-priority ask', () => {
  it('may claim a fresh session', () => {
    expect(claimPromptSlot('plus')).toBe(true);
  });

  it('yields to every other surface', () => {
    for (const other of ['save_ride', 'review', 'sesizare', 'analytics'] as const) {
      resetPromptArbitrationForTest();
      claimPromptSlot(other);
      expect(isPromptSlotAvailable('plus')).toBe(false);
      expect(claimPromptSlot('plus')).toBe(false);
    }
  });

  it('keeps the analytics ask out of a session it already used', () => {
    claimPromptSlot('plus');
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('never starves the rider’s own ride or the review card', () => {
    claimPromptSlot('plus');
    expect(claimPromptSlot('save_ride')).toBe(true);
    expect(claimPromptSlot('review')).toBe(true);
  });
});

describe('feature_intro — the app-open feature explainer', () => {
  it('may claim a fresh session', () => {
    expect(claimPromptSlot('feature_intro')).toBe(true);
  });

  it('yields to any ask already shown this session', () => {
    for (const other of ['save_ride', 'review', 'sesizare', 'analytics', 'plus'] as const) {
      resetPromptArbitrationForTest();
      claimPromptSlot(other);
      expect(isPromptSlotAvailable('feature_intro')).toBe(false);
      expect(claimPromptSlot('feature_intro')).toBe(false);
    }
  });

  it('keeps the Plus nudges and the analytics ask out of its session', () => {
    claimPromptSlot('feature_intro');
    expect(claimPromptSlot('plus')).toBe(false);
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('never blocks the rider’s own ride, the review card or a civic report', () => {
    claimPromptSlot('feature_intro');
    expect(claimPromptSlot('save_ride')).toBe(true);
    resetPromptArbitrationForTest();
    claimPromptSlot('feature_intro');
    expect(claimPromptSlot('review')).toBe(true);
  });
});
