import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  let mockWatchPosition: ReturnType<typeof vi.fn>;
  let mockClearWatch: ReturnType<typeof vi.fn>;
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWatchPosition = vi.fn().mockReturnValue(123);
    mockClearWatch = vi.fn();
    mockGetCurrentPosition = vi.fn();

    Object.defineProperty(global.navigator, 'geolocation', {
      writable: true,
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
        getCurrentPosition: mockGetCurrentPosition,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error if geolocation is not supported', () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useGeolocation(false));
    expect(result.current.error).toBe('Geolocation is not supported by your browser.');
  });

  it('should call getCurrentPosition when isWatching is false', () => {
    renderHook(() => useGeolocation(false));
    expect(mockGetCurrentPosition).toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it('should call watchPosition when isWatching is true', () => {
    renderHook(() => useGeolocation(true));
    expect(mockWatchPosition).toHaveBeenCalled();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it('should update location on success', () => {
    const { result } = renderHook(() => useGeolocation(false));

    const successCallback = mockGetCurrentPosition.mock.calls[0][0];
    
    act(() => {
      successCallback({
        coords: {
          latitude: 10,
          longitude: 20,
          accuracy: 5,
        }
      });
    });

    expect(result.current.location?.latitude).toBe(10);
    expect(result.current.location?.longitude).toBe(20);
    expect(result.current.error).toBeNull();
  });

  it('should update error on failure', () => {
    const { result } = renderHook(() => useGeolocation(false));

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    
    act(() => {
      errorCallback({
        message: 'User denied Geolocation',
      });
    });

    expect(result.current.error).toBe('Error getting location: User denied Geolocation');
  });

  it('should clear watch on unmount', () => {
    const { unmount } = renderHook(() => useGeolocation(true));
    
    unmount();
    
    expect(mockClearWatch).toHaveBeenCalledWith(123);
  });
});
