import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// Control the auth loading state from tests
let mockAuthLoading = false;
vi.mock('../../../src/providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: () => ({
    isLoading: mockAuthLoading,
    session: null,
    user: null,
  }),
}));

vi.mock('../../../src/lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { useAppStore } from '../../../src/store/appStore';
import Index from '../../../app/index';

afterEach(() => {
  lastRedirectHref = null;
  mockAuthLoading = false;
  useAppStore.getState().resetFlow();
  useAppStore.persist.clearStorage();
});

describe('Index route', () => {
  it('returns null (no redirect) while auth is loading', () => {
    mockAuthLoading = true;

    const { container } = render(<Index />);

    // Should render nothing — no redirect triggered
    expect(container.innerHTML).toBe('');
    expect(lastRedirectHref).toBeNull();
  });

  it('redirects to /route-planning when auth is done and app state is IDLE', () => {
    mockAuthLoading = false;
    useAppStore.setState({ appState: 'IDLE' });

    render(<Index />);

    expect(lastRedirectHref).toBe('/route-planning');
  });

  it('redirects to /navigation when app state is NAVIGATING with session and routes', () => {
    mockAuthLoading = false;
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
    mockAuthLoading = false;
    useAppStore.setState({ appState: 'AWAITING_FEEDBACK' });

    render(<Index />);

    expect(lastRedirectHref).toBe('/feedback');
  });
});
