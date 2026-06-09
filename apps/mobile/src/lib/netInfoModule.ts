/**
 * Lazy NetInfo loader — the guarded `require()` for
 * `@react-native-community/netinfo`, isolated behind an ESM import seam.
 *
 * Why this lives in its own file (not inline in ConnectivityMonitor):
 *  - The native module may not be compiled into the APK yet. We MUST check
 *    `NativeModules.RNCNetInfo` BEFORE `require()` — the netinfo JS module
 *    throws an invariant on evaluation when the native bridge is absent, and
 *    that throw can escape try/catch in some RN runtimes (error-log #2b / #23).
 *    Keeping a runtime `require()` (not a top-level `import`) preserves that
 *    protection: the real package is only evaluated when the bridge exists.
 *  - vitest's `vi.mock` does NOT intercept a runtime `require()` inside a
 *    transformed module — the require bypasses the mock and tries to load the
 *    real Flow-laden package, which fails to parse (`Unexpected token 'typeof'`)
 *    and gets swallowed by the catch, so the loader silently returns null in
 *    tests. An ESM `import { loadNetInfo }` IS reliably mockable, so
 *    ConnectivityMonitor imports this seam and tests `vi.mock('../lib/netInfoModule')`.
 */
import { NativeModules } from 'react-native';

export type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export type NetInfoUnsubscribe = () => void;

export interface NetInfoModule {
  addEventListener: (cb: (state: NetInfoState) => void) => NetInfoUnsubscribe;
}

export function loadNetInfo(): NetInfoModule | null {
  // Gate on native module existence — same pattern as push-notifications.ts
  if (!NativeModules.RNCNetInfo) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-community/netinfo') as {
      default?: NetInfoModule;
    } & NetInfoModule;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}
