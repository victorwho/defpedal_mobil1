/**
 * Design System — BadgeVisual Atom
 *
 * Drop-in replacement for BadgeIcon at call sites. Decides between two
 * visual treatments based on badge state and asset availability:
 *
 *   - Holographic sticker (HoloSticker) — when the badge is EARNED and a
 *     holo PNG exists in the manifest. Provides 3D tilt, sheen, glare,
 *     halo, rim, and edge thickness.
 *   - SVG shield (BadgeIcon) — for everything else: locked, secret,
 *     in-progress, or any earned badge whose holo art hasn't been added
 *     to the manifest yet. Preserves the existing visual system as a
 *     graceful fallback during the rollout.
 *
 * Sizes map BadgeSize → HoloSticker pixel size:
 *   sm  → 40 px (static thumbnail; tilt + glare disabled)
 *   md  → 64 px
 *   lg  → 120 px
 *
 * Props mirror BadgeIcon exactly so this can be swapped in at every call site
 * without other code changes.
 */
import React from 'react';

import {
  BadgeIcon,
  type BadgeIconProps,
} from './BadgeIcon';
import { HoloSticker } from './HoloSticker';
import { hasHoloBadgeAsset } from '../tokens/holoBadges';
import type { BadgeSize, BadgeTier } from '../tokens/badgeColors';

/**
 * Extensions over BadgeIconProps:
 *   - `focused`: forwarded to HoloSticker so the modal hero can claim
 *     exclusive tilt while the grid behind freezes.
 *   - `onTap`: forwarded to HoloSticker so a tap inside the sticker
 *     reaches the caller even though HoloSticker's PanResponder claims
 *     the gesture from any parent Pressable.
 * Both are ignored on the SVG fallback path.
 */
export type BadgeVisualProps = BadgeIconProps & {
  focused?: boolean;
  onTap?: () => void;
};

const HOLO_SIZE_BY_BADGE_SIZE: Record<BadgeSize, number> = {
  sm: 40,
  md: 64,
  lg: 120,
};

export const BadgeVisual: React.FC<BadgeVisualProps> = (props) => {
  const { badgeKey, tierFamily, tier, size, progress, isNew, hasHigherTier, focused, onTap } = props;

  // Holo treatment only for EARNED, non-progress, non-secret, non-locked states.
  const isEarned =
    tier !== 'locked' &&
    tier !== 'secret' &&
    (progress === undefined || progress >= 1);

  const useHolo = isEarned && hasHoloBadgeAsset(badgeKey, tierFamily ?? undefined);

  if (useHolo) {
    return (
      <HoloSticker
        badgeKey={badgeKey}
        tierFamily={tierFamily ?? undefined}
        tier={tier as BadgeTier}
        size={HOLO_SIZE_BY_BADGE_SIZE[size]}
        // sm is a static thumbnail — tilt/glare would be twitchy at 40px.
        interactive={size !== 'sm'}
        focused={focused}
        onTap={onTap}
        accessibilityLabel={`${badgeKey} badge`}
      />
    );
  }

  return (
    <BadgeIcon
      badgeKey={badgeKey}
      tierFamily={tierFamily}
      tier={tier}
      size={size}
      progress={progress}
      isNew={isNew}
      hasHigherTier={hasHigherTier}
    />
  );
};
