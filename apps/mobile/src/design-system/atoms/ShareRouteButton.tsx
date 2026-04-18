/**
 * Design System v1.0 — ShareRouteButton Atom
 *
 * Dual variant for the route-share PRD (slice 1):
 *   - `variant="button"` renders a full-width secondary Button with a
 *     share icon + label, suitable for the route-preview footer.
 *   - `variant="icon"` renders a compact IconButton for crowded surfaces
 *     (past-ride cards, saved-route rows — lands in slice 5).
 *
 * Intentionally thin — all it does is compose `Button` / `IconButton`
 * with the share-arrow icon, a sane `accessibilityLabel`, and a stable
 * `testID`. Business logic (API POST + native share sheet) lives in
 * `useShareRoute`; this atom is presentational.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from './Button';
import { IconButton } from './IconButton';
import { useTheme } from '../ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShareRouteButtonVariant = 'button' | 'icon';

export interface ShareRouteButtonProps {
  /** Presentation — full button (default) or compact icon-only. */
  variant?: ShareRouteButtonVariant;
  onPress: () => void;
  disabled?: boolean;
  /** Show a spinner on the button variant while the share flow is in-flight. */
  loading?: boolean;
  /** Override the default accessibility label ("Share this route"). */
  accessibilityLabel?: string;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_LABEL = 'Share this route';

export const ShareRouteButton: React.FC<ShareRouteButtonProps> = ({
  variant = 'button',
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel = DEFAULT_LABEL,
  testID = 'share-route-button',
}) => {
  const { colors } = useTheme();

  if (variant === 'icon') {
    return (
      <IconButton
        icon={
          <Ionicons
            name="share-social-outline"
            size={22}
            color={colors.accent}
            testID={`${testID}-icon`}
          />
        }
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        variant="accent"
        size="md"
        disabled={disabled || loading}
      />
    );
  }

  return (
    <Button
      variant="secondary"
      size="md"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      accessibilityLabel={accessibilityLabel}
      leftIcon={
        <Ionicons
          name="share-social-outline"
          size={18}
          color={colors.textPrimary}
          testID={`${testID}-icon`}
        />
      }
    >
      Share
    </Button>
  );
};
