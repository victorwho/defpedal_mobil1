/**
 * Design System v1.0 — Theme Provider
 *
 * Provides resolved color tokens via React context.
 * Defaults to dark theme. Forces dark during active navigation (spec rule).
 * Exposes useTheme() hook.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from './tokens/colors';
import { useAppStore } from '../store/appStore';

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
  const appState = useAppStore((s) => s.appState);

  const value = useMemo<ThemeContextValue>(() => {
    // Rule from spec: during active navigation, force dark theme
    // (glare reduction, battery, safety contrast)
    if (appState === 'NAVIGATING') {
      return { mode: 'dark', colors: darkTheme };
    }

    if (forcedMode) {
      return {
        mode: forcedMode,
        colors: forcedMode === 'dark' ? darkTheme : lightTheme,
      };
    }

    // Default to dark if system preference is not available
    const resolvedMode: ThemeMode = systemScheme === 'light' ? 'light' : 'dark';
    return {
      mode: resolvedMode,
      colors: resolvedMode === 'dark' ? darkTheme : lightTheme,
    };
  }, [systemScheme, appState, forcedMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useTheme = (): ThemeContextValue => {
  return useContext(ThemeContext);
};
