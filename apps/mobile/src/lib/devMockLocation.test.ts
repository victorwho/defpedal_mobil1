// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockGetItem, mockSetItem, mockRemoveItem } = vi.hoisted(() => ({
  // Mutable so individual tests can flip the environment.
  mockEnv: { appEnv: 'preview' as string, appVariant: 'preview' as string },
  mockGetItem: vi.fn().mockResolvedValue(null),
  mockSetItem: vi.fn().mockResolvedValue(undefined),
  mockRemoveItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./env', () => ({ mobileEnv: mockEnv }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
  },
}));

import {
  getDevMockLocation,
  resetDevMockLocationForTests,
  setDevMockLocation,
} from './devMockLocation';

const berlin = { lat: 52.52, lon: 13.405 };

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.appEnv = 'preview';
  mockEnv.appVariant = 'preview';
  resetDevMockLocationForTests();
});

describe('devMockLocation — dev/preview builds', () => {
  it('is off by default', () => {
    expect(getDevMockLocation()).toBeNull();
  });

  it('set → get round-trips and persists to storage', async () => {
    await setDevMockLocation(berlin);
    expect(getDevMockLocation()).toEqual(berlin);
    expect(mockSetItem).toHaveBeenCalledWith(
      'devMockLocation.v1',
      JSON.stringify(berlin),
    );
  });

  it('clearing removes the persisted value', async () => {
    await setDevMockLocation(berlin);
    await setDevMockLocation(null);
    expect(getDevMockLocation()).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('devMockLocation.v1');
  });
});

describe('devMockLocation — PRODUCTION guarantee', () => {
  it('get always returns null in production, even with a value cached from before', async () => {
    // Value set while in preview (e.g. a stale persisted value on a device
    // that later installs a production build over the top).
    await setDevMockLocation(berlin);
    expect(getDevMockLocation()).toEqual(berlin);

    mockEnv.appEnv = 'production';
    expect(getDevMockLocation()).toBeNull();
  });

  it('set is a complete no-op in production (no cache, no storage write)', async () => {
    mockEnv.appEnv = 'production';
    await setDevMockLocation(berlin);

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(getDevMockLocation()).toBeNull();

    // Even flipping back (impossible at runtime, but proves nothing leaked
    // into the cache during the production write attempt):
    mockEnv.appEnv = 'preview';
    expect(getDevMockLocation()).toBeNull();
  });

  it('EITHER production signal disables the tool (appVariant alone, appEnv alone)', async () => {
    // The two flags come from two separate build systems (build-preview.sh
    // vs eas.json). A build path that forgets one must still fail closed.
    await setDevMockLocation(berlin);

    mockEnv.appVariant = 'production'; // appEnv still 'preview'
    expect(getDevMockLocation()).toBeNull();

    mockEnv.appVariant = 'preview';
    mockEnv.appEnv = 'production'; // appVariant back to 'preview'
    expect(getDevMockLocation()).toBeNull();
  });
});
