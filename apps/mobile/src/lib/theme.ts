/**
 * @deprecated Use design-system tokens instead:
 *   import { useTheme } from '../design-system';
 *   import { space, radii, shadows } from '../design-system/tokens';
 *
 * This file is a backward-compatibility bridge. Existing components that import
 * mobileTheme will continue to work until they are migrated to the design system.
 */
import { darkTheme } from '../design-system/tokens/colors';

export const mobileTheme = {
  colors: {
    // Map old keys -> new design system tokens
    background: darkTheme.bgDeep,
    backgroundElevated: darkTheme.bgPrimary,
    backgroundPanel: darkTheme.bgSecondary,
    backgroundPanelSoft: darkTheme.bgTertiary,
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    surfaceAccent: darkTheme.textInverse,
    surfaceWarning: darkTheme.cautionTint,
    border: `rgba(148, 163, 184, 0.24)`,
    borderStrong: `rgba(250, 204, 21, 0.28)`,
    textPrimary: darkTheme.textInverse,
    textSecondary: darkTheme.textSecondary,
    textMuted: darkTheme.textMuted,
    textOnDark: darkTheme.textPrimary,
    textOnDarkMuted: '#cbd5e1',
    textWarning: darkTheme.cautionText,
    brand: darkTheme.accent,
    brandStrong: darkTheme.accentHover,
    accent: darkTheme.info,
    accentSoft: darkTheme.infoTint,
    success: darkTheme.safe,
    successSoft: darkTheme.safeTint,
    danger: darkTheme.danger,
  },
  // LEGACY radii — kept at original values so existing screens don't visually break.
  // New components should import { radii } from '../design-system/tokens/radii' instead.
  radii: {
    sm: 14,
    md: 20,
    lg: 28,
    pill: 999,
  },
} as const;
