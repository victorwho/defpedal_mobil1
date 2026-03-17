/**
 * Design System v1.0 — Main Entry Point
 *
 * Usage:
 *   import { useTheme, ThemeProvider } from '../design-system';
 *   import { Button, Badge, TextInput } from '../design-system/atoms';
 *   import { SearchBar, RouteCard, Toast } from '../design-system/molecules';
 *   import { space, radii, shadows } from '../design-system/tokens';
 *   import { fontAssets } from '../design-system/fonts';
 */

export { ThemeProvider, useTheme } from './ThemeContext';
export type { ThemeMode, ThemeColors, ThemeContextValue } from './ThemeContext';
export { fontAssets } from './fonts';

// Atoms
export * from './atoms';

// Molecules
export * from './molecules';

// Organisms
export * from './organisms';

// Hooks
export * from './hooks';
