import { describe, expect, it } from 'vitest';

import {
  computePostSignupStepTarget,
  type PostSignupStepState,
} from '../computePostSignupStepTarget';

const base: PostSignupStepState = {
  pathname: '/',
  appState: 'IDLE',
  storeHydrated: true,
  isLoading: false,
  hasRealAccount: true,
  bikeTypeId: null,
  bikeTypePromptSeen: false,
};

const at = (overrides: Partial<PostSignupStepState>) =>
  computePostSignupStepTarget({ ...base, ...overrides });

describe('computePostSignupStepTarget', () => {
  it('sends a freshly-signed-up rider to the bike-type step', () => {
    expect(at({})).toBe('/onboarding/bike-type');
  });

  it('waits for hydration and auth before deciding', () => {
    // Deciding early would bounce a rider whose persisted answer has not
    // loaded yet — they would be asked a question they already answered.
    expect(at({ storeHydrated: false })).toBeNull();
    expect(at({ isLoading: true })).toBeNull();
  });

  it('defers entirely to the signup wall when there is no account', () => {
    expect(at({ hasRealAccount: false })).toBeNull();
  });

  it('stops asking once the rider has answered or skipped', () => {
    expect(at({ bikeTypeId: 'road' })).toBeNull();
    expect(at({ bikeTypePromptSeen: true })).toBeNull();
  });

  it('never interrupts an active ride or a post-ride summary', () => {
    // Both screens hold data that a redirect would destroy.
    expect(at({ pathname: '/navigation' })).toBeNull();
    expect(at({ pathname: '/feedback' })).toBeNull();
  });

  it('protects an active ride by app state, not just by path', () => {
    // app/index.tsx always evaluates at '/', so the path guard alone cannot
    // see a ride in progress — it would have hijacked ride recovery into the
    // preference screen, losing the ride.
    expect(at({ pathname: '/', appState: 'NAVIGATING' })).toBeNull();
    expect(at({ pathname: '/', appState: 'AWAITING_FEEDBACK' })).toBeNull();
    expect(at({ pathname: '/', appState: 'ROUTE_PREVIEW' })).toBe('/onboarding/bike-type');
  });

  it('leaves the auth screen alone while the rider is signing in', () => {
    expect(at({ pathname: '/auth' })).toBeNull();
  });

  it('terminates once the rider is on the step itself', () => {
    // The target lives under /onboarding, which is a protected path — so the
    // function goes quiet the moment the redirect lands. Without this the
    // redirect would re-fire every render.
    expect(at({ pathname: '/onboarding/bike-type' })).toBeNull();
  });

  it('is reachable for BOTH signup providers, because it keys off state', () => {
    // The regression this guards: Google/Apple converge on
    // navigateAfterOnboarding(), but auth.tsx performs NO navigation after a
    // successful email signup — an email rider simply appears at '/' with an
    // account. A path-anchored step would skip every one of them.
    const googleRider = at({ pathname: '/' });
    const emailRider = at({ pathname: '/' });
    expect(googleRider).toBe('/onboarding/bike-type');
    expect(emailRider).toBe('/onboarding/bike-type');
  });
});
