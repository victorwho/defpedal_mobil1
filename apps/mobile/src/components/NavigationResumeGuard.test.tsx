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
  // queueSlice now force-flushes the persist adapter after trip-critical
  // mutations (durable-write fix); the queue actions this test exercises call
  // it, so the mock must export it.
  flushPersistedWrites: vi.fn(),
}));

const mockLoadCachedRoute = vi.fn();
const mockClearCachedRoute = vi.fn();
vi.mock('../lib/offlineRouteCache', () => ({
  loadCachedRoute: (...args: unknown[]) => mockLoadCachedRoute(...args),
  clearCachedRoute: (...args: unknown[]) => mockClearCachedRoute(...args),
}));

// Stub the breadcrumb merge (its real impl pulls in expo-location, whose
// native side-effects throw under the test runtime). The merge appends to the
// same session breadcrumbs the assertions read, so a no-op is correct here —
// dedicated merge behaviour is covered in backgroundNavigation.test.ts.
const mockMergeBackground = vi.fn(async () => 0);
vi.mock('../lib/mergeBackgroundBreadcrumbs', () => ({
  mergeBackgroundBreadcrumbsIntoSession: (...args: unknown[]) => mockMergeBackground(...args),
}));

vi.mock('../providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: vi.fn(),
}));

const mockTelemetryCapture = vi.fn();
vi.mock('../lib/telemetry', () => ({
  telemetry: { capture: (...args: unknown[]) => mockTelemetryCapture(...args) },
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
    expect(screen.getByTestId('modal-title').textContent).toBe('Finish your last ride?');
    // Three-way prompt (GPS audit 2026-07-15 P1-0): Resume / Save ride / Discard.
    expect(screen.getByTestId('btn-primary')).toBeTruthy();
    expect(screen.getByTestId('btn-secondary')).toBeTruthy();
    expect(screen.getByTestId('btn-ghost')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('closes the ride (trip_end + trip_track) and resets flow when session exists but no cached route', async () => {
    const session = {
      ...makeNavigationSession(5 * 60 * 1000),
      gpsBreadcrumbs: [{ lat: 44.43, lon: 26.1, ts: Date.now() - 60_000, acc: null, spd: null, hdg: null }],
    };
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      activeTripClientId: 'client-trip-1',
      queuedMutations: [],
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(null);

    // Must NOT route through finishNavigation: that would bump
    // completedRideCount and strand appState in AWAITING_FEEDBACK
    // (review 2026-06-12 P1 #5).
    const finishSpy = vi.spyOn(useAppStore.getState(), 'finishNavigation');

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(finishSpy).not.toHaveBeenCalled();
    const queued = useAppStore.getState().queuedMutations;
    expect(queued.some((m) => m.type === 'trip_end')).toBe(true);
    // Automatic cleanup preserves the GPS trail (ride lands in History).
    expect(queued.some((m) => m.type === 'trip_track')).toBe(true);
    expect(useAppStore.getState().appState).toBe('IDLE');
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

  it('Save ride queues trip_end + trip_track (app_killed) with the recorded trail, resets to IDLE, never calls finishNavigation', async () => {
    const breadcrumbs = [
      { lat: 44.43, lon: 26.1, ts: Date.now() - FIFTEEN_MINUTES_MS - 30_000, acc: null, spd: null, hdg: null },
      { lat: 44.44, lon: 26.11, ts: Date.now() - FIFTEEN_MINUTES_MS, acc: null, spd: null, hdg: null },
    ];
    const session = {
      ...makeNavigationSession(FIFTEEN_MINUTES_MS + 60_000),
      gpsBreadcrumbs: breadcrumbs,
    };
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      activeTripClientId: 'client-trip-save',
      queuedMutations: [],
      completedRideCount: 3,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    const finishSpy = vi.spyOn(useAppStore.getState(), 'finishNavigation');

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const saveBtn = screen.getByTestId('btn-secondary');
    await act(async () => {
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(finishSpy).not.toHaveBeenCalled();
    const state = useAppStore.getState();
    const queued = state.queuedMutations;
    expect(queued.some((m) => m.type === 'trip_end')).toBe(true);
    // The whole point of Save ride: the recorded trail survives into a
    // trip_track (end_reason app_killed → lands in History like the
    // automatic kill-recovery path).
    const track = queued.find((m) => m.type === 'trip_track');
    expect(track).toBeTruthy();
    const payload = track!.payload as { endReason: string; gpsBreadcrumbs: unknown[] };
    expect(payload.endReason).toBe('app_killed');
    expect(payload.gpsBreadcrumbs).toHaveLength(2);
    // Background-recorded samples are drained into the trail before the
    // trip_track is built.
    expect(mockMergeBackground).toHaveBeenCalled();
    // resetFlow semantics: IDLE, no completed-ride inflation.
    expect(state.appState).toBe('IDLE');
    expect(state.completedRideCount).toBe(3);
    expect(mockClearCachedRoute).toHaveBeenCalled();
    expect(screen.queryByTestId('resume-modal')).toBeNull();
  });

  it('Discard queues trip_end only (no trip_track), resets to IDLE, and never calls finishNavigation', async () => {
    const session = {
      ...makeNavigationSession(FIFTEEN_MINUTES_MS + 60_000),
      gpsBreadcrumbs: [{ lat: 44.43, lon: 26.1, ts: Date.now() - FIFTEEN_MINUTES_MS, acc: null, spd: null, hdg: null }],
    };
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      activeTripClientId: 'client-trip-2',
      queuedMutations: [],
      completedRideCount: 3,
      onboardingCompleted: true,
    });
    mockLoadCachedRoute.mockResolvedValue(makeCachedRoute());

    const finishSpy = vi.spyOn(useAppStore.getState(), 'finishNavigation');

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const discardBtn = screen.getByTestId('btn-ghost');
    fireEvent.click(discardBtn);

    expect(finishSpy).not.toHaveBeenCalled();
    const state = useAppStore.getState();
    const queued = state.queuedMutations;
    // The orphaned server trip is closed...
    expect(queued.some((m) => m.type === 'trip_end')).toBe(true);
    // ...but an explicit discard mirrors in-ride discard semantics: no
    // History trail, no impact/XP.
    expect(queued.some((m) => m.type === 'trip_track')).toBe(false);
    // resetFlow (not finishNavigation): IDLE, no completed-ride inflation,
    // route-preview stays reachable.
    expect(state.appState).toBe('IDLE');
    expect(state.completedRideCount).toBe(3);
    expect(mockClearCachedRoute).toHaveBeenCalled();
    // After discard, modal should no longer be visible
    expect(screen.queryByTestId('resume-modal')).toBeNull();
  });

  it('does not double-queue trip_end when one is already queued for the same trip', async () => {
    const session = {
      ...makeNavigationSession(5 * 60 * 1000),
      gpsBreadcrumbs: [{ lat: 44.43, lon: 26.1, ts: Date.now() - 60_000, acc: null, spd: null, hdg: null }],
    };
    useAppStore.setState({
      appState: 'NAVIGATING',
      navigationSession: session as any,
      activeTripClientId: 'client-trip-3',
      onboardingCompleted: true,
    });
    // Pre-queue a trip_end for the same trip (kill happened mid-End-Ride).
    useAppStore.getState().enqueueMutation('trip_end', {
      clientTripId: 'client-trip-3',
      endedAt: new Date().toISOString(),
      reason: 'stopped',
    } as any);
    const queuedBefore = useAppStore
      .getState()
      .queuedMutations.filter((m) => m.type === 'trip_end').length;
    mockLoadCachedRoute.mockResolvedValue(null);

    render(<NavigationResumeGuard />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const queuedAfter = useAppStore
      .getState()
      .queuedMutations.filter((m) => m.type === 'trip_end').length;
    expect(queuedAfter).toBe(queuedBefore);
    expect(useAppStore.getState().appState).toBe('IDLE');
  });
});
