// @vitest-environment happy-dom
/**
 * ShareClaimProcessor — Unit Tests
 *
 * Renders the provider with a mock auth context + stubbed mobileApi and
 * asserts the store/toast transitions for each claim result branch.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — all native dependencies stubbed before imports
// ---------------------------------------------------------------------------

const routerPushSpy = vi.fn();
vi.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => routerPushSpy(...args),
    replace: vi.fn(),
    back: vi.fn(),
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(),
    clear: vi.fn(), getAllKeys: vi.fn(),
    multiGet: vi.fn(), multiSet: vi.fn(), multiRemove: vi.fn(),
  },
}));
vi.mock('../../i18n', () => ({
  getDeviceLocale: () => 'en',
  translate: (_l: string, k: string) => k,
}));
vi.mock('../../lib/env', () => ({
  getEnvVar: (key: string) =>
    key === 'EXPO_PUBLIC_MOBILE_API_URL' ? 'http://localhost:8080' : '',
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {},
  Dimensions: { get: () => ({ width: 360, height: 800 }) },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
  PixelRatio: { get: () => 2 },
  Animated: {
    Value: class {
      setValue() {}
    },
    timing: () => ({ start: (cb?: () => void) => cb?.() }),
    parallel: (a: unknown[]) => ({
      start: (cb?: () => void) => {
        void a;
        cb?.();
      },
    }),
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'animated-view' }, children),
  },
  Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
    React.createElement('button', { onClick: onPress }, children),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
  StyleSheet: { create: (obj: Record<string, unknown>) => obj },
}));

vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: () => React.createElement('span', { 'data-testid': 'ionicon' }),
}));

// Stub useReducedMotion (Toast depends on it transitively)
vi.mock('../../design-system/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// Make Toast observable via data-testid
vi.mock('../../design-system/molecules/Toast', () => ({
  Toast: ({
    message,
    variant,
  }: {
    message: string;
    variant?: string;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'toast',
        'data-message': message,
        'data-variant': variant ?? 'info',
      },
      message,
    ),
}));

vi.mock('../../design-system/tokens/zIndex', () => ({
  zIndex: { toast: 9999 },
}));
vi.mock('../../design-system/tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32],
}));

// ── Auth session mock — the hook returns { user, isLoading } ──
type AuthState = { user: { id: string } | null; isLoading: boolean };
let mockAuth: AuthState = { user: { id: 'invitee-1' }, isLoading: false };
vi.mock('../AuthSessionProvider', () => ({
  useAuthSessionOptional: () => ({
    user: mockAuth.user,
    isLoading: mockAuth.isLoading,
  }),
}));

// ── mobileApi.claimRouteShare mock ──
type ClaimResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'not_found' }
  | { status: 'gone'; reason: 'expired' | 'revoked' }
  | { status: 'invalid'; reason: 'self_referral' }
  | { status: 'auth_required' }
  | { status: 'network_error'; message: string };

const claimRouteShareSpy = vi.fn<() => Promise<ClaimResult>>();
vi.mock('../../lib/api', () => ({
  mobileApi: {
    claimRouteShare: () => claimRouteShareSpy(),
  },
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

const { useAppStore } = await import('../../store/appStore');
const { ShareClaimProcessor } = await import('../ShareClaimProcessor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resetState = () => {
  useAppStore.setState({
    pendingShareClaim: null,
    pendingShareClaimAttempts: 0,
    routePreview: null,
    selectedRouteId: null,
    appState: 'IDLE',
  });
};

// Realistic claim payload for `ok` branch tests — carries the fields the
// mapper needs (origin, destination, geometryPolyline6, distance, duration,
// routingMode). Fields the mapper doesn't need (sharer info, timestamps,
// etc.) are omitted from `as any` — the store doesn't inspect them.
const okClaimData = {
  code: 'abcd1234',
  alreadyClaimed: false,
  sharerDisplayName: 'Alice',
  sharerAvatarUrl: null,
  routePayload: {
    origin: { lat: 44.4268, lon: 26.1025 },
    destination: { lat: 44.4378, lon: 26.1083 },
    geometryPolyline6: '_ibE_seK_seK_seK',
    distanceMeters: 2500,
    durationSeconds: 540,
    routingMode: 'safe' as const,
    riskSegments: [],
    safetyScore: null,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShareClaimProcessor', () => {
  beforeEach(() => {
    resetState();
    mockAuth = { user: { id: 'invitee-1' }, isLoading: false };
    claimRouteShareSpy.mockReset();
    routerPushSpy.mockReset();
  });

  afterEach(() => {
    // No fake timers in use — nothing to teardown. Real timers keep
    // promise resolution snappy so `waitFor` can advance.
  });

  it('does not call the API when no pendingShareClaim is set', async () => {
    render(<ShareClaimProcessor />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(claimRouteShareSpy).not.toHaveBeenCalled();
  });

  it('waits for auth to resolve before firing the claim', async () => {
    mockAuth = { user: null, isLoading: true };
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });
    // Auth still loading — no claim call yet.
    expect(claimRouteShareSpy).not.toHaveBeenCalled();
  });

  it('does not call the API when auth is resolved but user is null', async () => {
    mockAuth = { user: null, isLoading: false };
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(claimRouteShareSpy).not.toHaveBeenCalled();
  });

  it('clears state, seeds route preview, navigates, and shows success toast on ok', async () => {
    claimRouteShareSpy.mockResolvedValue({ status: 'ok', data: okClaimData });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(claimRouteShareSpy).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().pendingShareClaim).toBeNull();

    // Store seeded with the claimed route
    const preview = useAppStore.getState().routePreview;
    expect(preview).not.toBeNull();
    expect(preview?.routes).toHaveLength(1);
    expect(preview?.routes[0]?.id).toBe('share-abcd1234');
    expect(preview?.routes[0]?.geometryPolyline6).toBe('_ibE_seK_seK_seK');
    expect(preview?.routes[0]?.distanceMeters).toBe(2500);
    expect(preview?.selectedMode).toBe('safe');
    expect(useAppStore.getState().selectedRouteId).toBe('share-abcd1234');
    expect(useAppStore.getState().appState).toBe('ROUTE_PREVIEW');

    // Navigation fired
    expect(routerPushSpy).toHaveBeenCalledWith('/route-preview');

    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeTruthy();
    });
    const toast = screen.getByTestId('toast');
    expect(toast.getAttribute('data-variant')).toBe('success');
    expect(toast.getAttribute('data-message')).toMatch(/saved routes/i);
  });

  it('does NOT navigate when user is already NAVIGATING (preserves in-progress ride)', async () => {
    claimRouteShareSpy.mockResolvedValue({ status: 'ok', data: okClaimData });
    useAppStore.setState({
      pendingShareClaim: 'abcd1234',
      appState: 'NAVIGATING',
    });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(claimRouteShareSpy).toHaveBeenCalledTimes(1);
    // Claim still cleared + toast still shown so the invitee gets feedback.
    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    // But routePreview is NOT overwritten and router.push is NOT called.
    expect(routerPushSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().appState).toBe('NAVIGATING');
  });

  it('idempotent re-claim (alreadyClaimed:true) still clears + toasts success', async () => {
    claimRouteShareSpy.mockResolvedValue({
      status: 'ok',
      data: { ...okClaimData, alreadyClaimed: true },
    });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('toast').getAttribute('data-variant')).toBe(
        'success',
      );
    });
  });

  it('clears state and warns on 404 (not_found)', async () => {
    claimRouteShareSpy.mockResolvedValue({ status: 'not_found' });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    await waitFor(() => {
      const toast = screen.getByTestId('toast');
      expect(toast.getAttribute('data-variant')).toBe('warning');
      expect(toast.getAttribute('data-message')).toMatch(/no longer available/i);
    });
  });

  it('clears state and warns on 410 gone', async () => {
    claimRouteShareSpy.mockResolvedValue({ status: 'gone', reason: 'expired' });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByTestId('toast').getAttribute('data-message'),
      ).toMatch(/no longer available/i);
    });
  });

  it('clears state and warns on self_referral', async () => {
    claimRouteShareSpy.mockResolvedValue({
      status: 'invalid',
      reason: 'self_referral',
    });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByTestId('toast').getAttribute('data-message'),
      ).toMatch(/your own shared route/i);
    });
  });

  it('increments attempts on network_error without clearing state', async () => {
    claimRouteShareSpy.mockResolvedValue({
      status: 'network_error',
      message: 'offline',
    });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBe('abcd1234');
    expect(useAppStore.getState().pendingShareClaimAttempts).toBe(1);
  });

  it('after MAX_CLAIM_ATTEMPTS (3) the processor hard-clears with error toast', async () => {
    // Start at attempts=3 so the processor hits the exhausted branch
    // on its first useEffect run.
    useAppStore.setState({
      pendingShareClaim: 'abcd1234',
      pendingShareClaimAttempts: 3,
    });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(claimRouteShareSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    await waitFor(() => {
      const toast = screen.getByTestId('toast');
      expect(toast.getAttribute('data-variant')).toBe('error');
      expect(toast.getAttribute('data-message')).toMatch(/try again later/i);
    });
  });

  it('clears state on auth_required without toast (silent fallback)', async () => {
    claimRouteShareSpy.mockResolvedValue({ status: 'auth_required' });
    useAppStore.setState({ pendingShareClaim: 'abcd1234' });
    render(<ShareClaimProcessor />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().pendingShareClaim).toBeNull();
    // No toast rendered — component returns null when toast is null.
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
