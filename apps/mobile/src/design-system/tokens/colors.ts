/**
 * Design System v1.0 — Color Tokens
 *
 * All colors map directly to the design system spec CSS variables.
 * Safety semantic colors (safe/caution/danger) are universal and never change between themes.
 */

// ---------------------------------------------------------------------------
// Brand Palette (dark theme default)
// ---------------------------------------------------------------------------

export const brandColors = {
  /** Background layers — darkest to lightest */
  bgDeep: '#111827',
  bgPrimary: '#1F2937',
  bgSecondary: '#374151',
  bgTertiary: '#4B5563',

  /** Accent (yellow — brand signature) */
  accent: '#FACC15',
  accentHover: '#EAB308',
  accentText: '#CA8A04',

  /** Text on dark backgrounds */
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#8B9198',
  textInverse: '#111827',

  /** Borders */
  borderDefault: '#374151',
  borderStrong: '#4B5563',
  borderAccent: '#FACC15',
} as const;

// ---------------------------------------------------------------------------
// Safety Semantic Palette — NEVER use decoratively
// ---------------------------------------------------------------------------

export const safetyColors = {
  /** Safe — risk score 0–2 */
  safe: '#22C55E',
  safeTint: '#DCFCE7',
  safeText: '#166534',

  /** Caution — risk score 3–5 */
  caution: '#F59E0B',
  cautionTint: '#FEF3C7',
  cautionText: '#92400E',

  /** Danger — risk score 6–10 */
  danger: '#EF4444',
  dangerTint: '#FEE2E2',
  dangerText: '#991B1B',

  /** Info — neutral navigation cues, non-safety data */
  info: '#3B82F6',
  infoTint: '#DBEAFE',
  infoText: '#1E40AF',
} as const;

// ---------------------------------------------------------------------------
// Dark Theme (default)
// ---------------------------------------------------------------------------

export const darkTheme = {
  ...brandColors,
  ...safetyColors,
} as const;

// ---------------------------------------------------------------------------
// Light Theme
// ---------------------------------------------------------------------------

export const lightTheme = {
  /** Background layers — lightest to darkest */
  bgDeep: '#F9FAFB',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F3F4F6',
  bgTertiary: '#E5E7EB',

  /** Accent — darker for contrast against white */
  accent: '#CA8A04',
  accentHover: '#A16207',
  accentText: '#CA8A04',

  /** Text on light backgrounds */
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  /** Borders */
  borderDefault: '#E5E7EB',
  borderStrong: '#D1D5DB',
  borderAccent: '#CA8A04',

  /** Safety colors are universal — same in both themes */
  ...safetyColors,
} as const;

// ---------------------------------------------------------------------------
// Utility grays (not theme-dependent, for direct use on map/dark overlays)
// ---------------------------------------------------------------------------

export const gray = {
  50: '#F9FAFB',
  100: '#F3F4F6',
  200: '#E5E7EB',
  300: '#D1D5DB',
  400: '#9CA3AF',
  500: '#6B7280',
  600: '#4B5563',
  700: '#374151',
  800: '#1F2937',
  900: '#111827',
} as const;

// ---------------------------------------------------------------------------
// Risk score mapping
// ---------------------------------------------------------------------------

export type RiskLevel = 'safe' | 'caution' | 'danger';

export const riskScoreToLevel = (score: number): RiskLevel => {
  if (score <= 2) return 'safe';
  if (score <= 5) return 'caution';
  return 'danger';
};

export const riskLevelColors = {
  safe: { primary: safetyColors.safe, tint: safetyColors.safeTint, text: safetyColors.safeText },
  caution: {
    primary: safetyColors.caution,
    tint: safetyColors.cautionTint,
    text: safetyColors.cautionText,
  },
  danger: {
    primary: safetyColors.danger,
    tint: safetyColors.dangerTint,
    text: safetyColors.dangerText,
  },
} as const;
