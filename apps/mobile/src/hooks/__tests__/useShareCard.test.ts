// @vitest-environment happy-dom
/**
 * useShareCard — Unit Tests
 *
 * Verifies that for each card variant (milestone / badge / mia):
 *   - the React element is handed to the capture host,
 *   - `buildShareCaption` is called with the correct plain-data payload
 *     (the `card` element is stripped), and
 *   - `shareImage` is invoked with the captured URI + caption.
 * Also verifies `isSharing` toggles during the in-flight capture+share.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Core module spy — buildShareCaption
// ---------------------------------------------------------------------------

const captionSpy = vi.fn<(input: unknown) => string>();

vi.mock('@defensivepedal/core', () => ({
  buildShareCaption: (input: unknown) => captionSpy(input),
}));

// ---------------------------------------------------------------------------
// shareImage — the final I/O boundary
// ---------------------------------------------------------------------------

const shareImageSpy = vi.fn<() => Promise<{ shared: boolean; savedToLibrary: boolean }>>();

vi.mock('../../lib/shareImage', () => ({
  shareImage: (...args: unknown[]) => shareImageSpy(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Capture host
// ---------------------------------------------------------------------------

const captureSpy = vi.fn<() => Promise<string>>();

vi.mock('../../providers/OffScreenCaptureHost', () => ({
  useCaptureHost: () => ({ capture: (...args: unknown[]) => captureSpy(...(args as [])) }),
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useShareCard } = await import('../useShareCard');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPTION = 'Unlocked the test milestone on Defensive Pedal. #DefensivePedal';
const FILE_URI = 'file:///tmp/share-card.png';

const dummyCardElement = React.createElement('View', { testID: 'card' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  captionSpy.mockReset().mockReturnValue(CAPTION);
  captureSpy.mockReset().mockResolvedValue(FILE_URI);
  shareImageSpy.mockReset().mockResolvedValue({ shared: true, savedToLibrary: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useShareCard', () => {
  describe('milestone variant', () => {
    it('captures, builds caption, and invokes shareImage', async () => {
      const { result } = renderHook(() => useShareCard());

      let res: { shared: boolean; savedToLibrary: boolean } | undefined;
      await act(async () => {
        res = await result.current.share({
          type: 'milestone',
          milestoneTitle: '7-Day Streak',
          milestoneValue: '7 days',
          card: dummyCardElement,
        });
      });

      expect(captureSpy).toHaveBeenCalledTimes(1);
      const captureArgs = captureSpy.mock.calls[0];
      expect(captureArgs[0]).toBe(dummyCardElement);
      expect(captureArgs[1]).toEqual({ width: 1080, height: 1080 });

      expect(captionSpy).toHaveBeenCalledWith({
        type: 'milestone',
        milestoneTitle: '7-Day Streak',
        milestoneValue: '7 days',
      });

      expect(shareImageSpy).toHaveBeenCalledWith(FILE_URI, CAPTION);
      expect(res).toEqual({ shared: true, savedToLibrary: true });
    });
  });

  describe('badge variant', () => {
    it('forwards tier + rarity to the caption builder', async () => {
      const { result } = renderHook(() => useShareCard());

      await act(async () => {
        await result.current.share({
          type: 'badge',
          badgeName: 'Hazard Hunter',
          tier: 'Gold',
          rarity: 'Rare',
          card: dummyCardElement,
        });
      });

      expect(captionSpy).toHaveBeenCalledWith({
        type: 'badge',
        badgeName: 'Hazard Hunter',
        tier: 'Gold',
        rarity: 'Rare',
      });
      expect(shareImageSpy).toHaveBeenCalledWith(FILE_URI, CAPTION);
    });

    it('omits tier/rarity when not supplied', async () => {
      const { result } = renderHook(() => useShareCard());

      await act(async () => {
        await result.current.share({
          type: 'badge',
          badgeName: 'First Ride',
          card: dummyCardElement,
        });
      });

      expect(captionSpy).toHaveBeenCalledWith({
        type: 'badge',
        badgeName: 'First Ride',
        tier: undefined,
        rarity: undefined,
      });
    });
  });

  describe('mia variant', () => {
    it('forwards level + levelTitle to the caption builder', async () => {
      const { result } = renderHook(() => useShareCard());

      await act(async () => {
        await result.current.share({
          type: 'mia',
          level: 3,
          levelTitle: 'Cafe Rider',
          card: dummyCardElement,
        });
      });

      expect(captionSpy).toHaveBeenCalledWith({
        type: 'mia',
        level: 3,
        levelTitle: 'Cafe Rider',
      });
      expect(shareImageSpy).toHaveBeenCalledWith(FILE_URI, CAPTION);
    });
  });

  describe('isSharing state', () => {
    it('is true during the in-flight capture and false after', async () => {
      let resolveCapture: (uri: string) => void = () => undefined;
      captureSpy.mockReset().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveCapture = resolve;
          }),
      );

      const { result } = renderHook(() => useShareCard());
      expect(result.current.isSharing).toBe(false);

      let pending: Promise<{ shared: boolean; savedToLibrary: boolean }> | undefined;
      act(() => {
        pending = result.current.share({
          type: 'milestone',
          milestoneTitle: 'x',
          milestoneValue: 'y',
          card: dummyCardElement,
        });
      });

      expect(result.current.isSharing).toBe(true);

      await act(async () => {
        resolveCapture(FILE_URI);
        await pending;
      });

      expect(result.current.isSharing).toBe(false);
    });
  });

  describe('failure modes', () => {
    it('returns shared=false when capture throws', async () => {
      captureSpy.mockRejectedValueOnce(new Error('capture native missing'));
      const { result } = renderHook(() => useShareCard());

      let res: { shared: boolean; savedToLibrary: boolean } | undefined;
      await act(async () => {
        res = await result.current.share({
          type: 'mia',
          level: 2,
          levelTitle: 'Explorer',
          card: dummyCardElement,
        });
      });

      expect(res).toEqual({ shared: false, savedToLibrary: false });
      expect(shareImageSpy).not.toHaveBeenCalled();
    });
  });
});
