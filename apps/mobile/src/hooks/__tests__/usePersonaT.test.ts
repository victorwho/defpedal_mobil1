// @vitest-environment happy-dom
/**
 * usePersonaT Hook — Unit Tests
 *
 * Tests persona-conditional copy resolution: Mia persona tries mia.* prefix
 * first, falls back to standard key. Alex always uses standard.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTranslate = vi.fn();

vi.mock('../../i18n', () => ({
  translate: (...args: unknown[]) => mockTranslate(...args),
}));

let mockStoreState: Record<string, unknown> = {};

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

const { usePersonaT } = await import('../usePersonaT');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePersonaT', () => {
  beforeEach(() => {
    mockTranslate.mockReset();
    mockStoreState = { locale: 'en', persona: 'alex' };
  });

  describe('alex persona (default)', () => {
    it('resolves standard key without mia prefix', () => {
      mockTranslate.mockReturnValue('Welcome back');
      const { result } = renderHook(() => usePersonaT());
      const translated = result.current('planning.welcome');
      expect(mockTranslate).toHaveBeenCalledWith('en', 'planning.welcome', undefined);
      expect(mockTranslate).toHaveBeenCalledTimes(1);
      expect(translated).toBe('Welcome back');
    });

    it('passes interpolation variables through', () => {
      mockTranslate.mockReturnValue('10 km');
      const { result } = renderHook(() => usePersonaT());
      result.current('stats.distance', { distance: 10 });
      expect(mockTranslate).toHaveBeenCalledWith('en', 'stats.distance', { distance: 10 });
    });
  });

  describe('mia persona', () => {
    beforeEach(() => {
      mockStoreState = { locale: 'en', persona: 'mia' };
    });

    it('tries mia.* prefix first and uses it if it resolves', () => {
      mockTranslate.mockImplementation((_locale: string, key: string) => {
        if (key === 'mia.planning.welcome') return 'Welcome! Your first ride awaits';
        if (key === 'planning.welcome') return 'Welcome back';
        return key;
      });
      const { result } = renderHook(() => usePersonaT());
      const translated = result.current('planning.welcome');
      expect(translated).toBe('Welcome! Your first ride awaits');
    });

    it('falls back to standard key when mia prefix does not resolve', () => {
      mockTranslate.mockImplementation((_locale: string, key: string) => {
        if (key === 'mia.common.cancel') return 'mia.common.cancel';
        if (key === 'common.cancel') return 'Cancel';
        return key;
      });
      const { result } = renderHook(() => usePersonaT());
      const translated = result.current('common.cancel');
      expect(translated).toBe('Cancel');
    });

    it('passes variables to both mia and fallback calls', () => {
      const vars = { count: 5 };
      mockTranslate.mockImplementation((_locale: string, key: string) => {
        if (key === 'mia.stats.rides') return 'mia.stats.rides';
        if (key === 'stats.rides') return '5 rides';
        return key;
      });
      const { result } = renderHook(() => usePersonaT());
      result.current('stats.rides', vars);
      expect(mockTranslate).toHaveBeenCalledWith('en', 'mia.stats.rides', vars);
      expect(mockTranslate).toHaveBeenCalledWith('en', 'stats.rides', vars);
    });
  });

  describe('locale support', () => {
    it('uses ro locale when set', () => {
      mockStoreState = { locale: 'ro', persona: 'alex' };
      mockTranslate.mockReturnValue('Bine ați revenit');
      const { result } = renderHook(() => usePersonaT());
      result.current('planning.welcome');
      expect(mockTranslate).toHaveBeenCalledWith('ro', 'planning.welcome', undefined);
    });
  });
});
