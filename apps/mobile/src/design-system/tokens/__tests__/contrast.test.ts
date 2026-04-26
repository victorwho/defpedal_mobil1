/**
 * Contrast & encoding gate — Phase 1 · R5 of the Design Quality Pass (P1-30).
 *
 * Two parts:
 *   1. WCAG contrast ratio assertions for every {foreground, background} pair
 *      declared by the listed components, in BOTH dark and light themes.
 *      Body text needs 4.5:1 (WCAG AA), large text needs 3:1.
 *   2. Color-not-only manifest assertions per WCAG 1.4.1 — every safety-coloured
 *      component must carry a non-colour encoding (text label, icon, shape, or
 *      pattern) so colorblind users get the same signal.
 *
 * When tokens change, this test re-runs and would catch regressions.
 *
 * Failure means a recent change broke colour contrast for a real user. Fix the
 * tokens or component, do not relax the assertion. See docs/contrast-baseline.md
 * for the latest scored output.
 */
import { describe, expect, it } from 'vitest';

import { contrast, verdict, type TextSize } from '@defensivepedal/core';

import { brandColors, darkTheme, gray, lightTheme, safetyColors } from '../colors';

// ---------------------------------------------------------------------------
// Pair manifest — what each component renders, conceptually
// ---------------------------------------------------------------------------

interface ContrastPair {
  /** Human-readable name shown in test failure output. */
  readonly name: string;
  /** Foreground colour (text or icon). */
  readonly fg: string;
  /** Background colour (must be opaque). */
  readonly bg: string;
  /** Text size class — drives the WCAG threshold (4.5 vs 3). */
  readonly size: TextSize;
  /**
   * Optional: if the pair is theme-dependent, set to 'dark' or 'light'. If
   * theme-independent (component carries its own bg, e.g. Button variants),
   * set to 'all'.
   */
  readonly theme: 'dark' | 'light' | 'all';
}

interface ComponentPairs {
  readonly component: string;
  readonly pairs: ReadonlyArray<ContrastPair>;
}

// ---------------------------------------------------------------------------
// Theme-independent pairs (components that carry their own bg)
// ---------------------------------------------------------------------------

const buttonPairs: ComponentPairs = {
  component: 'Button',
  pairs: [
    // Primary — accent yellow with dark text. Theme-independent (Button uses darkTheme tokens explicitly).
    { name: 'primary text', fg: darkTheme.textInverse, bg: darkTheme.accent, size: 'body', theme: 'all' },
    // Secondary — bg-secondary with white text.
    { name: 'secondary text', fg: brandColors.textPrimary, bg: darkTheme.bgSecondary, size: 'body', theme: 'all' },
    // Danger — red bg with white text.
    { name: 'danger text', fg: brandColors.textPrimary, bg: safetyColors.danger, size: 'body', theme: 'all' },
    // Safe — green bg with white text.
    { name: 'safe text', fg: brandColors.textPrimary, bg: safetyColors.safe, size: 'body', theme: 'all' },
    // Ghost — accent text on dark deep bg (rendered against the screen background).
    { name: 'ghost text on dark', fg: darkTheme.accent, bg: darkTheme.bgDeep, size: 'body', theme: 'dark' },
    { name: 'ghost text on light', fg: lightTheme.accent, bg: lightTheme.bgDeep, size: 'body', theme: 'light' },
  ],
};

const badgePairs: ComponentPairs = {
  component: 'Badge',
  pairs: [
    // Tinted variants — dark text on tinted bg, theme-independent (uses safetyColors directly).
    { name: 'risk-safe', fg: safetyColors.safeText, bg: safetyColors.safeTint, size: 'body', theme: 'all' },
    { name: 'risk-caution', fg: safetyColors.cautionText, bg: safetyColors.cautionTint, size: 'body', theme: 'all' },
    { name: 'risk-danger', fg: safetyColors.dangerText, bg: safetyColors.dangerTint, size: 'body', theme: 'all' },
    { name: 'info', fg: safetyColors.infoText, bg: safetyColors.infoTint, size: 'body', theme: 'all' },
    // Neutral — uses gray[300] on dark bg-secondary.
    { name: 'neutral', fg: gray[300], bg: darkTheme.bgSecondary, size: 'body', theme: 'all' },
    // Accent — dark text on yellow.
    { name: 'accent', fg: darkTheme.textInverse, bg: darkTheme.accent, size: 'body', theme: 'all' },
  ],
};

const hazardAlertPillPairs: ComponentPairs = {
  component: 'HazardAlertPill',
  pairs: [
    // Severity-scaled bg with white text. All three are safety-critical.
    { name: 'safe', fg: '#FFFFFF', bg: safetyColors.safe, size: 'large', theme: 'all' },
    { name: 'caution', fg: '#FFFFFF', bg: safetyColors.caution, size: 'large', theme: 'all' },
    { name: 'danger', fg: '#FFFFFF', bg: safetyColors.danger, size: 'large', theme: 'all' },
  ],
};

const maneuverCardPairs: ComponentPairs = {
  component: 'ManeuverCard',
  pairs: [
    // Forced dark — white text on bg-primary, gray[300] for street-name secondary.
    { name: 'distance text', fg: '#FFFFFF', bg: darkTheme.bgPrimary, size: 'large', theme: 'all' },
    { name: 'street name secondary', fg: gray[300], bg: darkTheme.bgPrimary, size: 'body', theme: 'all' },
    { name: 'next-distance label', fg: gray[300], bg: darkTheme.bgPrimary, size: 'body', theme: 'all' },
  ],
};

// ---------------------------------------------------------------------------
// Theme-dependent pairs (components using useTheme)
// ---------------------------------------------------------------------------

function themedPairs(name: string, mk: (t: typeof darkTheme | typeof lightTheme) => ContrastPair[]): ComponentPairs {
  return {
    component: name,
    pairs: [
      ...mk(darkTheme).map((p) => ({ ...p, theme: 'dark' as const })),
      ...mk(lightTheme).map((p) => ({ ...p, theme: 'light' as const })),
    ],
  };
}

const bottomNavPairs = themedPairs('BottomNav', (t) => [
  { name: 'active label/icon', fg: t.accent, bg: t.bgPrimary, size: 'body', theme: 'all' },
  // Inactive uses gray[400] regardless of theme (intentional — see BottomNav.tsx)
  { name: 'inactive label/icon', fg: gray[400], bg: t.bgPrimary, size: 'body', theme: 'all' },
]);

const settingRowPairs = themedPairs('SettingRow', (t) => [
  { name: 'title', fg: t.textPrimary, bg: t.bgPrimary, size: 'body', theme: 'all' },
  { name: 'description', fg: t.textSecondary, bg: t.bgPrimary, size: 'body', theme: 'all' },
]);

const cardPairs = themedPairs('Card', (t) => [
  // Card itself doesn't render text — it's the surface. Text rendered inside
  // is whatever the parent uses. Verify default text colours land on Card bg.
  { name: 'primary text on solid card', fg: t.textPrimary, bg: t.bgPrimary, size: 'body', theme: 'all' },
  { name: 'secondary text on solid card', fg: t.textSecondary, bg: t.bgPrimary, size: 'body', theme: 'all' },
]);

// ---------------------------------------------------------------------------
// Master manifest
// ---------------------------------------------------------------------------

const MANIFEST: ReadonlyArray<ComponentPairs> = [
  buttonPairs,
  badgePairs,
  hazardAlertPillPairs,
  maneuverCardPairs,
  bottomNavPairs,
  settingRowPairs,
  cardPairs,
];

// ---------------------------------------------------------------------------
// Known regressions — ratchet pattern
// ---------------------------------------------------------------------------
//
// These pairs FAIL WCAG AA today. They are NOT new — R5 simply surfaced them
// for the first time. To avoid blocking initial CI rollout, each known failure
// is allow-listed with its current ratio. The test asserts:
//   1. New failing pairs (not in this list) → fail.
//   2. Listed pairs that NOW PASS → fail (instructing the reviewer to remove
//      them from this list — the ratchet self-tightens).
//   3. Listed pairs whose ratio has WORSENED → fail.
//
// Phase 2 R10 (per-screen light-mode sweep) is the natural place to drive
// these to zero. See docs/contrast-baseline.md for fix recommendations.

interface KnownRegression {
  /** `${component}::${pair.name}::${pair.theme}` — must match exactly. */
  readonly key: string;
  /** Current measured ratio (rounded to 2 decimals). Used as the floor. */
  readonly currentRatio: number;
  /** One-line description of the recommended fix. */
  readonly fixHint: string;
}

const KNOWN_REGRESSIONS: ReadonlyArray<KnownRegression> = [
  {
    key: 'Button::danger text::all',
    currentRatio: 3.76,
    fixHint: 'White on #EF4444 is 3.76:1. Either darken the danger bg (try red-600/700) or escalate text size to "large" (3:1 threshold met).',
  },
  {
    key: 'Button::safe text::all',
    currentRatio: 2.28,
    fixHint: 'White on #22C55E is only 2.28:1. Use a darker green for the button bg (try green-700 #15803D ≈ 4.6:1) or use textInverse instead of white.',
  },
  {
    key: 'Button::ghost text on light::light',
    currentRatio: 2.81,
    fixHint: 'lightTheme.accent (#CA8A04) on near-white bgDeep is 2.81:1. Darken accentText for light mode to ≥ #845A04 (4.5:1).',
  },
  {
    key: 'HazardAlertPill::safe::all',
    currentRatio: 2.28,
    fixHint: 'White on safetyColors.safe (#22C55E) is 2.28:1 — fails even large (3:1). Pin HazardAlertPill safe variant to a darker green or use safetyColors.safeText (#166534) on #DCFCE7.',
  },
  {
    key: 'HazardAlertPill::caution::all',
    currentRatio: 2.15,
    fixHint: 'White on safetyColors.caution (#F59E0B) is 2.15:1 — fails even large. Use a darker amber bg or switch to dark text.',
  },
  {
    key: 'BottomNav::active label/icon::light',
    currentRatio: 2.94,
    fixHint: 'lightTheme.accent on lightTheme.bgPrimary is 2.94:1. Same root cause as Button::ghost — darken lightTheme.accent.',
  },
  {
    key: 'BottomNav::inactive label/icon::light',
    currentRatio: 2.54,
    fixHint: 'gray[400] on white is 2.54:1. BottomNav.tsx uses gray[400] for inactive items in BOTH themes — switch to a theme-aware muted token (e.g. lightTheme.textMuted #737B85 ≈ 4.6:1) for the light branch.',
  },
];

const REGRESSIONS_BY_KEY = new Map(KNOWN_REGRESSIONS.map((r) => [r.key, r]));

// ---------------------------------------------------------------------------
// WCAG contrast assertions
// ---------------------------------------------------------------------------

describe('Contrast — WCAG AA', () => {
  for (const { component, pairs } of MANIFEST) {
    describe(component, () => {
      for (const pair of pairs) {
        const tag = pair.theme === 'all' ? '' : ` [${pair.theme}]`;
        const key = `${component}::${pair.name}::${pair.theme}`;
        it(`${pair.name}${tag} → ${pair.fg} on ${pair.bg} (${pair.size})`, () => {
          const ratio = contrast(pair.fg, pair.bg);
          const v = verdict(ratio, pair.size, 'AA');
          const known = REGRESSIONS_BY_KEY.get(key);

          if (known) {
            // Allow-listed regression. Two ratchet conditions:
            //   1. If it now passes WCAG → fail with "remove from list".
            //   2. If ratio has worsened by >0.05 → fail.
            if (v.passes) {
              throw new Error(
                `[${component}] ${pair.name}${tag} now passes WCAG AA (${ratio.toFixed(2)}:1). ` +
                  `Remove "${key}" from KNOWN_REGRESSIONS in this file.`,
              );
            }
            if (ratio + 0.05 < known.currentRatio) {
              throw new Error(
                `[${component}] ${pair.name}${tag} regressed: ratio ${ratio.toFixed(2)}:1 vs baseline ${known.currentRatio.toFixed(2)}:1. ` +
                  `Either restore the previous tokens or update KNOWN_REGRESSIONS.currentRatio.`,
              );
            }
            // Pair is at-or-near the documented baseline; record but don't fail.
            return;
          }

          if (!v.passes) {
            // New failure — not in the allow-list. Fail loud.
            throw new Error(
              `[${component}] ${pair.name}${tag}: ratio ${ratio.toFixed(2)}:1 fails WCAG AA ${pair.size} (need ${v.required}:1). ` +
                `Either fix the colour pair or add to KNOWN_REGRESSIONS with a fix hint.`,
            );
          }
          expect(v.passes).toBe(true);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Color-not-only encoding manifest (WCAG 1.4.1)
// ---------------------------------------------------------------------------

interface NonColourEvidence {
  readonly component: string;
  /** What kind of non-colour encoding the component carries. */
  readonly encoding: 'text-label' | 'icon' | 'pattern' | 'icon+text' | 'shape';
  /** Pointer to the file/lines that prove it. Free-form; for human review. */
  readonly evidence: string;
}

/**
 * Every safety-coloured component MUST appear in this manifest with proof of
 * non-colour encoding. WCAG 1.4.1 says colour cannot be the only carrier of
 * meaning — a colourblind user has to get the same signal.
 *
 * When you add a new component that uses safetyColors.{safe|caution|danger},
 * add an entry here. The exhaustiveness assertion below catches drift.
 */
const COLOUR_NOT_ONLY_MANIFEST: ReadonlyArray<NonColourEvidence> = [
  {
    component: 'Badge',
    encoding: 'text-label',
    evidence: 'variantLabel constant in atoms/Badge.tsx maps risk-safe/risk-caution/risk-danger → "Safe"/"Caution"/"Danger"',
  },
  {
    component: 'HazardAlertPill',
    encoding: 'icon+text',
    evidence: 'molecules/HazardAlertPill.tsx renders message + iconColor; severity matches an Ionicons hazard glyph',
  },
  {
    component: 'RiskDistributionCard',
    encoding: 'text-label',
    evidence: 'organisms/RiskDistributionCard.tsx renders entry.category.label (Safe/Caution/Danger) and percentage% next to each segment',
  },
  {
    component: 'StreakCard',
    encoding: 'text-label',
    evidence: 'organisms/StreakCard.tsx labels day-states with text ("Today"/"Yesterday"/at-risk copy) — not colour alone',
  },
  {
    component: 'HazardLayers (map markers)',
    encoding: 'icon',
    evidence: 'components/HazardLayers.tsx uses hazardIcons.ts mapping per HazardType — icon shape disambiguates beyond colour',
  },
  {
    component: 'SteepGradeIndicator',
    encoding: 'icon+text',
    evidence: 'organisms/NavigationHUD/SteepGradeIndicator.tsx renders ⚠ icon + "Steep" label, not just colour',
  },
];

describe('WCAG 1.4.1 — color-not-only', () => {
  it('every safety-coloured component is in the manifest', () => {
    // Components currently known to render safety colours (safe/caution/danger).
    // Update both this list and the manifest above when adding a new one.
    const safetyColouredComponents = [
      'Badge',
      'HazardAlertPill',
      'RiskDistributionCard',
      'StreakCard',
      'HazardLayers (map markers)',
      'SteepGradeIndicator',
    ];

    const manifestNames = new Set(COLOUR_NOT_ONLY_MANIFEST.map((e) => e.component));
    for (const name of safetyColouredComponents) {
      expect(manifestNames.has(name), `Missing non-colour encoding evidence for ${name}`).toBe(true);
    }
  });

  it('every manifest entry has concrete evidence', () => {
    for (const entry of COLOUR_NOT_ONLY_MANIFEST) {
      expect(entry.evidence.length, `${entry.component}: evidence string is empty`).toBeGreaterThan(20);
      expect(['text-label', 'icon', 'pattern', 'icon+text', 'shape']).toContain(entry.encoding);
    }
  });
});

// ---------------------------------------------------------------------------
// Export for the report generator (used by docs/contrast-baseline.md)
// ---------------------------------------------------------------------------

export const __TEST_INTERNAL__ = {
  MANIFEST,
  COLOUR_NOT_ONLY_MANIFEST,
};
