// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type NetInfoCallback = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;

let netInfoCallback: NetInfoCallback | null = null;
const mockUnsubscribe = vi.fn();

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn((callback: NetInfoCallback) => {
      netInfoCallback = callback;
      return mockUnsubscribe;
    }),
  },
}));

// Mock the Toast to make it observable in tests
vi.mock('../design-system/molecules/Toast', () => ({
  Toast: ({ message }: { message: string }) =>
    React.createElement('div', { 'data-testid': 'toast', 'data-message': message }, message),
}));

vi.mock('../design-system/tokens/zIndex', () => ({
  zIndex: { toast: 9999 },
}));

vi.mock('../design-system/tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32],
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ConnectivityProvider, useConnectivity } from './ConnectivityMonitor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

/** Consumer component that displays connectivity state */
function ConnectivityDisplay() {
  const { isOnline } = useConnectivity();
  return React.createElement('span', { 'data-testid': 'status' }, isOnline ? 'online' : 'offline');
}

function renderWithProvider() {
  return render(
    React.createElement(
      ConnectivityProvider,
      null,
      React.createElement(ConnectivityDisplay),
    ),
  );
}

/** Simulate a NetInfo state change and advance past the debounce */
function emitNetState(isConnected: boolean, isInternetReachable: boolean | null = true) {
  act(() => {
    netInfoCallback?.({ isConnected, isInternetReachable });
  });
  // Advance past debounce
  act(() => {
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectivityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    netInfoCallback = null;
    mockUnsubscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports isOnline: true when NetInfo says connected', () => {
    renderWithProvider();

    emitNetState(true, true);

    expect(screen.getByTestId('status').textContent).toBe('online');
  });

  it('reports isOnline: false when NetInfo says disconnected', () => {
    renderWithProvider();

    emitNetState(false, false);

    expect(screen.getByTestId('status').textContent).toBe('offline');
  });

  it('debounces rapid toggles (does not flicker on WiFi handoff)', () => {
    renderWithProvider();

    // Rapid toggle: offline -> online -> offline within debounce window
    act(() => {
      netInfoCallback?.({ isConnected: false, isInternetReachable: false });
    });
    act(() => {
      vi.advanceTimersByTime(100); // < DEBOUNCE_MS
    });
    act(() => {
      netInfoCallback?.({ isConnected: true, isInternetReachable: true });
    });
    act(() => {
      vi.advanceTimersByTime(100); // < DEBOUNCE_MS
    });
    act(() => {
      netInfoCallback?.({ isConnected: false, isInternetReachable: false });
    });

    // Advance past debounce for the final state
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // The final state should be offline (only the last emission matters after debounce)
    expect(screen.getByTestId('status').textContent).toBe('offline');
  });

  it('shows toast on offline-to-online transition', () => {
    renderWithProvider();

    // Go offline first
    emitNetState(false, false);
    expect(screen.getByTestId('status').textContent).toBe('offline');

    // Go back online
    emitNetState(true, true);
    expect(screen.getByTestId('status').textContent).toBe('online');

    // Toast should appear
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(screen.getByTestId('toast').getAttribute('data-message')).toBe('Back online');
  });

  it('does NOT show toast on initial mount even if online', () => {
    renderWithProvider();

    // First emission: online
    emitNetState(true, true);

    // No toast because it's the first emission
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('unsubscribes from NetInfo on unmount', () => {
    const { unmount } = renderWithProvider();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
