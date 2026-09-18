/**
 * Contrast regression guard for content on safety-tinted surfaces.
 *
 * These tests do NOT snapshot the hex values — they recompute the WCAG
 * contrast ratio from the live tokens against the live tint, in both themes.
 * So this fails if someone changes a palette colour, changes a tint alpha, or
 * routes a badge back to the bright colour in light mode. A test that asserted
 * `safetyOnTint(...) === '#166534'` would pass through every one of those.
 */
import { describe, expect, it } from 'vitest';

import { darkTheme, lightTheme } from '../colors';
import { safetyTints } from '../tints';
import { safetyOnTint, type SafetyTone } from '../safetyOnTint';

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance + contrast
// ---------------------------------------------------------------------------

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (fg: string, bg: string): number => {
  const a = luminance(parseHex(fg));
  const b = luminance(parseHex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Flatten an `rgba(r, g, b, a)` tint onto an opaque background. */
const compositeTint = (rgba: string, backgroundHex: string): string => {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (!match) throw new Error(`not an rgba() tint: ${rgba}`);
  const [, r, g, b, a] = match;
  const alpha = Number(a);
  const bg = parseHex(backgroundHex);
  const mixed = [Number(r), Number(g), Number(b)].map((c, i) =>
    Math.round(c * alpha + bg[i]! * (1 - alpha)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

// ---------------------------------------------------------------------------
// The surfaces these colours actually sit on
// ---------------------------------------------------------------------------

/*
 * The route-preview content lives inside `MapStageScreen`'s collapsible sheet,
 * NOT on `bgPrimary`. Getting this wrong is not academic — measured against
 * bgPrimary the error panel reads 4.26:1 in dark (a failure that is not real)
 * and `danger`/`info` read ~3.5:1 (an exclusion that was not warranted). The
 * sheet fill is 96% opaque; the 4% of map showing through is ignored here,
 * which is the conservative direction in both themes.
 */
const SHEET = { dark: '#0B1020', light: '#FFFFFF' } as const;

const THEMES = [
  { mode: 'dark' as const, colors: darkTheme },
  { mode: 'light' as const, colors: lightTheme },
];

const TONES: SafetyTone[] = ['safe', 'caution', 'danger', 'info'];

const TONE_TINT: Record<SafetyTone, string> = {
  safe: safetyTints.safeLight,
  caution: safetyTints.cautionLight,
  danger: safetyTints.dangerLight,
  info: safetyTints.infoLight,
};

/** WCAG AA: 4.5:1 for body text, 3:1 for icons and other non-text UI. */
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe('safetyOnTint', () => {
  describe('every tone is readable on its own tint, in both themes', () => {
    for (const { mode, colors } of THEMES) {
      for (const tone of TONES) {
        it(`${tone} in ${mode} theme`, () => {
          const surface = compositeTint(TONE_TINT[tone], SHEET[mode]);
          const ratio = contrast(safetyOnTint(colors, mode, tone), surface);
          expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    }
  });

  /*
   * The rule is about whether the SURFACE follows the theme, not about safety
   * tints specifically — so these are the two real non-tint surfaces on the
   * route-preview screen that use it. Both were failing before this module.
   */
  describe('holds on the non-tint surfaces of this screen too', () => {
    it('the offline card, which is an opaque bgSecondary', () => {
      for (const { mode, colors } of THEMES) {
        const ratio = contrast(safetyOnTint(colors, mode, 'safe'), colors.bgSecondary);
        expect(ratio, mode).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it('the error panel, which is cautionTint at ~16% over the sheet', () => {
      for (const { mode, colors } of THEMES) {
        // `colors.cautionTint + '28'` in route-preview: 0x28 = 40/255.
        const surface = compositeTint(
          `rgba(254, 243, 199, ${40 / 255})`,
          SHEET[mode],
        );
        const ratio = contrast(safetyOnTint(colors, mode, 'caution'), surface);
        expect(ratio, mode).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });

  /*
   * The bug this module was written for. Without these, the guards above could
   * be satisfied by a helper that happened to return something readable while
   * the real defect — reaching for the bright colour in light mode — went
   * unnoticed. These assert the broken choice IS broken, so the tests above
   * are known to be measuring something that can fail.
   */
  describe('the pre-fix choice really does fail, in light mode only', () => {
    it('the bright colours are unreadable on their own light tints', () => {
      for (const tone of TONES) {
        const surface = compositeTint(TONE_TINT[tone], SHEET.light);
        const bright =
          tone === 'safe'
            ? lightTheme.safe
            : tone === 'caution'
              ? lightTheme.caution
              : tone === 'danger'
                ? lightTheme.danger
                : lightTheme.info;
        expect(contrast(bright, surface), tone).toBeLessThan(AA_TEXT);
      }
    });

    it('the calmer badge title specifically, which shipped this way', () => {
      const surface = compositeTint(safetyTints.safeLight, SHEET.light);
      // 2.09:1 — under even the 3:1 non-text floor.
      expect(contrast(lightTheme.safe, surface)).toBeLessThan(AA_NON_TEXT);
    });

    it('and the dark text variants would be unreadable if used on dark', () => {
      const surface = compositeTint(safetyTints.safeLight, SHEET.dark);
      expect(contrast(darkTheme.safeText, surface)).toBeLessThan(AA_NON_TEXT);
    });
  });

  it('returns a different colour per theme for every tone', () => {
    for (const tone of TONES) {
      expect(safetyOnTint(darkTheme, 'dark', tone), tone).not.toBe(
        safetyOnTint(lightTheme, 'light', tone),
      );
    }
  });
});
