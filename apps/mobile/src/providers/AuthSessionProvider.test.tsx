import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock all external dependencies before importing the module under test.
vi.mock('expo-linking', () => ({
  getInitialURL: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => false),
  isDeveloperAuthBypassAvailable: vi.fn(() => false),
  getCurrentSession: vi.fn().mockResolvedValue(null),
  subscribeToAuthSessionChanges: vi.fn(() => vi.fn()),
  supabaseClient: null,
  isOAuthInProgress: vi.fn(() => false),
  resolveOAuthCallback: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  activateDeveloperBypassSession: vi.fn(),
}));

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
