// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('expo-router', () => ({
  router: { replace: vi.fn() },
}));

vi.mock('../lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockLoadCachedRoute = vi.fn();
const mockClearCachedRoute = vi.fn();
vi.mock('../lib/offlineRouteCache', () => ({
  loadCachedRoute: (...args: unknown[]) => mockLoadCachedRoute(...args),
  clearCachedRoute: (...args: unknown[]) => mockClearCachedRoute(...args),
}));

vi.mock('../providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: vi.fn(),
}));

// Mock the design system organisms and atoms to avoid rendering heavy UI
vi.mock('../design-system/organisms/Modal', () => ({
  Modal: ({
    visible,
    title,
    description,
    footer,
  }: {
    visible: boolean;
    title: string;
    description?: string;
    footer?: React.ReactNode;
  }) =>
    visible
      ? React.createElement(
          'div',
          { 'data-testid': 'resume-modal' },
          React.createElement('span', { 'data-testid': 'modal-title' }, title),
          description
            ? React.createElement('span', { 'data-testid': 'modal-description' }, description)
            : null,
          footer,
        )
      : null,
}));

vi.mock('../design-system/atoms/Button', () => ({
  Button: ({
    children,
    onPress,
    variant,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    variant?: string;
  }) =>
    React.createElement(
      'button',
      { 'data-testid': `btn-${variant ?? 'default'}`, onClick: onPress },
      children,
    ),
}));

vi.mock('../design-system/tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32],
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { router } from 'expo-router';
import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useAppStore } from '../store/appStore';
import { NavigationResumeGuard } from './NavigationResumeGuard';

const mockRouter = vi.mocked(router);
const mockAuth = vi.mocked(useAuthSessionOptional);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeNavigationSession = (ageMs: number) => ({
  routeId: 'route-123',
  startedAt: new Date(Date.now() - ageMs).toISOString(),
  gpsBreadcrumbs: [] as { ts: number }[],
  currentStepIndex: 0,
  isMuted: false,
  totalMetersRidden: 0,
  offRouteCount: 0,
  rerouteAttempts: [],
  lastPreAnnouncementStepId: null,
  lastApproachAnnouncementStepId: null,
});

const makeCachedRoute = () => ({
  routeId: 'route-123',
  geometry: 'encoded',
  steps: [],
  distanceMeters: 5000,
  durationSeconds: 1200,
  originLabel: 'Home',
  destinationLabel: 'Work',
  routingMode: 'safe' as const,
  waypoints: [],
  cachedAt: new Date().toISOString(),
});

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationResumeGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCachedRoute.mockResolvedValue(null);
    mockClearCachedRoute.mockResolvedValue(undefined);

    // Default: auth settled, onboarding complete
    mockAuth.mockReturnValue({
      isLoading: false,
      session: null,
      userId: null,
      isAnonymous: true,
      signInWithGoogle: vi.fn(),
      signInAnonymously: vi.fn(),
      signOut: vi.fn(),
    } as any);

    // Reset store
    useAppStore.setState({
      appState: 'IDLE',
      navigationSession: null,
      onboardingCompleted: true,
    });
  });

  it('renders null when no session and no cached route', async () => {
    useAppStore.setState({ navigationSession: null, onboardingCompleted: true });
    mockLoadCachedRoute.mockResolvedValue(null);

    const { container } = render(<NavigationResumeGuard />);

    // Let the async check run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.innerHTML).toBe('');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('auto-resumes when session < 15 min old and cached route exists', async () => {
    const session = makeNavigationSession(5 * 60 * 1000); // 5 min old
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/navigation');
  });

  it('shows modal when session >= 15 min old and cached route exists', async () => {
    const session = makeNavigationSession(FIFTEEN_MINUTES_MS + 60_000); // 16 min old
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('resume-modal')).toBeTruthy();
    expect(screen.getByTestId('modal-title').textContent).toBe('Resume navigation?');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('calls finishNavigation + clears cache when session exists but no cached route', async () => {
    const session = makeNavigationSession(5 * 60 * 1000);
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(null);

    const finishSpy = vi.spyOn(useAppStore.getState(), 'finishNavigation');

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(finishSpy).toHaveBeenCalled();
    expect(mockClearCachedRoute).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('clears cache when cached route exists but no session', async () => {
    useAppStore.setState({
      appState: 'IDLE',
      navigationSession: null,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockClearCachedRoute).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('navigates to /navigation when Resume is tapped', async () => {
    const session = makeNavigationSession(FIFTEEN_MINUTES_MS + 60_000);
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const resumeBtn = screen.getByTestId('btn-primary');
    fireEvent.click(resumeBtn);

    expect(mockRouter.replace).toHaveBeenCalledWith('/navigation');
  });

  it('calls finishNavigation + clearCachedRoute when Discard is tapped', async () => {
    const session = makeNavigationSession(FIFTEEN_MINUTES_MS + 60_000);
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const discardBtn = screen.getByTestId('btn-ghost');
    fireEvent.click(discardBtn);

    expect(mockClearCachedRoute).toHaveBeenCalled();
    // After discard, modal should no longer be visible
    expect(screen.queryByTestId('resume-modal')).toBeNull();
  });
});
