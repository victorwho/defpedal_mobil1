import { describe, expect, it } from 'vitest';

// Imported from the pure decision module so this test doesn't pull in
// expo-router / expo-modules-core. The hook wrapper (`useOnboardingGate`)
// is covered by the companion `.integration.test.tsx`.
import {
  computeOnboardingGateTarget,
  type OnboardingGateState,
} from './computeOnboardingGateTarget';

// Sensible defaults for the "fresh anonymous session, already on the main
// screen" baseline. Individual tests override just the fields they care about.
const fresh = (overrides: Partial<OnboardingGateState> = {}): OnboardingGateState => ({
  pathname: '/route-planning',
  onboardingCompleted: false,
  storeHydrated: true,
  isLoading: false,
  hasRealAccount: false,
  ...overrides,
});

describe('computeOnboardingGateTarget', () => {
  // ── Hydration + auth gates ────────────────────────────────────────────

  it('returns null while the store has not hydrated yet', () => {
    // This is the decision that kept the increment-effect from clobbering
    // persisted state. The gate should do NOTHING until hydration settles.
    expect(computeOnboardingGateTarget(fresh({ storeHydrated: false }))).toBeNull();
  });

  it('returns null while auth is still loading', () => {
    expect(computeOnboardingGateTarget(fresh({ isLoading: true }))).toBeNull();
  });

  it('returns null for users with a real (non-anonymous) account', () => {
    // Real accounts bypass the gate entirely, even on fresh installs where
    // they somehow have onboardingCompleted=false.
    expect(
      computeOnboardingGateTarget(
        fresh({ hasRealAccount: true, onboardingCompleted: false }),
      ),
    ).toBeNull();
  });

  // ── Exempt paths ──────────────────────────────────────────────────────

  it.each([
    '/onboarding',
    '/onboarding/safety-score',
    '/onboarding/signup-prompt',
    '/feedback',
    '/navigation',
    '/auth',
  ])('does not redirect away from exempt path %s', (pathname) => {
    expect(
      computeOnboardingGateTarget(fresh({ pathname, onboardingCompleted: false })),
    ).toBeNull();
    expect(
      computeOnboardingGateTarget(fresh({ pathname, onboardingCompleted: true })),
    ).toBeNull();
  });

  // ── Fresh installs re-enter the intro flow ────────────────────────────

  it('redirects fresh-install users (onboardingCompleted=false) to /onboarding', () => {
    expect(
      computeOnboardingGateTarget(fresh({ onboardingCompleted: false })),
    ).toBe('/onboarding');
  });

  // ── Mandatory registration (2026-07-24) ───────────────────────────────

  it('walls anonymous users at the signup prompt once onboarding is complete', () => {
    // No count escalation, no dismissible variant: an anonymous session with
    // onboarding done is ALWAYS sent to the signup prompt.
    expect(
      computeOnboardingGateTarget(fresh({ onboardingCompleted: true })),
    ).toBe('/onboarding/signup-prompt');
  });

  it('keeps firing on every evaluation — hardware back / nav-away cannot escape', () => {
    // The gate is stateless: evaluating the same non-exempt state twice
    // yields the same redirect. Loop-termination comes from the exempt-path
    // rule once the user actually lands on the target.
    const state = fresh({ onboardingCompleted: true });
    expect(computeOnboardingGateTarget(state)).toBe('/onboarding/signup-prompt');
    expect(computeOnboardingGateTarget(state)).toBe('/onboarding/signup-prompt');
  });

  it('also keeps re-firing the intro-flow redirect — the intro cannot be dismissed either', () => {
    const state = fresh({ onboardingCompleted: false });
    expect(computeOnboardingGateTarget(state)).toBe('/onboarding');
    expect(computeOnboardingGateTarget(state)).toBe('/onboarding');
  });

  // ── Active navigation / post-ride feedback guarantees ─────────────────

  it('never yanks an anonymous user out of the navigation screen', () => {
    // A pre-mandatory-signup install can update mid-persisted-ride. If the
    // gate fired during a live ride, the user would lose their navigation
    // session mid-ride — unacceptable.
    expect(
      computeOnboardingGateTarget(
        fresh({ pathname: '/navigation', onboardingCompleted: true }),
      ),
    ).toBeNull();
  });

  it('never yanks an anonymous user out of the post-ride feedback screen', () => {
    expect(
      computeOnboardingGateTarget(
        fresh({ pathname: '/feedback', onboardingCompleted: true }),
      ),
    ).toBeNull();
  });

  it('never bounces an anonymous user off /auth — they are actively complying with the gate', () => {
    // Regression test: tapping "Use email instead" on the mandatory prompt
    // navigates to /auth. Without an /auth exemption, the guard re-fires
    // immediately and bounces the user back to the prompt, making the button
    // look like a no-op.
    expect(
      computeOnboardingGateTarget(
        fresh({ pathname: '/auth', onboardingCompleted: true }),
      ),
    ).toBeNull();
  });

  // ── Boundary conditions ───────────────────────────────────────────────

  it('handles initial expo-router pathname "/" as a non-exempt path', () => {
    // Whether it's "/" or "/route-planning", both must trigger the gate.
    expect(
      computeOnboardingGateTarget(fresh({ pathname: '/', onboardingCompleted: false })),
    ).toBe('/onboarding');
  });

  it('handles an empty-string pathname without throwing', () => {
    // Defensive: usePathname() has been observed to return '' in very early
    // renders under bridgeless. The gate must still decide sanely.
    expect(
      computeOnboardingGateTarget(fresh({ pathname: '', onboardingCompleted: false })),
    ).toBe('/onboarding');
  });
});
