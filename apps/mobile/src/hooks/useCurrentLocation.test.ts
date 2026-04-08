// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-location
const mockGetForegroundPermissionsAsync = vi.fn();
const mockRequestForegroundPermissionsAsync = vi.fn();
const mockGetCurrentPositionAsync = vi.fn();

vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) =>
    mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) =>
    mockGetCurrentPositionAsync(...args),
  Accuracy: { High: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

import { useCurrentLocation } from './useCurrentLocation';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCurrentLocation', () => {
  it('returns initial loading state', () => {
    // Make permissions never resolve so we stay in loading state
    mockGetForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCurrentLocation());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.permissionStatus).toBe('undetermined');
    expect(result.current.error).toBeNull();
  });

  it('fetches location when permission is already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 12.5 },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
    expect(result.current.accuracyMeters).toBe(12.5);
    expect(result.current.permissionStatus).toBe('granted');
    expect(result.current.error).toBeNull();
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 48.85, longitude: 2.35, accuracy: 8 },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toEqual({ lat: 48.85, lon: 2.35 });
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('sets error when permission is denied', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.permissionStatus).toBe('denied');
    expect(result.current.error).toBe(
      'Location permission is required to use the rider\u2019s current position.',
    );
  });

  it('handles getCurrentPositionAsync failure gracefully', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.error).toBe('GPS unavailable');
  });

  it('handles non-Error exceptions with a fallback message', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValue('something went wrong');

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Unable to resolve the current location.');
  });

  it('handles null accuracy from GPS', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: null },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
  });

  it('refreshLocation re-fetches location and clears previous error', async () => {
    // First call fails
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS fail'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('GPS fail');

    // Second call succeeds
    mockGetCurrentPositionAsync.mockResolvedValueOnce({
      coords: { latitude: 51.5, longitude: -0.12, accuracy: 5 },
    });

    await act(async () => {
      await result.current.refreshLocation();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.location).toEqual({ lat: 51.5, lon: -0.12 });
    expect(result.current.accuracyMeters).toBe(5);
  });
});
