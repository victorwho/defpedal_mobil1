import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  let mockRelease: ReturnType<typeof vi.fn>;
  let mockRequest: ReturnType<typeof vi.fn>;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRelease = vi.fn().mockResolvedValue(undefined);
    mockRequest = vi.fn().mockResolvedValue({
      release: mockRelease,
      addEventListener: vi.fn(),
    });
    mockQuery = vi.fn().mockResolvedValue({ state: 'granted' });

    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: {
        request: mockRequest,
      },
    });

    Object.defineProperty(navigator, 'permissions', {
      writable: true,
      value: {
        query: mockQuery,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should request and release wake lock', async () => {
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
      await result.current.requestWakeLock();
    });

    expect(mockQuery).toHaveBeenCalledWith({ name: 'screen-wake-lock' });
    expect(mockRequest).toHaveBeenCalledWith('screen');

    await act(async () => {
      await result.current.releaseWakeLock();
    });

    expect(mockRelease).toHaveBeenCalled();
  });

  it('should not request wake lock if not supported', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
      await result.current.requestWakeLock();
    });

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should not request wake lock if permission denied', async () => {
    mockQuery.mockResolvedValue({ state: 'denied' });

    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
      await result.current.requestWakeLock();
    });

    expect(mockQuery).toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
