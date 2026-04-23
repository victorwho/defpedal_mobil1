// @vitest-environment happy-dom
/**
 * Integration tests that wire the real Zustand store + a mocked auth context
 * + a mocked expo-router pathname into `useOnboardingGate`, then drive the
 * decision through `computeOnboardingGateTarget`. These reproduce the exact
 * flow that GH issue #23 got wrong (fresh-install anonymous, count=1, no
 * redirect fires).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks (must appear before module-under-test import) ──────────────

vi.mock('expo-router', () => ({
  usePathname: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('../providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { usePathname } from 'expo-router';

import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useAppStore } from '../store/appStore';

import {
  computeOnboardingGateTarget,
  useOnboardingGate,
} from './useOnboardingGate';

const mockedPathname = vi.mocked(usePathname);
const mockedAuth = vi.mocked(useAuthSessionOptional);

// Builds an auth context shape that satisfies the type (only the fields the
// gate actually reads — isLoading, user, isAnonymous).
type PartialAuth = {
  isLoading: boolean;
  user: { id: string } | null;
  isAnonymous: boolean;
};

const mockAuth = (state: PartialAuth) => {
  mockedAuth.mockReturnValue(state as unknown as ReturnType<
    typeof useAuthSessionOptional
  >);
};

// Mock expo-router's pathname. Defaults to "/route-planning" which is the
// pathname the user reported seeing in the issue (index.tsx redirects there
// by default).
const mockPathname = (pathname: string = '/route-planning') => {
  mockedPathname.mockReturnValue(pathname);
};

// Forces persist.hasHydrated() to return true so useStoreHydrated reports
// hydrated. The zustandStorage mock above already makes the state default.
const markHydrated = () => {
  useAppStore.persist?.rehydrate?.();
  // In case rehydrate is async or unavailable, also patch hasHydrated.
  const persistApi = useAppStore.persist as { hasHydrated?: () => boolean };
  if (persistApi?.hasHydrated) {
    vi.spyOn(persistApi, 'hasHydrated').mockReturnValue(true);
  }
};

// ── Shared lifecycle ─────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    appState: 'IDLE',
    onboardingCompleted: false,
    anonymousOpenCount: 0,
  });
  markHydrated();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Integration tests ────────────────────────────────────────────────

describe('useOnboardingGate integration', () => {
  it('reads the live Zustand + auth state into a single snapshot', () => {
    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toMatchObject({
      pathname: '/route-planning',
      onboardingCompleted: false,
      anonymousOpenCount: 1,
      storeHydrated: true,
      isLoading: false,
      hasRealAccount: false,
    });
  });

  it('treats an anonymous session (user != null, isAnonymous=true) as NOT a real account', () => {
    // This is the exact pattern used by Supabase anonymous sign-in: a user
    // object exists, but isAnonymous is true. The gate must NOT treat this
    // as a real account — otherwise the fresh-install flow would skip
    // onboarding entirely.
    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });

    const { result } = renderHook(() => useOnboardingGate());
    expect(result.current.hasRealAccount).toBe(false);
  });

  it('treats a real Google session (user != null, isAnonymous=false) as a real account', () => {
    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'u-1' }, isAnonymous: false });

    const { result } = renderHook(() => useOnboardingGate());
    expect(result.current.hasRealAccount).toBe(true);
  });

  it('reports isLoading=true when the auth context is missing (provider not mounted yet)', () => {
    // Without an AuthSessionProvider in the tree the optional hook returns
    // null — the gate defaults to isLoading=true so it doesn't make a
    // decision based on a missing context.
    mockPathname('/route-planning');
    mockedAuth.mockReturnValue(null);

    const { result } = renderHook(() => useOnboardingGate());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasRealAccount).toBe(false);
  });

  // ── The exact regression scenario from GH issue #23 ────────────────

  it('fresh install on /route-planning → computeOnboardingGateTarget returns /onboarding/index', () => {
    // This is the end-to-end reproduction of GH #23:
    //
    //   Anonymous open count: 1
    //   Onboarding completed: false
    //   Is anonymous: true
    //   Has real account: false
    //   Session exists: true
    //   Storage engine: async-storage
    //
    // The user reported no redirect. With the fix, the gate must resolve
    // to /onboarding/index.

    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());
    const target = computeOnboardingGateTarget(result.current, false);

    expect(target).toBe('/onboarding');
  });

  it('fresh install with pathname "/" → still redirects to /onboarding/index', () => {
    // Hypothesis #2 from the issue noted that Expo Router's initial pathname
    // might be something other than "/route-planning". Confirm that the "/"
    // case also triggers the gate.
    mockPathname('/');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(computeOnboardingGateTarget(result.current, false)).toBe(
      '/onboarding',
    );
  });

  it('gate remains silent while auth is still loading', () => {
    // First render mid-auth-init: the gate must return null so we don't
    // redirect an un-authenticated user to onboarding before we know whether
    // they're a real account.
    mockPathname('/route-planning');
    mockAuth({ isLoading: true, user: null, isAnonymous: false });

    const { result } = renderHook(() => useOnboardingGate());
    expect(computeOnboardingGateTarget(result.current, false)).toBeNull();
  });

  // ── Count escalation end-to-end ────────────────────────────────────

  it('escalates from silent → dismissible → mandatory as anonymousOpenCount increments', () => {
    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 1,
    });

    const { result, rerender } = renderHook(() => useOnboardingGate());
    expect(computeOnboardingGateTarget(result.current, false)).toBeNull();

    act(() => {
      useAppStore.setState({ anonymousOpenCount: 2 });
    });
    rerender();
    expect(computeOnboardingGateTarget(result.current, false)).toBe(
      '/onboarding/signup-prompt',
    );

    act(() => {
      useAppStore.setState({ anonymousOpenCount: 3 });
    });
    rerender();
    expect(computeOnboardingGateTarget(result.current, false)).toBe(
      '/onboarding/signup-prompt?mandatory=true',
    );
  });

  it('signing in with a real Google account makes the gate go silent even at high counts', () => {
    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 10,
    });

    const { result, rerender } = renderHook(() => useOnboardingGate());
    expect(computeOnboardingGateTarget(result.current, false)).toBe(
      '/onboarding/signup-prompt?mandatory=true',
    );

    // User signs in
    act(() => {
      mockAuth({
        isLoading: false,
        user: { id: 'google-user-1' },
        isAnonymous: false,
      });
    });
    rerender();
    expect(computeOnboardingGateTarget(result.current, false)).toBeNull();
  });

  // ── Hydration race (the reason useStoreHydrated exists) ────────────

  it('returns storeHydrated=false (gate silent) until persist reports hydration', () => {
    // Simulate the pre-hydration window: hasHydrated() returns false.
    const persistApi = useAppStore.persist as {
      hasHydrated: () => boolean;
      onFinishHydration: (cb: () => void) => () => void;
    };

    vi.spyOn(persistApi, 'hasHydrated').mockReturnValue(false);
    // Capture the onFinishHydration callback so we can fire it at will.
    let hydrationCallback: (() => void) | null = null;
    vi.spyOn(persistApi, 'onFinishHydration').mockImplementation((cb) => {
      hydrationCallback = cb;
      return () => {};
    });

    mockPathname('/route-planning');
    mockAuth({ isLoading: false, user: { id: 'anon-1' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result, rerender } = renderHook(() => useOnboardingGate());

    // Pre-hydration: gate silent.
    expect(result.current.storeHydrated).toBe(false);
    expect(computeOnboardingGateTarget(result.current, false)).toBeNull();

    // Hydration completes.
    act(() => {
      hydrationCallback?.();
    });
    rerender();

    expect(result.current.storeHydrated).toBe(true);
    expect(computeOnboardingGateTarget(result.current, false)).toBe(
      '/onboarding',
    );
  });
});

// ── Render-integration test for the index route decision (smoke) ─────

/**
 * Smoke test that models `app/index.tsx`'s rendering shape: it mounts with
 * the gate and returns the appropriate href string (or null if not ready).
 * This mirrors the decision tree in `app/index.tsx` without depending on
 * expo-router's `<Redirect>` component.
 */
const resolveIndexHref = (
  gate: ReturnType<typeof useOnboardingGate>,
  appState: 'IDLE' | 'NAVIGATING' | 'ROUTE_PREVIEW' | 'AWAITING_FEEDBACK',
): string | null => {
  if (!gate.storeHydrated || gate.isLoading) return null;
  const gateTarget = computeOnboardingGateTarget(gate, false);
  if (gateTarget) return gateTarget;
  if (appState === 'NAVIGATING') return '/navigation';
  if (appState === 'ROUTE_PREVIEW') return '/route-preview';
  if (appState === 'AWAITING_FEEDBACK') return '/feedback';
  return '/route-planning';
};

describe('app/index.tsx decision logic', () => {
  beforeEach(() => {
    mockPathname('/'); // index is the initial route — pathname is "/"
    markHydrated();
  });

  it('waits (returns null) until storeHydrated AND auth are settled', () => {
    mockAuth({ isLoading: true, user: null, isAnonymous: false });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 0,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'IDLE')).toBeNull();
  });

  it('fresh anonymous user lands on /onboarding/index (NOT /route-planning)', () => {
    // ★ The bug. Before the fix, index.tsx returned /route-planning while
    // the gate silently failed to fire — so anonymous users never saw
    // onboarding.
    mockAuth({ isLoading: false, user: { id: 'anon' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'IDLE')).toBe('/onboarding');
  });

  it('onboarded anonymous user at count==2 lands on /onboarding/signup-prompt', () => {
    mockAuth({ isLoading: false, user: { id: 'anon' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 2,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'IDLE')).toBe(
      '/onboarding/signup-prompt',
    );
  });

  it('onboarded anonymous user at count>=3 lands on mandatory signup prompt', () => {
    mockAuth({ isLoading: false, user: { id: 'anon' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 3,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'IDLE')).toBe(
      '/onboarding/signup-prompt?mandatory=true',
    );
  });

  it('real Google account at IDLE lands on /route-planning (default app entry)', () => {
    mockAuth({
      isLoading: false,
      user: { id: 'google-user' },
      isAnonymous: false,
    });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 100, // irrelevant for real accounts
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'IDLE')).toBe('/route-planning');
  });

  it('respects the app state machine for signed-in users mid-ride', () => {
    mockAuth({
      isLoading: false,
      user: { id: 'google-user' },
      isAnonymous: false,
    });
    useAppStore.setState({
      onboardingCompleted: true,
      anonymousOpenCount: 0,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'NAVIGATING')).toBe('/navigation');
    expect(resolveIndexHref(result.current, 'ROUTE_PREVIEW')).toBe(
      '/route-preview',
    );
    expect(resolveIndexHref(result.current, 'AWAITING_FEEDBACK')).toBe(
      '/feedback',
    );
  });

  it('gate wins over app state for anonymous users — navigation session cannot suppress onboarding', () => {
    // Anonymous user with a stale NAVIGATING state somehow persisted. The
    // gate must still fire — we never want to drop an un-onboarded user
    // straight into turn-by-turn.
    mockAuth({ isLoading: false, user: { id: 'anon' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());
    expect(resolveIndexHref(result.current, 'NAVIGATING')).toBe(
      '/onboarding',
    );
  });

  it('resolves to /onboarding (NOT /onboarding/index) so Expo Router can navigate there', () => {
    // The gate previously returned `/onboarding/index` which is not a real
    // route in Expo Router's file-router — `app/onboarding/index.tsx` is
    // exposed as `/onboarding`. `router.replace('/onboarding/index')` was
    // silently no-op'ing, pathname never changed, and the gate effect kept
    // firing every render → "Maximum update depth exceeded".
    mockAuth({ isLoading: false, user: { id: 'anon' }, isAnonymous: true });
    useAppStore.setState({
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    const { result } = renderHook(() => useOnboardingGate());
    const target = resolveIndexHref(result.current, 'IDLE');

    expect(target).toBe('/onboarding');
    // Explicitly assert it does NOT include `/index` — that was the bug.
    expect(target).not.toMatch(/\/index$/);
  });
});
