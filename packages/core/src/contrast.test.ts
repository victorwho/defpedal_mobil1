import { describe, expect, it } from 'vitest';

import {
  contrast,
  contrastRatio,
  flattenOver,
  parseColor,
  relativeLuminance,
  verdict,
} from './contrast';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('#FACC15')).toEqual({ r: 0xfa, g: 0xcc, b: 0x15, a: 1 });
  });

  it('parses 6-digit hex without leading #', () => {
    expect(parseColor('FACC15')).toEqual({ r: 0xfa, g: 0xcc, b: 0x15, a: 1 });
  });

  it('parses 3-digit hex shorthand', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  });

  it('parses 8-digit hex with alpha', () => {
    const c = parseColor('#FACC1580');
    expect(c.r).toBe(0xfa);
    expect(c.g).toBe(0xcc);
    expect(c.b).toBe(0x15);
    expect(c.a).toBeCloseTo(0x80 / 255, 3);
  });

  it('parses rgb()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgb(0,0,0)')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('parses rgba() with decimal alpha', () => {
    const c = parseColor('rgba(255, 255, 255, 0.5)');
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
  });

  it('clamps out-of-range channels and alpha', () => {
    expect(parseColor('rgb(300, -10, 128)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(parseColor('rgba(0,0,0,2)').a).toBe(1);
    expect(parseColor('rgba(0,0,0,-1)').a).toBe(0);
  });

  it('throws on garbage', () => {
    expect(() => parseColor('not a colour')).toThrow();
    expect(() => parseColor('#GGGGGG')).toThrow();
  });
});

describe('relativeLuminance', () => {
  it('white = 1.0', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 3);
  });

  it('black = 0.0', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 3);
  });

  it('mid-grey is around 0.18', () => {
    // sRGB 119 ~= 18% reflectance per WCAG curve
    const grey = relativeLuminance({ r: 119, g: 119, b: 119, a: 1 });
    expect(grey).toBeGreaterThan(0.15);
    expect(grey).toBeLessThan(0.22);
  });
});

describe('contrastRatio', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };

  it('white vs black = 21:1', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
  });

  it('is order-independent', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(contrastRatio(black, white), 6);
  });

  it('identical colours = 1:1', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 6);
  });

  it('matches known WCAG references for textPrimary on bgPrimary (dark theme)', () => {
    // White text (#FFFFFF) on Defensive Pedal's dark surface (#1F2937) → ~14.7:1
    const fg = parseColor('#FFFFFF');
    const bg = parseColor('#1F2937');
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(16);
  });
});

describe('flattenOver', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };

  it('opaque foreground passes through unchanged', () => {
    const fg = { r: 100, g: 150, b: 200, a: 1 };
    expect(flattenOver(fg, white)).toEqual({ ...fg, a: 1 });
  });

  it('50% white over black blends to mid-grey', () => {
    const fg = { r: 255, g: 255, b: 255, a: 0.5 };
    const flat = flattenOver(fg, black);
    expect(flat).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('fully transparent foreground becomes the background colour', () => {
    const fg = { r: 255, g: 0, b: 0, a: 0 };
    const flat = flattenOver(fg, white);
    expect(flat).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
});

describe('contrast (string convenience)', () => {
  it('white on dark background passes AA body', () => {
    const ratio = contrast('#FFFFFF', '#1F2937');
    expect(ratio).toBeGreaterThan(4.5);
  });

  it('flattens translucent foreground over opaque background', () => {
    // 50% white over black → mid-grey (~5:1 vs black)
    const ratio = contrast('rgba(255,255,255,0.5)', '#000000');
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(7);
  });

  it('rejects translucent backgrounds', () => {
    expect(() => contrast('#FFFFFF', 'rgba(0,0,0,0.5)')).toThrow(/translucent/);
  });
});

describe('verdict', () => {
  it('21:1 passes AAA body', () => {
    expect(verdict(21, 'body', 'AAA')).toMatchObject({ passes: true, level: 'AAA' });
  });

  it('4.5:1 passes AA body but fails AAA body', () => {
    expect(verdict(4.5, 'body', 'AA').passes).toBe(true);
    expect(verdict(4.5, 'body', 'AAA').passes).toBe(false);
  });

  it('3:1 passes AA large but fails AA body', () => {
    expect(verdict(3, 'large', 'AA').passes).toBe(true);
    expect(verdict(3, 'body', 'AA').passes).toBe(false);
  });

  it('2.5:1 fails everything', () => {
    expect(verdict(2.5, 'body', 'AA')).toMatchObject({ passes: false, level: 'fail' });
    expect(verdict(2.5, 'large', 'AA').passes).toBe(false);
  });
});
