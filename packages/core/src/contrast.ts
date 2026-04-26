/**
 * WCAG 2.x contrast utilities.
 *
 * Pure functions — no React Native, no DOM, no theme imports. Used by both
 * the mobile design-system contrast gate and any future tooling that needs
 * to score colour pairs.
 *
 * Implementation follows the WCAG 2.1 luminance formula:
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * Supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` hex strings and `rgb()` /
 * `rgba()` CSS notation. Alpha channels are flattened against an explicit
 * background colour because WCAG defines contrast against an opaque pair —
 * see `flattenOver`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RgbColor {
  /** 0-255 */
  readonly r: number;
  /** 0-255 */
  readonly g: number;
  /** 0-255 */
  readonly b: number;
  /** 0-1; defaults to 1 (opaque) */
  readonly a: number;
}

/** WCAG conformance levels. */
export type WcagLevel = 'AA' | 'AAA';

/** Whether the foreground text counts as "large" per WCAG (≥18pt or ≥14pt bold). */
export type TextSize = 'body' | 'large';

export interface ContrastVerdict {
  readonly ratio: number;
  readonly level: WcagLevel | 'fail';
  readonly required: number;
  readonly passes: boolean;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const HEX_3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_4 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_8 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*(-?[0-9.]+)\s*[,\s]\s*(-?[0-9.]+)\s*[,\s]\s*(-?[0-9.]+)(?:\s*[,/]\s*(-?[0-9.]+%?))?\s*\)$/i;

/**
 * Parse a CSS-style colour string into an `RgbColor`. Throws on unrecognised
 * input — the caller is responsible for handling errors at the test layer
 * (a malformed colour token IS the bug).
 */
export function parseColor(input: string): RgbColor {
  const trimmed = input.trim();

  // 8-digit hex (RGBA)
  const m8 = HEX_8.exec(trimmed);
  if (m8) {
    return {
      r: parseInt(m8[1], 16),
      g: parseInt(m8[2], 16),
      b: parseInt(m8[3], 16),
      a: parseInt(m8[4], 16) / 255,
    };
  }

  // 6-digit hex (RGB)
  const m6 = HEX_6.exec(trimmed);
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
      a: 1,
    };
  }

  // 4-digit hex (RGBA short)
  const m4 = HEX_4.exec(trimmed);
  if (m4) {
    return {
      r: parseInt(m4[1] + m4[1], 16),
      g: parseInt(m4[2] + m4[2], 16),
      b: parseInt(m4[3] + m4[3], 16),
      a: parseInt(m4[4] + m4[4], 16) / 255,
    };
  }

  // 3-digit hex (RGB short)
  const m3 = HEX_3.exec(trimmed);
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
      a: 1,
    };
  }

  // rgb() / rgba()
  const mFn = RGB_FN.exec(trimmed);
  if (mFn) {
    const r = clamp(Number(mFn[1]), 0, 255);
    const g = clamp(Number(mFn[2]), 0, 255);
    const b = clamp(Number(mFn[3]), 0, 255);
    let a = 1;
    if (mFn[4] !== undefined) {
      const raw = mFn[4];
      a = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
      a = clamp(a, 0, 1);
    }
    return { r, g, b, a };
  }

  throw new Error(`parseColor: unrecognised colour string ${JSON.stringify(input)}`);
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// ---------------------------------------------------------------------------
// Alpha flattening
// ---------------------------------------------------------------------------

/**
 * Flatten a (possibly translucent) foreground colour over an opaque background.
 * WCAG contrast is defined for opaque pairs; translucent surfaces (glass cards,
 * tinted overlays) must be flattened first or the score is meaningless.
 *
 * Background's alpha is ignored — it must be opaque. If you have a translucent
 * background, flatten it over its own background first.
 */
export function flattenOver(fg: RgbColor, bg: RgbColor): RgbColor {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

// ---------------------------------------------------------------------------
// Luminance + contrast
// ---------------------------------------------------------------------------

/** sRGB → linear-RGB channel transform per WCAG 2.x. */
function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.x. Range 0 (black) to 1 (white). */
export function relativeLuminance(color: RgbColor): number {
  const r = channelToLinear(color.r);
  const g = channelToLinear(color.g);
  const b = channelToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio between two opaque colours. Range 1 (identical) to 21
 * (black on white). Order-independent — pass foreground/background in any
 * order. Translucent foregrounds should be flattened with `flattenOver` first.
 */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Convenience: parse two colour strings and return the contrast ratio.
 * If `fg` has alpha < 1, it is flattened over `bg` first.
 */
export function contrast(fgInput: string, bgInput: string): number {
  const bg = parseColor(bgInput);
  if (bg.a < 1) {
    throw new Error(
      `contrast: background ${JSON.stringify(bgInput)} is translucent (alpha=${bg.a}). ` +
        'Flatten it over an opaque base first.',
    );
  }
  const fgRaw = parseColor(fgInput);
  const fg = fgRaw.a < 1 ? flattenOver(fgRaw, bg) : fgRaw;
  return contrastRatio(fg, bg);
}

// ---------------------------------------------------------------------------
// WCAG thresholds
// ---------------------------------------------------------------------------

const THRESHOLDS: Record<WcagLevel, Record<TextSize, number>> = {
  AA: { body: 4.5, large: 3 },
  AAA: { body: 7, large: 4.5 },
};

/**
 * Score a contrast ratio against a WCAG threshold and return a verdict.
 * Default expectation: AA-level body text (4.5:1).
 */
export function verdict(
  ratio: number,
  size: TextSize = 'body',
  level: WcagLevel = 'AA',
): ContrastVerdict {
  const required = THRESHOLDS[level][size];
  return {
    ratio,
    required,
    level: ratio >= THRESHOLDS.AAA[size] ? 'AAA' : ratio >= THRESHOLDS.AA[size] ? 'AA' : 'fail',
    passes: ratio >= required,
  };
}
