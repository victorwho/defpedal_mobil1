// @vitest-environment happy-dom
/**
 * RankUpOverlay — the component's first tests.
 *
 * It had none (TODO.md QUAL-4), which is how a guaranteed crash shipped: the
 * celebration scheduled `hapticImpact('heavy')`, a function `lib/haptics` has
 * never exported. `require()` returns `any` so TypeScript could not see it, the
 * destructure of a real module object does not throw so the surrounding
 * try/catch caught nothing, and the failure surfaced 500ms later INSIDE the
 * timer — outside the guard — as an unhandled `TypeError: undefined is not a
 * function`. Every tier promotion crashed the app
 * (Sentry 939de541, production 0.2.170+173).
 *
 * So the test that matters is not "does it render" but "does the deferred work
 * survive being run".
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const hapticSuccessSpy = vi.fn();
vi.mock('../../../lib/haptics', () => ({
  hapticSuccess: () => hapticSuccessSpy(),
}));

// No react-native mock here on purpose. apps/mobile/vitest.mock-rn.ts is already
// aliased in for `react-native` and is a complete double: Animated.View exists,
// its animations run synchronously, and AccessibilityInfo.isReduceMotionEnabled()
// resolves false — which is the branch that schedules the haptic. Overriding
// Animated locally is what produced "Element type is invalid".

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#fff',
      textSecondary: '#ccc',
      textMuted: '#999',
      bgDeep: '#111',
      bgPrimary: '#222',
      bgSecondary: '#333',
      accent: '#FACC15',
      border: '#444',
    },
  }),
}));

vi.mock('../../atoms/HoloMedallion', () => ({ HoloMedallion: () => null }));
vi.mock('../../atoms/TierPill', () => ({ TierPill: () => null }));

const { RankUpOverlay } = await import('../RankUpOverlay');

const props = {
  oldTier: 'spoke' as never,
  newTier: 'pedaler' as never,
  tierDisplayName: 'Pedaler',
  tagline: 'Finding your rhythm',
  tierColor: '#FACC15',
  perkDescription: 'Unlocked something',
  onDismiss: () => {},
};

beforeEach(() => {
  vi.useFakeTimers();
  hapticSuccessSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RankUpOverlay', () => {
  it('does not throw when the deferred haptic actually runs', () => {
    // The regression. Before the fix this threw
    // "undefined is not a function" 500ms after mount, unhandled and fatal.
    render(<RankUpOverlay {...props} />);

    expect(() => {
      vi.advanceTimersByTime(600);
    }).not.toThrow();

    expect(hapticSuccessSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fire the haptic before its delay', () => {
    // Guards against the timer being dropped for an immediate call, which would
    // punctuate nothing — the medallion has not landed yet at T+0.
    render(<RankUpOverlay {...props} />);

    vi.advanceTimersByTime(400);
    expect(hapticSuccessSpy).not.toHaveBeenCalled();
  });

  it('cancels the haptic when dismissed before it fires', () => {
    // Without the cleanup the overlay buzzed the phone after it was gone.
    const { unmount } = render(<RankUpOverlay {...props} />);

    unmount();
    vi.advanceTimersByTime(1_000);

    expect(hapticSuccessSpy).not.toHaveBeenCalled();
  });
});
