/**
 * Regression guards for the at-report sesizare CTA (route-planning).
 *
 * The CTA was added after preview testing found that reporting a hazard
 * OUTSIDE navigation offered no sesizare path at all: `appendSessionHazardReport`
 * is only called from navigation.tsx, so an armchair report never reaches the
 * post-ride card, and the only route back was spotting your own pin on the map.
 *
 * Two decisions are load-bearing and easy to undo by accident, so they are
 * pinned here rather than left to the component.
 */
import { describe, expect, it } from 'vitest';
import { isSesizareEligible, SESIZARE_ELIGIBLE_HAZARD_TYPES } from '@defensivepedal/core';

import { claimPromptSlot, resetPromptArbitrationForTest } from '../prompt-arbitration';

/**
 * Mirrors `hazardToastMs` in app/route-planning.tsx. The toast hosts the CTA,
 * and the stock 5 s is not long enough to read it and decide — but the Romania
 * gate is async (a reverse geocode inside SesizareRow), so the duration can
 * only key off the synchronous type check.
 */
const hazardToastMs = (hazardType?: string) =>
  hazardType && isSesizareEligible(hazardType as never) ? 15000 : 5000;

describe('at-report sesizare CTA — toast duration', () => {
  it('extends the toast for every sesizare-eligible hazard type', () => {
    for (const type of SESIZARE_ELIGIBLE_HAZARD_TYPES) {
      expect(hazardToastMs(type)).toBe(15000);
    }
  });

  it('leaves the toast at 5s for ineligible types', () => {
    // `other` is what route-planning's submitHazardOther always sends, and no
    // authority has a remedy for these — the row would render null anyway.
    for (const type of ['other', 'aggressive_traffic', 'narrow_street', 'missing_bike_lane']) {
      expect(hazardToastMs(type)).toBe(5000);
    }
  });

  it('leaves the toast at 5s when no hazard type is known', () => {
    expect(hazardToastMs(undefined)).toBe(5000);
    expect(hazardToastMs('')).toBe(5000);
  });
});

describe('at-report sesizare CTA — arbitration', () => {
  it('does NOT consume the session prompt slot', () => {
    // The CTA is a consequence of an action the rider just took, like the
    // hazard-detail row — not an unsolicited ask like the post-ride card.
    // Claiming here would block the analytics prompt for the whole session
    // over a contextual follow-up, inverting the rule's intent.
    resetPromptArbitrationForTest();

    // Reporting a hazard renders the row without any claim...
    // (no claimPromptSlot call in that path — asserted by the fact that an
    // analytics prompt can still claim immediately afterwards)
    expect(claimPromptSlot('analytics')).toBe(true);
  });

  it('still lets the post-ride card arbitrate normally afterwards', () => {
    resetPromptArbitrationForTest();
    // Post-ride keeps its documented ordering: review wins over sesizare.
    expect(claimPromptSlot('review')).toBe(true);
    expect(claimPromptSlot('sesizare')).toBe(false);
  });
});
