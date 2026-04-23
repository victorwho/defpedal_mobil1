// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React Native's __DEV__ global is not available in vitest
(globalThis as Record<string, unknown>).__DEV__ = false;

// Track which href was redirected to
let lastRedirectHref: string | null = null;

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    lastRedirectHref = href;
    return null;
  },
}));

vi.mock('../../../src/lib/env', () => ({
  mobileEnv: {
    validationMode: null,
    appEnv: 'development',
    appVariant: 'development',
  },
}));

vi.mock('../../../src/lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

// The signup gate is hook-driven (reads zustand + auth + hydration).
// Stub it directly with a mutable state object so tests can script the
// gate's answer per scenario without wiring a full AuthSessionProvider.
type GateReturn = {
  pathname: string;
  onboardingCompleted: boolean;
  anonymousOpenCount: number;
  storeHydrated: boolean;
  isLoading: boolean;
  hasRealAccount: boolean;
};

let gateState: GateReturn = {
  pathname: '/',
  onboardingCompleted: true,
  anonymousOpenCount: 0,
  storeHydrated: true,
  isLoading: false,
  hasRealAccount: true, // default: real account → no gate redirect
};

vi.mock('../../../src/hooks/useOnboardingGate', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/hooks/computeOnboardingGateTarget')
  >('../../../src/hooks/computeOnboardingGateTarget');
  return {
    useOnboardingGate: () => gateState,
    computeOnboardingGateTarget: actual.computeOnboardingGateTarget,
  };
});

import { useAppStore } from '../../../src/store/appStore';
import Index from '../../../app/index';

const setGate = (overrides: Partial<GateReturn>) => {
  gateState = {
    pathname: '/',
    onboardingCompleted: true,
    anonymousOpenCount: 0,
    storeHydrated: true,
    isLoading: false,
    hasRealAccount: true,
    ...overrides,
  };
};

beforeEach(() => {
  lastRedirectHref = null;
  // Default to real-account gate state — most cases don't care about the gate.
  setGate({});
});

afterEach(() => {
  useAppStore.getState().resetFlow();
  useAppStore.persist.clearStorage();
});

describe('Index route — baseline routing (real account, gate silent)', () => {
  it('redirects to /route-planning when app state is IDLE', () => {
    useAppStore.setState({ appState: 'IDLE' });

    render(<Index />);

    expect(lastRedirectHref).toBe('/route-planning');
  });

  it('redirects to /navigation when app state is NAVIGATING with session and routes', () => {
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: {
        sessionId: 'test-session',
        routeId: 'route-1',
        state: 'navigating',
        currentStepIndex: 0,
        isMuted: false,
        isFollowing: true,
        startedAt: new Date().toISOString(),
      },
      routePreview: {
        routes: [
          {
            id: 'route-1',
            source: 'custom_osrm',
            routingEngineVersion: 'safe-osrm-v1',
            routingProfileVersion: 'safety-profile-v1',
            mapDataVersion: 'osm-europe-current',
            riskModelVersion: 'risk-model-v1',
            geometryPolyline6: '_o~iF~ps|U_ulLnnqC',
            distanceMeters: 1200,
            durationSeconds: 420,
            adjustedDurationSeconds: 450,
            totalClimbMeters: 24,
            steps: [],
            riskSegments: [],
            warnings: [],
          },
        ],
        selectedMode: 'safe',
        coverage: {
          countryCode: 'RO',
          status: 'supported',
          safeRouting: true,
          fastRouting: true,
        },
        generatedAt: new Date().toISOString(),
      },
    });

    render(<Index />);

    expect(lastRedirectHref).toBe('/navigation');
  });

  it('redirects to /feedback when app state is AWAITING_FEEDBACK', () => {
    useAppStore.setState({ appState: 'AWAITING_FEEDBACK' });

    render(<Index />);

    expect(lastRedirectHref).toBe('/feedback');
  });

  it('redirects to /route-planning as default fallback', () => {
    render(<Index />);

    expect(lastRedirectHref).toBe('/route-planning');
  });
});

describe('Index route — signup gate (GH issue #23 regression coverage)', () => {
  // These tests reproduce the exact state the user described in GH #23 and
  // verify that `app/index.tsx` now redirects to /onboarding/index rather
  // than silently dropping the user on /route-planning.

  it('delays rendering any <Redirect> until the store has hydrated', () => {
    // The old pre-hydration path let index.tsx render <Redirect /> with the
    // default IDLE state, which hit /route-planning. The fix makes index
    // return null until the gate can decide.
    setGate({
      storeHydrated: false,
      isLoading: false,
      hasRealAccount: false,
      onboardingCompleted: false,
      anonymousOpenCount: 0,
    });

    render(<Index />);

    expect(lastRedirectHref).toBeNull();
  });

  it('delays rendering any <Redirect> while auth is still loading', () => {
    setGate({
      storeHydrated: true,
      isLoading: true,
      hasRealAccount: false,
      onboardingCompleted: false,
      anonymousOpenCount: 0,
    });

    render(<Index />);

    expect(lastRedirectHref).toBeNull();
  });

  it('redirects fresh-install anonymous users to /onboarding/index (NOT /route-planning)', () => {
    // The exact state from GH #23:
    //   Anonymous open count: 1
    //   Onboarding completed: false
    //   Is anonymous: true  →  hasRealAccount: false
    //   Session exists: true
    //   Storage engine: async-storage
    setGate({
      storeHydrated: true,
      isLoading: false,
      hasRealAccount: false,
      onboardingCompleted: false,
      anonymousOpenCount: 1,
    });

    render(<Index />);

    expect(lastRedirectHref).toBe('/onboarding');
  });

  it('redirects anonymous users with onboarding complete + count==2 to the dismissible signup prompt', () => {
    setGate({
      storeHydrated: true,
      isLoading: false,
      hasRealAccount: false,
      onboardingCompleted: true,
      anonymousOpenCount: 2,
    });

    render(<Index />);

    expect(lastRedirectHref).toBe('/onboarding/signup-prompt');
  });

  it('redirects anonymous users with onboarding complete + count>=3 to the mandatory signup prompt', () => {
    setGate({
      storeHydrated: true,
      isLoading: false,
      hasRealAccount: false,
      onboardingCompleted: true,
      anonymousOpenCount: 3,
    });

    render(<Index />);

    expect(lastRedirectHref).toBe('/onboarding/signup-prompt?mandatory=true');
  });

  it('never yanks an anonymous user out of an active NAVIGATING session', () => {
    // If the gate fired during a live ride we would lose their navigation
    // state. The /navigation pathname is exempt, but this test also covers
    // the case where index.tsx is reached (e.g. by mistake) during ride.
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: {
        sessionId: 'test-session',
        routeId: 'route-1',
        state: 'navigating',
        currentStepIndex: 0,
        isMuted: false,
        isFollowing: true,
        startedAt: new Date().toISOString(),
      },
      routePreview: {
        routes: [
          {
            id: 'route-1',
            source: 'custom_osrm',
            routingEngineVersion: 'safe-osrm-v1',
            routingProfileVersion: 'safety-profile-v1',
            mapDataVersion: 'osm-europe-current',
            riskModelVersion: 'risk-model-v1',
            geometryPolyline6: '_o~iF~ps|U_ulLnnqC',
            distanceMeters: 1200,
            durationSeconds: 420,
            adjustedDurationSeconds: 450,
            totalClimbMeters: 24,
            steps: [],
            riskSegments: [],
            warnings: [],
          },
        ],
        selectedMode: 'safe',
        coverage: {
          countryCode: 'RO',
          status: 'supported',
          safeRouting: true,
          fastRouting: true,
        },
        generatedAt: new Date().toISOString(),
      },
    });
    // But the gate would normally fire (anonymous, onboarding complete,
    // count==5). The pathname is `/navigation` here, which the gate exempts.
    setGate({
      pathname: '/navigation',
      storeHydrated: true,
      isLoading: false,
      hasRealAccount: false,
      onboardingCompleted: true,
      anonymousOpenCount: 5,
    });

    render(<Index />);

    // Gate stays silent → app state routing wins → /navigation.
    expect(lastRedirectHref).toBe('/navigation');
  });
});
