// @vitest-environment happy-dom
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
  useAppStore.getState().resetFlow();
  useAppStore.persist.clearStorage();
});

describe('Index route', () => {
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
