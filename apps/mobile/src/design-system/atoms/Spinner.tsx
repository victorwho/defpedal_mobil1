/**
 * Design System v1.0 — Spinner Atom
 *
 * 3 sizes: 16 | 24 | 32.
 * Default color: accent yellow.
 * Must have accessible label.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';

import { darkTheme } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpinnerProps {
  size?: 16 | 24 | 32;
  color?: string;
  accessibilityLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Spinner: React.FC<SpinnerProps> = ({
  size = 24,
  color = darkTheme.accent,
  accessibilityLabel = 'Loading',
}) => (
  <ActivityIndicator
    size={size <= 24 ? 'small' : 'large'}
    color={color}
    accessibilityLabel={accessibilityLabel}
  />
);
