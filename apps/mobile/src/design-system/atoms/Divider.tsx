/**
 * Design System v1.0 — Divider Atom
 *
 * 1px line in border-default color.
 * Optional 56px left inset (to clear icon area in lists).
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DividerProps {
  /** Inset from left edge (e.g. 56 to clear a list icon column) */
  inset?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Divider: React.FC<DividerProps> = ({ inset = 0 }) => {
  const { colors } = useTheme();

  const style: ViewStyle = {
    height: 1,
    backgroundColor: colors.borderDefault,
    marginLeft: inset,
  };

  return <View style={style} />;
};
