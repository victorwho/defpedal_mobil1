/**
 * Design System v1.0 — Theme Provider
 *
 * Provides resolved color tokens via React context.
 * Defaults to dark theme. Forces dark while the user is actually viewing the
 * map-stage screens (route-preview, navigation) — handlebar-mount glare
 * reduction, battery, and contrast (see docs/design-context.md §1 D1).
 *
 * IMPORTANT: the force-dark gate is on the active pathname, NOT on appState.
 * appState persists across screen transitions: the user can be in ROUTE_PREVIEW
 * state but currently viewing Profile or History via the bottom nav. Gating on
 * appState alone made the user's "Light" theme pick silently ineffective on
 * every screen until they cleared appState back to IDLE — fix landed
 * 2026-05-05 after a tester reported "no screens flip to light".
 *
 * Exposes useTheme() hook.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePathname } from 'expo-router';

import { darkTheme, lightTheme } from './tokens/colors';
import { useAppStore } from '../store/appStore';

// Pathnames that the user can actually be viewing while on a map stage.
// /navigation is the active turn-by-turn screen; /route-preview is the last
// step before tapping Start. Any other path (Profile, History, Community,
// onboarding, etc.) respects the user's theme preference even if appState
// happens to still be ROUTE_PREVIEW or NAVIGATING in the background.
const MAP_STAGE_PATHS = new Set(['/route-preview', '/navigation']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeMode = 'dark' | 'light';

/** Widened type so both dark and light themes satisfy it */
export type ThemeColors = {
  [K in keyof typeof darkTheme]: string;
};

export interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkTheme,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  /** Override the resolved mode (useful for previews / testing) */
  forcedMode?: ThemeMode;
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ forcedMode, children }) => {
  const systemScheme = useColorScheme();
  const pathname = usePathname();
  const themePreference = useAppStore((s) => s.themePreference);
  const onMapStage = MAP_STAGE_PATHS.has(pathname);

  const value = useMemo<ThemeContextValue>(() => {
    // §1 D1 force-dark only fires when the user is actually viewing a map
    // stage. Off the map (Profile, History, Community, onboarding, settings,
    // …) we respect themePreference regardless of background appState.
    if (onMapStage) {
      return { mode: 'dark', colors: darkTheme };
    }

    if (forcedMode) {
      return {
        mode: forcedMode,
        colors: forcedMode === 'dark' ? darkTheme : lightTheme,
      };
    }

    // Resolve based on user preference (default: 'dark')
    let resolvedMode: ThemeMode;
    if (themePreference === 'system') {
      resolvedMode = systemScheme === 'light' ? 'light' : 'dark';
    } else {
      resolvedMode = themePreference ?? 'dark';
    }

    return {
      mode: resolvedMode,
      colors: resolvedMode === 'dark' ? darkTheme : lightTheme,
    };
  }, [systemScheme, onMapStage, forcedMode, themePreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useTheme = (): ThemeContextValue => {
  return useContext(ThemeContext);
};
