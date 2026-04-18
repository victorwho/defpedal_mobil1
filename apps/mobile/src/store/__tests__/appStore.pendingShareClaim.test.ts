// @vitest-environment happy-dom
/**
 * appStore — Pending Share Claim Actions — Unit Tests
 *
 * Verifies the slice-2 state fields + actions:
 *   - `pendingShareClaim`            (persisted, default null)
 *   - `pendingShareClaimAttempts`    (NOT persisted, default 0)
 *   - setPendingShareClaim(code)     (also resets attempts to 0)
 *   - clearPendingShareClaim()       (clears both fields)
 *   - incrementClaimAttempts()       (bumps attempts by 1)
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Same mocks as appStore.mia.test.ts — all native deps need stubs
// before the store module is imported.
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    getAllKeys: vi.fn(),
    multiGet: vi.fn(),
    multiSet: vi.fn(),
    multiRemove: vi.fn(),
  },
}));
vi.mock('../../i18n', () => ({
  getDeviceLocale: () => 'en',
  translate: (_locale: string, key: string) => key,
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
}));

const { useAppStore } = await import('../appStore');

describe('appStore — pending share claim', () => {
  beforeEach(() => {
    // Reset the two claim fields between tests.
    useAppStore.setState({
      pendingShareClaim: null,
      pendingShareClaimAttempts: 0,
    });
  });

  describe('defaults', () => {
    it('pendingShareClaim defaults to null', () => {
      expect(useAppStore.getState().pendingShareClaim).toBeNull();
    });

    it('pendingShareClaimAttempts defaults to 0', () => {
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });
  });

  describe('setPendingShareClaim', () => {
    it('writes the code', () => {
      useAppStore.getState().setPendingShareClaim('abcd1234');
      expect(useAppStore.getState().pendingShareClaim).toBe('abcd1234');
    });

    it('resets attempts to 0 when a new code lands', () => {
      useAppStore.setState({ pendingShareClaimAttempts: 2 });
      useAppStore.getState().setPendingShareClaim('abcd1234');
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });

    it('replacing the code also resets attempts', () => {
      useAppStore.getState().setPendingShareClaim('abcd1234');
      useAppStore.getState().incrementClaimAttempts();
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(2);

      useAppStore.getState().setPendingShareClaim('xyz98765');
      expect(useAppStore.getState().pendingShareClaim).toBe('xyz98765');
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });
  });

  describe('incrementClaimAttempts', () => {
    it('bumps attempts by 1', () => {
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(1);
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(2);
    });

    it('can be called even when no code is pending', () => {
      expect(useAppStore.getState().pendingShareClaim).toBeNull();
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(1);
    });
  });

  describe('clearPendingShareClaim', () => {
    it('clears both fields', () => {
      useAppStore.getState().setPendingShareClaim('abcd1234');
      useAppStore.getState().incrementClaimAttempts();
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaim).toBe('abcd1234');
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(2);

      useAppStore.getState().clearPendingShareClaim();
      expect(useAppStore.getState().pendingShareClaim).toBeNull();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });

    it('is idempotent when already clear', () => {
      useAppStore.getState().clearPendingShareClaim();
      useAppStore.getState().clearPendingShareClaim();
      expect(useAppStore.getState().pendingShareClaim).toBeNull();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });
  });

  describe('state transitions (realistic claim flow)', () => {
    it('set → attempt → attempt → clear', () => {
      // Deep-link handler writes the code.
      useAppStore.getState().setPendingShareClaim('abcd1234');
      expect(useAppStore.getState().pendingShareClaim).toBe('abcd1234');
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);

      // First claim fails (network) — bump attempts.
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(1);

      // Second attempt fails too.
      useAppStore.getState().incrementClaimAttempts();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(2);

      // Third attempt succeeds → processor calls clear.
      useAppStore.getState().clearPendingShareClaim();
      expect(useAppStore.getState().pendingShareClaim).toBeNull();
      expect(useAppStore.getState().pendingShareClaimAttempts).toBe(0);
    });
  });
});
