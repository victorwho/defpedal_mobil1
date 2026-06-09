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

// `vi.hoisted` lets the mock factory share live state with the test body.
// The factory function passed to `vi.mock` is hoisted ABOVE all top-level
// `let`/`const` declarations — using a top-level `let netInfoCallback` inside
// the factory would be a temporal-dead-zone error. The hoisted block lifts
// the mutable holder up so both sides reference the same object.
const netInfoState = vi.hoisted(() => ({
  callback: null as NetInfoCallback | null,
  unsubscribe: { fn: () => undefined as void },
}));
const mockUnsubscribe = vi.fn(() => netInfoState.unsubscribe.fn());

// ConnectivityProvider loads NetInfo through the `loadNetInfo()` ESM seam in
// `src/lib/netInfoModule.ts` (which internally does the guarded
// `require('@react-native-community/netinfo')`). We mock the SEAM, not the
// netinfo package: `vi.mock` does not intercept the runtime `require()` inside
// the loader (the require bypasses the mock and tries to parse the real
// Flow-laden package), but it DOES reliably intercept this ESM import — so the
// real require never runs in tests and our addEventListener captures the
// provider's callback.
vi.mock('../lib/netInfoModule', () => ({
  loadNetInfo: () => ({
    addEventListener: (callback: NetInfoCallback) => {
      netInfoState.callback = callback;
      return mockUnsubscribe;
    },
  }),
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
    netInfoState.callback?.({ isConnected, isInternetReachable });
  });
  // Advance past debounce
  act(() => {
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// RE-ENABLED 2026-06-09: all 6 specs now run. The 4 that exercise the NetInfo
// callback were previously `it.skip` because `vi.mock('@react-native-community/netinfo')`
// did not intercept the provider's runtime `require()` — the require fell
// through to the real Flow-laden package (`Unexpected token 'typeof'`), the
// loader's catch swallowed it, and the listener never registered. Fixed by
// extracting the guarded require into the `loadNetInfo()` ESM seam
// (`src/lib/netInfoModule.ts`) and mocking that seam above; production behaviour
// (guarded lazy require) is unchanged.
describe('ConnectivityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    netInfoState.callback = null;
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
      netInfoState.callback?.({ isConnected: false, isInternetReachable: false });
    });
    act(() => {
      vi.advanceTimersByTime(100); // < DEBOUNCE_MS
    });
    act(() => {
      netInfoState.callback?.({ isConnected: true, isInternetReachable: true });
    });
    act(() => {
      vi.advanceTimersByTime(100); // < DEBOUNCE_MS
    });
    act(() => {
      netInfoState.callback?.({ isConnected: false, isInternetReachable: false });
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
