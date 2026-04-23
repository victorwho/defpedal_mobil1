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
  anonymousOpenCount: 1,
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
    expect(
      computeOnboardingGateTarget(fresh({ storeHydrated: false }), false),
    ).toBeNull();
  });

  it('returns null while auth is still loading', () => {
    expect(
      computeOnboardingGateTarget(fresh({ isLoading: true }), false),
    ).toBeNull();
  });

  it('returns null for users with a real (non-anonymous) account', () => {
    // Real accounts bypass the gate entirely, even on fresh installs where
    // they somehow have count=0/onboardingCompleted=false.
    expect(
      computeOnboardingGateTarget(
        fresh({
          hasRealAccount: true,
          onboardingCompleted: false,
          anonymousOpenCount: 99,
        }),
        false,
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
  ])('does not redirect away from exempt path %s', (pathname) => {
    expect(
      computeOnboardingGateTarget(
        fresh({
          pathname,
          onboardingCompleted: false,
          anonymousOpenCount: 5,
        }),
        false,
      ),
    ).toBeNull();
  });

  // ── The regression this fix targets: fresh install, count == 1 ────────

  it('redirects fresh-install users (onboardingCompleted=false, count=1) to /onboarding/index', () => {
    // This is the EXACT state described in GH issue #23:
    //   Anonymous open count: 1
    //   Onboarding completed: false
    //   Is anonymous: true
    //   Has real account: false
    //   Storage engine: async-storage
    // The user reported no redirect firing; after the fix, this case must
    // resolve to /onboarding/index.
    const target = computeOnboardingGateTarget(
      fresh({ onboardingCompleted: false, anonymousOpenCount: 1 }),
      false,
    );
    expect(target).toBe('/onboarding');
  });

  it('still redirects to /onboarding/index when count is zero (first-ever boot before increment fires)', () => {
    // If we happen to evaluate the gate before the count-increment effect
    // runs on cold start, onboarding must still fire — otherwise a race
    // where hydration completes before the increment runs could leak the
    // user to /route-planning.
    expect(
      computeOnboardingGateTarget(fresh({ anonymousOpenCount: 0 }), false),
    ).toBe('/onboarding');
  });

  // ── Count-based escalation ────────────────────────────────────────────

  it('does not redirect when onboarding is complete and count is below 2', () => {
    // Normal anonymous user post-onboarding, on their first prompt-eligible
    // open: no prompt until count reaches 2.
    expect(
      computeOnboardingGateTarget(
        fresh({ onboardingCompleted: true, anonymousOpenCount: 1 }),
        false,
      ),
    ).toBeNull();
  });

  it('redirects to the dismissible signup prompt at count == 2', () => {
    const target = computeOnboardingGateTarget(
      fresh({ onboardingCompleted: true, anonymousOpenCount: 2 }),
      false,
    );
    expect(target).toBe('/onboarding/signup-prompt');
  });

  it('escalates to the mandatory signup prompt at count >= 3', () => {
    const target = computeOnboardingGateTarget(
      fresh({ onboardingCompleted: true, anonymousOpenCount: 3 }),
      false,
    );
    expect(target).toBe('/onboarding/signup-prompt?mandatory=true');
  });

  it('keeps firing the mandatory prompt even when already redirected (hardware back can not escape)', () => {
    // The mandatory branch intentionally ignores `hasRedirected` so hardware
    // back from the prompt loops back to the prompt.
    const target = computeOnboardingGateTarget(
      fresh({ onboardingCompleted: true, anonymousOpenCount: 5 }),
      true, // hasRedirected=true
    );
    expect(target).toBe('/onboarding/signup-prompt?mandatory=true');
  });

  // ── One-shot protection ───────────────────────────────────────────────

  it('does NOT re-fire the initial-onboarding redirect once hasRedirected is true', () => {
    // Otherwise dismissing /onboarding/index via hardware back would just
    // bounce right back.
    expect(
      computeOnboardingGateTarget(
        fresh({ onboardingCompleted: false, anonymousOpenCount: 1 }),
        true,
      ),
    ).toBeNull();
  });

  it('does NOT re-fire the dismissible count-2 prompt once hasRedirected is true', () => {
    expect(
      computeOnboardingGateTarget(
        fresh({ onboardingCompleted: true, anonymousOpenCount: 2 }),
        true,
      ),
    ).toBeNull();
  });

  // ── Active navigation / post-ride feedback guarantees ─────────────────

  it('never yanks an anonymous user out of the navigation screen even at count >= 3', () => {
    // If the mandatory gate fired during a live ride, the user would lose
    // their navigation session mid-ride — unacceptable.
    expect(
      computeOnboardingGateTarget(
        fresh({
          pathname: '/navigation',
          onboardingCompleted: true,
          anonymousOpenCount: 10,
        }),
        false,
      ),
    ).toBeNull();
  });

  it('never yanks an anonymous user out of the post-ride feedback screen', () => {
    expect(
      computeOnboardingGateTarget(
        fresh({
          pathname: '/feedback',
          onboardingCompleted: true,
          anonymousOpenCount: 10,
        }),
        false,
      ),
    ).toBeNull();
  });

  // ── Boundary conditions from the issue's hypothesis list ──────────────

  it('handles initial expo-router pathname "/" as a non-exempt path', () => {
    // Hypothesis #2 from the issue: "Expo Router initial pathname is
    // /route-planning on cold start". Whether it's "/" or "/route-planning",
    // both must trigger the gate.
    expect(
      computeOnboardingGateTarget(
        fresh({ pathname: '/', onboardingCompleted: false }),
        false,
      ),
    ).toBe('/onboarding');
  });

  it('handles an empty-string pathname without throwing', () => {
    // Defensive: usePathname() has been observed to return '' in very early
    // renders under bridgeless. The gate must still decide sanely.
    expect(
      computeOnboardingGateTarget(
        fresh({ pathname: '', onboardingCompleted: false }),
        false,
      ),
    ).toBe('/onboarding');
  });
});
