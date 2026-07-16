// @vitest-environment happy-dom
(globalThis as Record<string, unknown>).__DEV__ = false;

import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-modules-core to prevent __DEV__ reference error
vi.mock('expo-modules-core', () => ({}));

// Mock all external dependencies before importing the module under test.
vi.mock('expo-linking', () => ({
  getInitialURL: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('expo-web-browser', () => ({
  dismissBrowser: vi.fn().mockResolvedValue(undefined),
  openAuthSessionAsync: vi.fn().mockResolvedValue({ type: 'dismiss' }),
}));

vi.mock('../lib/push-notifications', () => ({
  registerForPushNotifications: vi.fn(),
  registerForPushNotificationsIfEligible: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => false),
  isDeveloperAuthBypassAvailable: vi.fn(() => false),
  getCurrentSession: vi.fn().mockResolvedValue(null),
  getLastAnonSignInError: vi.fn(() => null),
  subscribeToAuthSessionChanges: vi.fn(() => vi.fn()),
  supabaseClient: null,
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
  activateDeveloperBypassSession: vi.fn(),
}));

import {
  getCurrentSession,
  isSupabaseConfigured,
  signInAnonymously,
} from '../lib/supabase';
import {
  AuthSessionProvider,
  useAuthSession,
  useAuthSessionOptional,
} from './AuthSessionProvider';

describe('useAuthSession', () => {
  it('throws when used outside AuthSessionProvider', () => {
    // renderHook will call the hook outside any provider.
    // We expect it to throw.
    expect(() => {
      renderHook(() => useAuthSession());
    }).toThrow('useAuthSession must be used within AuthSessionProvider.');
  });

  it('returns the context value when used inside AuthSessionProvider', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthSessionProvider>{children}</AuthSessionProvider>
    );

    const { result } = renderHook(() => useAuthSession(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.session).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useAuthSessionOptional', () => {
  it('returns null when used outside AuthSessionProvider (no throw)', () => {
    // This is the core fix validation: no throw, just null.
    const { result } = renderHook(() => useAuthSessionOptional());

    expect(result.current).toBeNull();
  });

  it('returns the context value when used inside AuthSessionProvider', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthSessionProvider>{children}</AuthSessionProvider>
    );

    const { result } = renderHook(() => useAuthSessionOptional(), { wrapper });

    expect(result.current).not.toBeNull();
    expect(result.current!.session).toBeNull();
  });
});

// GPS audit 2026-07-15 P0-1: a failed cold-start anonymous sign-in used to
// leave the app session-less for the whole process lifetime — every ride
// recorded in that state was silently dropped at queueTripEnd. The provider
// now retries with backoff until a session lands.
describe('anonymous sign-in retry', () => {
  const mockSession = {
    user: { id: 'anon-1', email: null },
    isAnonymous: true,
    accessToken: 'token-1',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(getCurrentSession).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    vi.mocked(signInAnonymously).mockReset();
    vi.mocked(getCurrentSession).mockReset();
    vi.mocked(getCurrentSession).mockResolvedValue(null);
  });

  it('keeps retrying with backoff after the initial attempt fails, and lands the session', async () => {
    // Initial mount attempt fails, first retry fails, second retry succeeds.
    vi.mocked(signInAnonymously)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(mockSession as never);

    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthSessionProvider>{children}</AuthSessionProvider>
    );
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    // Let the mount attempt settle (fails → session stays null).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();

    // First retry at ~10s — still failing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(2);
    expect(result.current.session).toBeNull();

    // Second retry at +30s — succeeds and the session lands.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(3);
    expect(result.current.session).not.toBeNull();

    // No further attempts once a session exists.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(3);
  });

  it('does not stack an anonymous user on top of a session that appeared in the meantime', async () => {
    // Mount attempt fails...
    vi.mocked(signInAnonymously).mockResolvedValue(null);

    const wrapper = ({ children }: PropsWithChildren) => (
      <AuthSessionProvider>{children}</AuthSessionProvider>
    );
    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(1);

    // ...then an explicit sign-in lands before the retry fires.
    vi.mocked(getCurrentSession).mockResolvedValue(mockSession as never);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // The retry re-checked the live session and adopted it instead of
    // creating a fresh anonymous user.
    expect(vi.mocked(signInAnonymously)).toHaveBeenCalledTimes(1);
    expect(result.current.session).not.toBeNull();
  });
});
