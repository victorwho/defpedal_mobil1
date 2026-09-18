import { describe, expect, it } from 'vitest';

import {
  describeCanopyComparison,
  formatTreePct,
  parseCanopyCompareResponse,
} from './canopyComparison';

/** A real-shaped success body, as returned by the shade server. */
const okBody = (overrides?: Record<string, unknown>) => ({
  code: 'Ok',
  shade: { tree_pct: 29.0, coverage_pct: 83.6, distance_m: 9804 },
  safe: { tree_pct: 28.6, coverage_pct: 84.9, distance_m: 9836 },
  display: true,
  gen: 'b46v2-armEp2',
  ...overrides,
});

describe('parseCanopyCompareResponse', () => {
  it('reads both tree percentages from an Ok, displayable response', () => {
    expect(parseCanopyCompareResponse(okBody())).toEqual({
      shadeTreePct: 29.0,
      standardTreePct: 28.6,
    });
  });

  it('carries no delta, coverage or distance — only the two absolute values', () => {
    const parsed = parseCanopyCompareResponse(okBody());
    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      'shadeTreePct',
      'standardTreePct',
    ]);
  });

  describe('refuses to produce anything renderable when', () => {
    it('the server did not authorise display', () => {
      expect(parseCanopyCompareResponse(okBody({ display: false }))).toBeNull();
    });

    it('the display flag is missing entirely (absence is not consent)', () => {
      const body = okBody();
      delete (body as Record<string, unknown>).display;
      expect(parseCanopyCompareResponse(body)).toBeNull();
    });

    it('the display flag is merely truthy rather than true', () => {
      expect(parseCanopyCompareResponse(okBody({ display: 1 }))).toBeNull();
      expect(parseCanopyCompareResponse(okBody({ display: 'true' }))).toBeNull();
    });

    // NoRoute and TooLong arrive at HTTP 200 — status cannot separate them
    // from a real answer, so the code has to.
    it('the code is NoRoute', () => {
      expect(parseCanopyCompareResponse(okBody({ code: 'NoRoute' }))).toBeNull();
    });

    it('the code is TooLong', () => {
      expect(parseCanopyCompareResponse(okBody({ code: 'TooLong' }))).toBeNull();
    });

    it('a percentage is missing, non-numeric or not finite', () => {
      expect(parseCanopyCompareResponse(okBody({ shade: {} }))).toBeNull();
      expect(
        parseCanopyCompareResponse(okBody({ safe: { tree_pct: '28.6' } })),
      ).toBeNull();
      expect(
        parseCanopyCompareResponse(okBody({ shade: { tree_pct: Number.NaN } })),
      ).toBeNull();
    });

    // A NULL tree_pct is not hypothetical — see the captured body below.
    // Guarded independently of `display` so a server that ever sends a null
    // alongside consent still renders nothing rather than "null% tree-lined".
    it('a percentage is null', () => {
      expect(
        parseCanopyCompareResponse(okBody({ shade: { tree_pct: null } })),
      ).toBeNull();
      expect(
        parseCanopyCompareResponse(okBody({ safe: { tree_pct: null } })),
      ).toBeNull();
    });

    it('a percentage falls outside 0-100', () => {
      expect(
        parseCanopyCompareResponse(okBody({ shade: { tree_pct: -1 } })),
      ).toBeNull();
      expect(
        parseCanopyCompareResponse(okBody({ safe: { tree_pct: 101 } })),
      ).toBeNull();
    });

    it('a route object is missing or null', () => {
      expect(parseCanopyCompareResponse(okBody({ safe: undefined }))).toBeNull();
      expect(parseCanopyCompareResponse(okBody({ shade: null }))).toBeNull();
    });

    it('the body is not an object at all', () => {
      expect(parseCanopyCompareResponse(null)).toBeNull();
      expect(parseCanopyCompareResponse(undefined)).toBeNull();
      expect(parseCanopyCompareResponse('Ok')).toBeNull();
      expect(parseCanopyCompareResponse(42)).toBeNull();
    });
  });

  // The endpoint reports on both graphs honestly, and the shade graph does
  // not always win. Parsing must not treat that as an error, because the
  // display rule is "show both numbers", never "invert into a negative".
  it('accepts a shade route that scores at or below the standard route', () => {
    const worse = okBody({
      shade: { tree_pct: 12.4 },
      safe: { tree_pct: 30.1 },
    });
    expect(parseCanopyCompareResponse(worse)).toEqual({
      shadeTreePct: 12.4,
      standardTreePct: 30.1,
    });

    const tied = okBody({ shade: { tree_pct: 20 }, safe: { tree_pct: 20 } });
    expect(parseCanopyCompareResponse(tied)).toEqual({
      shadeTreePct: 20,
      standardTreePct: 20,
    });
  });

  it('accepts the degenerate but real ends of the range', () => {
    const none = okBody({ shade: { tree_pct: 0 }, safe: { tree_pct: 0 } });
    expect(parseCanopyCompareResponse(none)).toEqual({
      shadeTreePct: 0,
      standardTreePct: 0,
    });

    const all = okBody({ shade: { tree_pct: 100 }, safe: { tree_pct: 100 } });
    expect(parseCanopyCompareResponse(all)).toEqual({
      shadeTreePct: 100,
      standardTreePct: 100,
    });
  });
});

/*
 * Bodies captured from the live shade server on 2026-09-17 (gen
 * b46v2-armEp2), not hand-written from the spec.
 *
 * Two of them contradict what the spec described, which is the whole reason
 * they are here rather than an invented fixture (error-log #113):
 *
 *  - An unroutable pair does NOT answer `NoRoute`. It answers `code: "Ok"`
 *    with `tree_pct: null` and `display: false`. A reader that checked only
 *    the code would have passed nulls straight through to the screen.
 *  - `TooLong` carries no `display` key at all, so a reader that leaned on
 *    `display` alone and defaulted a missing flag to true would have shown a
 *    comparison for a route the server refused to measure.
 */
describe('real captured responses', () => {
  it('reads a live Ok body (Bucharest, 3.9 km)', () => {
    expect(
      parseCanopyCompareResponse({
        code: 'Ok',
        shade: { tree_pct: 28.7, coverage_pct: 83.2, distance_m: 3938 },
        safe: { tree_pct: 24.4, coverage_pct: 85.7, distance_m: 4236 },
        display: true,
        gen: 'b46v2-armEp2',
      }),
    ).toEqual({ shadeTreePct: 28.7, standardTreePct: 24.4 });
  });

  it('shows nothing for a live unroutable pair (Ok + null pct + display false)', () => {
    expect(
      parseCanopyCompareResponse({
        code: 'Ok',
        shade: { tree_pct: null, coverage_pct: 0.0, distance_m: 0 },
        safe: { tree_pct: null, coverage_pct: 0.0, distance_m: 0 },
        display: false,
        gen: 'b46v2-armEp2',
      }),
    ).toBeNull();
  });

  it('shows nothing for a live TooLong body, which carries no display key', () => {
    expect(parseCanopyCompareResponse({ code: 'TooLong' })).toBeNull();
  });
});

describe('formatTreePct', () => {
  it('drops a trailing .0 so 29.0 reads as 29', () => {
    expect(formatTreePct(29.0)).toBe('29');
    expect(formatTreePct(0)).toBe('0');
    expect(formatTreePct(100)).toBe('100');
  });

  it('keeps one decimal when there is one', () => {
    expect(formatTreePct(28.6)).toBe('28.6');
    expect(formatTreePct(0.5)).toBe('0.5');
  });

  it('rounds to a single decimal', () => {
    expect(formatTreePct(28.64)).toBe('28.6');
    expect(formatTreePct(28.65)).toBe('28.7');
    expect(formatTreePct(28.96)).toBe('29');
  });
});

/*
 * Verdict classification.
 *
 * The cases below are the MEASURED shape of this data (18 probes across five
 * cities, 2026-09-18), not invented ones: the shade route wins on 8, ties
 * exactly on 8, and loses on 2 — so "no gain to report" is the single most
 * common outcome and has to be a first-class state, not an edge case.
 */
describe('describeCanopyComparison', () => {
  const at = (shade: number, standard: number) =>
    describeCanopyComparison({ shadeTreePct: shade, standardTreePct: standard });

  describe('gain', () => {
    it('reports a real win in percentage POINTS', () => {
      // Brasov, measured: 72.5 vs 45.8 -> 26.7 points (relative would be 58%).
      expect(at(72.5, 45.8)).toEqual({ kind: 'gain', pointsMore: 27 });
    });

    it('rounds so the headline and the threshold agree', () => {
      expect(at(11.4, 10)).toEqual({ kind: 'gain', pointsMore: 1 });
      expect(at(11.6, 10)).toEqual({ kind: 'gain', pointsMore: 2 });
    });

    it('never mints a gain below the threshold', () => {
      // Measured: two of eight wins were under a point (+0.3, +0.6). Those are
      // the router's rounding, not a benefit worth a number.
      expect(at(56.1, 55.8).kind).toBe('similar');
      expect(at(32.8, 32.2).kind).toBe('similar');
    });

    it('treats exactly the threshold as a gain', () => {
      expect(at(11, 10)).toEqual({ kind: 'gain', pointsMore: 1 });
    });
  });

  describe('similar', () => {
    it('covers an exact tie — the most common real outcome', () => {
      expect(at(32.9, 32.9)).toEqual({ kind: 'similar' });
    });

    it('covers a small difference in EITHER direction', () => {
      expect(at(54.3, 55.0)).toEqual({ kind: 'similar' }); // measured -0.7
      expect(at(24.1, 24.3)).toEqual({ kind: 'similar' }); // measured -0.2
    });
  });

  describe('no_gain', () => {
    it('refuses to call a real deficit "similar"', () => {
      expect(at(11.2, 30.4)).toEqual({ kind: 'no_gain' });
    });

    it('carries no number at all, so nothing can render as negative', () => {
      const verdict = at(11.2, 30.4);
      expect(Object.keys(verdict)).toEqual(['kind']);
    });
  });

  it('never produces a negative number for any input pair', () => {
    for (let shade = 0; shade <= 100; shade += 2.5) {
      for (let standard = 0; standard <= 100; standard += 2.5) {
        const verdict = at(shade, standard);
        if (verdict.kind === 'gain') {
          expect(verdict.pointsMore).toBeGreaterThan(0);
        }
      }
    }
  });
});
