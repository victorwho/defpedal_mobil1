// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from 'expo-router';

// Mock expo-router — use vi.hoisted so the fn is available at hoist time
vi.mock('expo-router', () => ({
  router: { replace: vi.fn() },
}));

// Mock zustand storage so persist doesn't error in jsdom
vi.mock('../lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { useAppStore } from '../store/appStore';
import { useRouteGuard } from './useRouteGuard';

const mockReplace = vi.mocked(router.replace);

beforeEach(() => {
  mockReplace.mockClear();
});

afterEach(() => {
  useAppStore.getState().resetFlow();
  useAppStore.persist.clearStorage();
});

describe('useRouteGuard', () => {
  it('returns true when the app state matches the required state', () => {
    useAppStore.setState({ appState: 'NAVIGATING' });

    const { result } = renderHook(() =>
      useRouteGuard({ requiredStates: ['NAVIGATING'] }),
    );

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns false and redirects when the app state does NOT match', () => {
    useAppStore.setState({ appState: 'IDLE' });

    const { result } = renderHook(() =>
      useRouteGuard({ requiredStates: ['NAVIGATING'] }),
    );

    expect(result.current).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/route-planning');
  });

  it('redirects to a custom fallback when provided', () => {
    useAppStore.setState({ appState: 'IDLE' });

    renderHook(() =>
      useRouteGuard({
        requiredStates: ['ROUTE_PREVIEW'],
        fallback: '/settings',
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith('/settings');
  });

  it('returns false when the state matches but condition fails', () => {
    useAppStore.setState({ appState: 'NAVIGATING' });

    const { result } = renderHook(() =>
      useRouteGuard({
        requiredStates: ['NAVIGATING'],
        condition: () => false,
      }),
    );

    expect(result.current).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/route-planning');
  });

  it('returns true when the state matches and condition passes', () => {
    useAppStore.setState({ appState: 'NAVIGATING' });

    const { result } = renderHook(() =>
      useRouteGuard({
        requiredStates: ['NAVIGATING'],
        condition: () => true,
      }),
    );

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('accepts multiple required states', () => {
    useAppStore.setState({ appState: 'ROUTE_PREVIEW' });

    const { result } = renderHook(() =>
      useRouteGuard({ requiredStates: ['NAVIGATING', 'ROUTE_PREVIEW'] }),
    );

    expect(result.current).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('only redirects once even if re-rendered while guard fails', () => {
    useAppStore.setState({ appState: 'IDLE' });

    const { rerender } = renderHook(() =>
      useRouteGuard({ requiredStates: ['NAVIGATING'] }),
    );

    rerender();
    rerender();

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
