import { describe, it, expect, afterEach } from 'vitest';
import { NativeModules } from 'react-native';

import { loadNetInfo } from './netInfoModule';

// NB: this test exercises the REAL loadNetInfo (no vi.mock of this module) to
// cover the native-module guard + the never-throw contract. ConnectivityMonitor's
// own test mocks the `loadNetInfo` seam instead — see error-log #2b / #23 and
// netInfoModule.ts for why the guarded require lives behind this seam.

describe('loadNetInfo', () => {
  const original = NativeModules.RNCNetInfo;

  afterEach(() => {
    NativeModules.RNCNetInfo = original;
  });

  it('returns null when the RNCNetInfo native module is absent (bridge not compiled in)', () => {
    NativeModules.RNCNetInfo = undefined;
    expect(loadNetInfo()).toBeNull();
  });

  it('never throws — returns null when the native bridge guard passes but the JS module cannot load', () => {
    // Guard is truthy, so loadNetInfo proceeds to require(). In any environment
    // where the real @react-native-community/netinfo cannot be evaluated (here:
    // unparseable Flow source under vitest; on-device: native bridge absent),
    // the try/catch must swallow the failure and return null rather than let an
    // invariant escape. This is the protection from error-log #2b / #23.
    NativeModules.RNCNetInfo = {};
    let result: ReturnType<typeof loadNetInfo> | undefined;
    expect(() => {
      result = loadNetInfo();
    }).not.toThrow();
    expect(result).toBeNull();
  });
});
