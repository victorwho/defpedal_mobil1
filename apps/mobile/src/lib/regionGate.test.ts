// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetPermissions, mockLastKnown, mockCurrent, mockReverseGeocode } = vi.hoisted(
  () => ({
    mockGetPermissions: vi.fn(),
    mockLastKnown: vi.fn(),
    mockCurrent: vi.fn(),
    mockReverseGeocode: vi.fn(),
  }),
);

vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: mockGetPermissions,
  getLastKnownPositionAsync: mockLastKnown,
  getCurrentPositionAsync: mockCurrent,
  reverseGeocodeAsync: mockReverseGeocode,
  Accuracy: { Low: 3 },
}));

import {
  clearCountryCodeCacheForTests,
  detectCountryCode,
  reverseGeocodeCountryCode,
} from './regionGate';

const bucharestFix = { coords: { latitude: 44.4268, longitude: 26.1025 } };

beforeEach(() => {
  vi.clearAllMocks();
  clearCountryCodeCacheForTests();
  mockGetPermissions.mockResolvedValue({ status: 'granted' });
  mockLastKnown.mockResolvedValue(bucharestFix);
  mockCurrent.mockResolvedValue(bucharestFix);
  mockReverseGeocode.mockResolvedValue([{ isoCountryCode: 'RO' }]);
});

describe('detectCountryCode', () => {
  it('resolves the ISO code from a last-known fix without requesting a fresh one', async () => {
    await expect(detectCountryCode()).resolves.toBe('RO');
    expect(mockCurrent).not.toHaveBeenCalled();
  });

  it('falls back to a fresh fix when no last-known position exists', async () => {
    mockLastKnown.mockResolvedValue(null);
    await expect(detectCountryCode()).resolves.toBe('RO');
    expect(mockCurrent).toHaveBeenCalledTimes(1);
  });

  it('returns null without touching GPS when permission is not granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    await expect(detectCountryCode()).resolves.toBeNull();
    expect(mockLastKnown).not.toHaveBeenCalled();
  });

  it('returns null when the geocoder throws (offline / unavailable)', async () => {
    mockReverseGeocode.mockRejectedValue(new Error('Geocoder unavailable'));
    await expect(detectCountryCode()).resolves.toBeNull();
  });

  it('returns null when the geocoder yields no country', async () => {
    mockReverseGeocode.mockResolvedValue([{ isoCountryCode: null }]);
    await expect(detectCountryCode()).resolves.toBeNull();
  });

  it('normalizes geocoder output (lowercase, UK alias)', async () => {
    mockReverseGeocode.mockResolvedValue([{ isoCountryCode: 'uk' }]);
    await expect(detectCountryCode()).resolves.toBe('GB');
  });

  it('gives up after the overall timeout instead of hanging the spinner', async () => {
    vi.useFakeTimers();
    try {
      // Geocoder never settles — the 12s overall ceiling must resolve null.
      mockReverseGeocode.mockReturnValue(new Promise(() => {}));
      const pending = detectCountryCode();
      await vi.advanceTimersByTimeAsync(12_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reverseGeocodeCountryCode', () => {
  it('caches by coarse coordinates so nearby repeat calls skip the geocoder', async () => {
    mockReverseGeocode.mockResolvedValue([{ isoCountryCode: 'DE' }]);

    await expect(reverseGeocodeCountryCode(52.52, 13.405)).resolves.toBe('DE');
    // ~1 km away — same 0.1° bucket, must be served from cache.
    await expect(reverseGeocodeCountryCode(52.525, 13.41)).resolves.toBe('DE');

    expect(mockReverseGeocode).toHaveBeenCalledTimes(1);
  });

  it('caches a null resolution but not a thrown failure', async () => {
    // Thrown failure (offline geocoder): NOT cached — retry can succeed.
    mockReverseGeocode.mockRejectedValueOnce(new Error('unavailable'));
    await expect(reverseGeocodeCountryCode(48.85, 2.35)).resolves.toBeNull();

    mockReverseGeocode.mockResolvedValue([{ isoCountryCode: 'FR' }]);
    await expect(reverseGeocodeCountryCode(48.85, 2.35)).resolves.toBe('FR');
    expect(mockReverseGeocode).toHaveBeenCalledTimes(2);
  });
});
