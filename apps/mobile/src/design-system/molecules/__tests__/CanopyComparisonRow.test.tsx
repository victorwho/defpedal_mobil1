// @vitest-environment happy-dom
/**
 * CanopyComparisonRow Molecule — Unit Tests
 *
 * This is the CONSUMER half of the canopy feature. `mapbox-routing.test.ts`
 * proves the comparison reaches `RoutePreviewResponse.canopy`; nothing there
 * says a rider ever sees it. Producer and consumer are two checks
 * (error-log #114), and a screen whose content is in the bundle but never
 * renders is error-log #106.
 *
 * `useT` is bound to the REAL `translate`, so these assert the shipped EN/RO/ES
 * copy with real interpolation — not a mock's idea of it.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { translate, type Locale } from '../../../i18n';

let activeLocale: Locale = 'en';

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    translate(activeLocale, key, vars),
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: { textPrimary: '#FFFFFF', textSecondary: '#B0B8C1' },
  }),
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}` }),
    ),
  };
});

const { CanopyComparisonRow } = await import('../CanopyComparisonRow');

/** Shade route clearly ahead — the headline case. */
const GAIN = { shadeTreePct: 72.5, standardTreePct: 45.8 };
/** The two routes tie exactly — 8 of 18 real routes measured. */
const TIE = { shadeTreePct: 32.9, standardTreePct: 32.9 };
/** Shade route behind by a real margin — no honest headline exists. */
const LOSS = { shadeTreePct: 11.2, standardTreePct: 30.4 };

const renderRow = (
  canopy: Parameters<typeof CanopyComparisonRow>[0]['canopy'],
  locale: Locale = 'en',
) => {
  activeLocale = locale;
  return render(<CanopyComparisonRow canopy={canopy} />);
};

const textOf = (
  canopy: Parameters<typeof CanopyComparisonRow>[0]['canopy'],
  locale: Locale = 'en',
) => renderRow(canopy, locale).container.textContent ?? '';

describe('CanopyComparisonRow', () => {
  describe('when the shade route carries meaningfully more canopy', () => {
    it('leads with the gain as a headline', () => {
      renderRow(GAIN);
      // 72.5 - 45.8 = 26.7 -> 27 percentage points.
      expect(screen.getByText('+27% more shade')).toBeTruthy();
    });

    it('still states both absolute figures underneath', () => {
      const text = textOf(GAIN);
      expect(text).toContain('72.5%');
      expect(text).toContain('45.8%');
      expect(text).toContain('standard route');
    });

    it('reports percentage POINTS, not a relative increase', () => {
      // Relative would be +58% for this pair. That number must not appear.
      const text = textOf(GAIN);
      expect(text).toContain('+27%');
      expect(text).not.toContain('58');
    });

    it('does not inflate a small absolute share into a big relative claim', () => {
      // 2% vs 1% is "+100% more shade" relatively, for a ride 98% in the sun.
      const text = textOf({ shadeTreePct: 2, standardTreePct: 1 });
      expect(text).not.toContain('100');
      // 1 point of difference is at the threshold, so it reads +1%.
      expect(text).toContain('+1% more shade');
    });
  });

  describe('when the two routes are effectively the same', () => {
    it('says so instead of claiming a gain', () => {
      const text = textOf(TIE);
      expect(text).toContain('Similar tree cover');
      expect(text).not.toContain('more shade');
      expect(text).not.toContain('+0%');
    });

    it('treats a sub-threshold LOSS as similar rather than negative', () => {
      // Measured real losses were -0.2 and -0.7 points.
      const text = textOf({ shadeTreePct: 24.1, standardTreePct: 24.3 });
      expect(text).toContain('Similar tree cover');
      expect(text).not.toMatch(/-\s*\d/);
    });
  });

  describe('when the shade route carries meaningfully LESS canopy', () => {
    it('makes no headline claim and states both figures plainly', () => {
      const text = textOf(LOSS);
      expect(text).toContain('11.2%');
      expect(text).toContain('30.4%');
      expect(text).not.toContain('more shade');
      // Neither a negative number nor a false "similar".
      expect(text).not.toMatch(/-\s*\d/);
      expect(text).not.toContain('Similar tree cover');
    });
  });

  describe('renders nothing when', () => {
    it('there is no comparison', () => {
      expect(renderRow(undefined).container.firstChild).toBeNull();
    });

    it('the comparison is explicitly null', () => {
      expect(renderRow(null).container.firstChild).toBeNull();
    });
  });

  /*
   * The display rules, asserted on what actually reaches the screen — the
   * props are not what a rider reads. Every state is checked, because the
   * failure mode is a claim sneaking in on one branch only.
   */
  describe('never makes a claim the data cannot support', () => {
    const ALL = [
      ['gain', GAIN],
      ['tie', TIE],
      ['loss', LOSS],
    ] as const;

    it('never renders a negative number in any state', () => {
      for (const [name, canopy] of ALL) {
        const { unmount } = renderRow(canopy);
        expect(document.body.textContent ?? '', name).not.toMatch(/-\s*\d/);
        unmount();
      }
    });

    it('never claims a temperature in any state', () => {
      for (const [name, canopy] of ALL) {
        const { unmount } = renderRow(canopy);
        expect(document.body.textContent ?? '', name).not.toMatch(
          /cool|cooler|warm|degree|°|heat|temperature/i,
        );
        unmount();
      }
    });

    it('never presents a time or distance cost in any state', () => {
      for (const [name, canopy] of ALL) {
        const { unmount } = renderRow(canopy);
        expect(document.body.textContent ?? '', name).not.toMatch(
          /\bmin\b|minute|\bkm\b|slower|longer/i,
        );
        unmount();
      }
    });
  });

  describe('accessibility', () => {
    it('announces the headline and the detail together', () => {
      const { container } = renderRow(GAIN);
      const label = container.firstElementChild?.getAttribute('aria-label') ?? '';
      expect(label).toContain('+27% more shade');
      expect(label).toContain('72.5%');
      expect(label).toContain('45.8%');
    });

    it('avoids the middot separator in the no-gain announcement', () => {
      const { container } = renderRow(LOSS);
      const label = container.firstElementChild?.getAttribute('aria-label') ?? '';
      expect(label).toContain('percent tree-lined');
      expect(label).not.toContain('·');
    });
  });

  describe('localisation', () => {
    it('renders the Romanian headline and figures', () => {
      const text = textOf(GAIN, 'ro');
      expect(text).toContain('+27%');
      expect(text).toContain('72.5%');
      expect(text).toContain('sub copaci');
      // Răcoros is the MODE name; the canopy claim must not borrow it.
      expect(text).not.toMatch(/răcoros|grade|temperatur/i);
    });

    it('renders the Spanish headline and figures', () => {
      const text = textOf(GAIN, 'es');
      expect(text).toContain('+27%');
      expect(text).toContain('72.5%');
      expect(text).toContain('bajo arbolado');
      expect(text).not.toMatch(/fresco|grado|temperatur/i);
    });

    it('leaves no untranslated key or unfilled placeholder, in any state or locale', () => {
      for (const locale of ['en', 'ro', 'es'] as const) {
        for (const [name, canopy] of [
          ['gain', GAIN],
          ['tie', TIE],
          ['loss', LOSS],
        ] as const) {
          const { container, unmount } = renderRow(canopy, locale);
          const text = container.textContent ?? '';
          expect(text, `${locale}/${name}`).not.toContain('preview.canopy');
          expect(text, `${locale}/${name}`).not.toContain('{{');
          unmount();
        }
      }
    });
  });
});
