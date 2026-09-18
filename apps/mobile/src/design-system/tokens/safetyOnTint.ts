/**
 * Legible colour for content sitting ON a safety-tinted surface.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * ------------------------------
 * The safety palette carries two colours per tone: a BRIGHT one (`safe`
 * #22C55E) for fills, borders and icons on dark ground, and a DARK one
 * (`safeText` #166534) for text on light ground. Both live in `safetyColors`,
 * which is spread into the dark AND light themes identically — so `colors.safe`
 * is the same value in both, and nothing about the token tells you which of the
 * two you should be using.
 *
 * The route-preview "calmer ride" badge picked the bright one for its title,
 * its icon and its CTA. On the dark theme that is right (5.40:1). On the light
 * theme the same colour sits on a near-white 10%-green tint and scores
 * **2.09:1** — well under the 4.5:1 AA floor for text, and under even the 3:1
 * non-text floor for the icon. The amber warning variant was the same story
 * at 1.99:1. Both shipped that way, because a colour that is correct in the
 * default (dark) theme looks deliberate everywhere.
 *
 * The fix is not a new colour. Both correct values already existed; what was
 * missing was the rule for choosing between them, which is what this is.
 *
 * WHICH SURFACE THIS IS MEASURED AGAINST — THE THING TO GET RIGHT
 * ----------------------------------------------------------------
 * These ratios were first computed against `bgPrimary` and that was WRONG:
 * this screen lives inside `MapStageScreen`'s sheet, which is #0B1020 in dark
 * (darker than bgPrimary #1F2937) and white in light. The error flipped two
 * conclusions — it made the error panel look broken in dark mode when it is
 * fine, and it made `danger`/`info` look unusable when they are not. Measure
 * the surface the content is ACTUALLY drawn on, not a plausible neighbour.
 *
 * The rule generalises past safety tints: it holds for any surface that
 * follows the theme (the opaque `bgSecondary` card, the amber error panel),
 * because what decides the answer is whether the surface is light or dark,
 * not which tint made it.
 *
 * `safetyOnTint.test.ts` recomputes every ratio from the live tokens against
 * the real app surfaces, so swapping a token value back fails the build.
 * Note `danger` and `info` clear the bar in dark by a small margin (~4.6:1) —
 * a palette nudge there will trip the test rather than ship quietly.
 *
 * Precedent: `Button.tsx` already does this by hand for the accent tone
 * (`mode === 'dark' ? darkTheme.accent : colors.accentText`).
 */
import type { ThemeColors, ThemeMode } from '../ThemeContext';

/** Safety tones, all four verified for text on their own tint in both themes. */
export type SafetyTone = 'safe' | 'caution' | 'danger' | 'info';

/**
 * Pick the readable colour for `tone` on its own tinted surface.
 *
 * Use for ANY text or icon drawn on a `safetyTints.*Light` / `*Subtle`
 * background. Do not use for the fill or border itself — those want the bright
 * colour in both themes, which is why they are not routed through here.
 */
export const safetyOnTint = (
  colors: ThemeColors,
  mode: ThemeMode,
  tone: SafetyTone,
): string => {
  if (mode === 'dark') {
    // Bright semantic colour reads against the darkened surface.
    if (tone === 'safe') return colors.safe;
    if (tone === 'caution') return colors.caution;
    if (tone === 'danger') return colors.danger;
    return colors.info;
  }
  // Light theme: the surface is near-white, so text needs the dark variant.
  if (tone === 'safe') return colors.safeText;
  if (tone === 'caution') return colors.cautionText;
  if (tone === 'danger') return colors.dangerText;
  return colors.infoText;
};
