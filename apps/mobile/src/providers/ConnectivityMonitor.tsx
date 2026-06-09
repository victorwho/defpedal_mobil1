/**
 * ConnectivityMonitor — single source of truth for network connectivity.
 *
 * Uses @react-native-community/netinfo to track online/offline state.
 * Debounces rapid transitions (300ms) to avoid UI flicker during WiFi handoff.
 * Shows a "Back online" toast on offline-to-online transitions (not on initial mount).
 */
import type { PropsWithChildren } from 'react';
import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Toast } from '../design-system/molecules/Toast';
import { zIndex } from '../design-system/tokens/zIndex';
import { space } from '../design-system/tokens/spacing';
import { loadNetInfo, type NetInfoState, type NetInfoUnsubscribe } from '../lib/netInfoModule';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ConnectivityState {
  readonly isOnline: boolean;
}

const ConnectivityContext = createContext<ConnectivityState>({ isOnline: true });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const TOAST_AUTO_DISMISS_MS = 3000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ConnectivityProvider({ children }: PropsWithChildren): React.ReactElement {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnectToast, setShowReconnectToast] = useState(false);

  // Track whether this is the first emission (suppress toast on mount)
  const isFirstEmissionRef = useRef(true);
  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous debounced state for transition detection
  const prevOnlineRef = useRef(true);

  const applyState = useCallback((nextOnline: boolean) => {
    setIsOnline(nextOnline);

    // Show "Back online" toast only on offline->online transition (not initial mount)
    if (!isFirstEmissionRef.current && !prevOnlineRef.current && nextOnline) {
      setShowReconnectToast(true);
    }

    prevOnlineRef.current = nextOnline;
    isFirstEmissionRef.current = false;
  }, []);

  useEffect(() => {
    const netInfo = loadNetInfo();
    if (!netInfo) {
      // Native module not available — assume online (graceful fallback)
      return;
    }

    // Guard addEventListener too — the native bridge call can throw even if
    // the JS module loaded (error-log #2b: require succeeds but native is absent)
    let unsubscribe: NetInfoUnsubscribe | null = null;
    try {
      unsubscribe = netInfo.addEventListener((state: NetInfoState) => {
        const nextOnline = state.isConnected === true && state.isInternetReachable !== false;

        // Clear any pending debounce
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }

        // Debounce to avoid rapid toggling during WiFi handoff
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          applyState(nextOnline);
        }, DEBOUNCE_MS);
      });
    } catch {
      // Native module not functional — stay with default isOnline: true
      return;
    }

    return () => {
      unsubscribe?.();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [applyState]);

  const dismissToast = useCallback(() => {
    setShowReconnectToast(false);
  }, []);

  const contextValue: ConnectivityState = { isOnline };

  return (
    <ConnectivityContext.Provider value={contextValue}>
      {children}
      {showReconnectToast ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <Toast
            message="Back online"
            variant="success"
            durationMs={TOAST_AUTO_DISMISS_MS}
            onDismiss={dismissToast}
          />
        </View>
      ) : null}
    </ConnectivityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConnectivity(): ConnectivityState {
  return useContext(ConnectivityContext);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: space[8],
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: zIndex.toast,
  },
});
