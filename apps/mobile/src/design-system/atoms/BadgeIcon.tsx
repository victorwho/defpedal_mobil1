/**
 * Design System — BadgeIcon Atom
 *
 * Renders the shield-shaped badge with icon overlay.
 * States: earned (tier pill), in-progress (progress ring), locked, secret.
 * Sizes: sm (40x46), md (64x74), lg (120x139).
 */
import React, { useMemo } from 'react';
import { View, Text, type ViewStyle, type TextStyle, Platform } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { tierColors, badgeSize, tierPill, type BadgeTier, type BadgeSize } from '../tokens/badgeColors';
import { getBadgeIcon, type BadgeIconDef } from '../tokens/badgeIcons';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { fontFamily } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BadgeIconProps {
  /** Badge definition key — maps to icon + tier */
  badgeKey: string;
  /** Tier family fallback for icon lookup on tiered badges */
  tierFamily?: string | null;
  /** Visual tier (determines border color, glow) */
  tier: BadgeTier | 'locked' | 'secret';
  /** Render size */
  size: BadgeSize;
  /** 0-1 progress for "in progress" state. undefined = earned or locked */
  progress?: number;
  /** Show the accent yellow NEW dot (pulsing) */
  isNew?: boolean;
  /** Whether this badge family has higher tiers (show up-chevron hint) */
  hasHigherTier?: boolean;
}

// ---------------------------------------------------------------------------
// Shield SVG path (normalized to 100x116 viewBox)
// ---------------------------------------------------------------------------

const SHIELD_PATH =
  'M 14 0 H 86 Q 100 0, 100 14 V 72 Q 100 88, 86 96 L 54 114 Q 50 116, 46 114 L 14 96 Q 0 88, 0 72 V 14 Q 0 0, 14 0 Z';

const VIEWBOX_W = 100;
const VIEWBOX_H = 116;

// Roman numeral labels for tier pills
const TIER_NUMERAL: Record<BadgeTier, string> = {
  bronze: 'I',
  silver: 'II',
  gold: 'III',
  platinum: 'IV',
  diamond: 'V',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTierStyle(tier: BadgeTier | 'locked' | 'secret') {
  if (tier === 'locked') {
    return {
      borderColor: brandColors.borderDefault,
      glowColor: undefined,
      iconColor: brandColors.textMuted,
      iconOpacity: 0.5,
      fillColor: brandColors.bgSecondary,
      borderOpacity: 1,
    };
  }
  if (tier === 'secret') {
    return {
      borderColor: brandColors.borderDefault,
      glowColor: undefined,
      iconColor: brandColors.textMuted,
      iconOpacity: 1,
      fillColor: brandColors.bgSecondary,
      borderOpacity: 1,
    };
  }
  const tc = tierColors[tier];
  return {
    borderColor: tc.primary,
    glowColor: tc.glow,
    iconColor: '#FFFFFF',
    iconOpacity: 1,
    fillColor: brandColors.bgPrimary,
    surfaceColor: tc.surface,
    borderOpacity: 1,
  };
}

function renderIconPaths(
  iconDef: BadgeIconDef,
  color: string,
  opacity: number,
  iconAreaSize: number,
) {
  // Scale from 24x24 icon viewBox into the iconArea
  return (
    <Svg
      width={iconAreaSize}
      height={iconAreaSize}
      viewBox="0 0 24 24"
      fill="none"
    >
      {iconDef.paths.map((d, i) => (
        <Path
          key={`p${i}`}
          d={d}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={opacity}
        />
      ))}
      {iconDef.fills?.map((d, i) => (
        <Path
          key={`f${i}`}
          d={d}
          fill={color}
          opacity={opacity}
        />
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BadgeIcon: React.FC<BadgeIconProps> = ({
  badgeKey,
  tierFamily,
  tier,
  size,
  progress,
  isNew = false,
  hasHigherTier = false,
}) => {
  const dims = badgeSize[size];
  const style = getTierStyle(tier);
  const isEarned = tier !== 'locked' && tier !== 'secret' && progress === undefined;
  const isInProgress = progress !== undefined && progress < 1;
  const isSecret = tier === 'secret';
  const showPill = isEarned && size !== 'sm';
  const showProgressRing = isInProgress && size !== 'sm';
  const showChevron = hasHigherTier && size !== 'sm' && !isSecret && tier !== 'locked';

  // Resolve icon
  const iconDef = useMemo(
    () => getBadgeIcon(badgeKey, tierFamily),
    [badgeKey, tierFamily],
  );

  // Container dimensions
  const containerStyle: ViewStyle = {
    width: dims.outer,
    height: dims.height,
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Glow shadow (iOS only, earned badges)
  const glowStyle: ViewStyle | undefined =
    isEarned && style.glowColor
      ? Platform.select({
          ios: {
            shadowColor: style.glowColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
          },
          default: { elevation: 4 },
        })
      : undefined;

  // Border opacity for in-progress state
  const borderOpacity = isInProgress ? 0.4 : style.borderOpacity;

  // Icon opacity for in-progress state
  const iconOpacity = isInProgress ? 0.6 : style.iconOpacity;
  const iconColor = style.iconColor;

  return (
    <View style={[containerStyle, glowStyle]}>
      {/* Shield shape */}
      <Svg width={dims.outer} height={dims.height} viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}>
        <Defs>
          {/* Inner shine gradient (earned only) */}
          {isEarned && style.surfaceColor && (
            <LinearGradient id="innerShine" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={style.surfaceColor} stopOpacity="0.1" />
              <Stop offset="0.5" stopColor={style.surfaceColor} stopOpacity="0" />
            </LinearGradient>
          )}
        </Defs>

        {/* Layer 3: Fill */}
        <Path d={SHIELD_PATH} fill={style.fillColor} />

        {/* Layer 4: Inner shine (earned only) */}
        {isEarned && style.surfaceColor && (
          <Path d={SHIELD_PATH} fill="url(#innerShine)" />
        )}

        {/* Layer 2: Border stroke */}
        <Path
          d={SHIELD_PATH}
          fill="none"
          stroke={style.borderColor}
          strokeWidth={dims.borderWidth * (VIEWBOX_W / dims.outer)}
          opacity={borderOpacity}
          strokeDasharray={isSecret ? '6,4' : undefined}
        />
      </Svg>

      {/* Layer 5: Icon overlay (centered on shield) */}
      <View
        style={{
          position: 'absolute',
          top: (dims.height * 0.42) - (dims.iconArea / 2),
          left: (dims.outer - dims.iconArea) / 2,
          width: dims.iconArea,
          height: dims.iconArea,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSecret && !iconDef ? (
          <Text
            style={{
              fontFamily: fontFamily.heading.bold,
              fontSize: dims.iconArea * 0.6,
              color: brandColors.textMuted,
              textAlign: 'center',
            }}
          >
            ?
          </Text>
        ) : iconDef ? (
          renderIconPaths(iconDef, iconColor, iconOpacity, dims.iconArea)
        ) : null}
      </View>

      {/* Layer 7: Progress ring (in-progress, md/lg) */}
      {showProgressRing && tier !== 'locked' && tier !== 'secret' && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            width: dims.outer + 4,
            height: dims.height + 4,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ProgressRing
            width={dims.outer + 4}
            height={dims.height + 4}
            progress={progress ?? 0}
            tierColor={tierColors[tier].primary}
            strokeWidth={size === 'lg' ? 3 : 2.5}
          />
        </View>
      )}

      {/* Layer 6: Tier pill (earned, md/lg) */}
      {isEarned && size !== 'sm' && (
        <TierPill tier={tier} size={size} outerWidth={dims.outer} />
      )}

      {/* Layer 8: Up-chevron hint (tiered, md/lg, not max tier) */}
      {showChevron && (
        <Text
          style={{
            position: 'absolute',
            top: size === 'lg' ? 4 : 2,
            right: size === 'lg' ? 8 : 4,
            fontFamily: fontFamily.body.medium,
            fontSize: 8,
            color: brandColors.textMuted,
          }}
        >
          ^
        </Text>
      )}

      {/* NEW dot (accent yellow, top-right) */}
      {isNew && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 8,
            height: 8,
            borderRadius: radii.full,
            backgroundColor: brandColors.accent,
          }}
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// TierPill sub-component
// ---------------------------------------------------------------------------

interface TierPillProps {
  tier: BadgeTier;
  size: BadgeSize;
  outerWidth: number;
}

const TierPill: React.FC<TierPillProps> = ({ tier, size, outerWidth }) => {
  const tc = tierColors[tier];
  const pill = size === 'lg' ? tierPill.lg : tierPill.md;
  const pillWidth = pill.fontSize * 2.5 + 8;

  const containerStyle: ViewStyle = {
    position: 'absolute',
    bottom: -(pill.height / 2),
    left: (outerWidth - pillWidth) / 2,
    width: pillWidth,
    height: pill.height,
    borderRadius: radii.full,
    backgroundColor: tc.primary,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const textStyle: TextStyle = {
    fontFamily: fontFamily.mono.semiBold,
    fontSize: pill.fontSize,
    color: tc.pillText,
    textAlign: 'center',
  };

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{TIER_NUMERAL[tier]}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// ProgressRing sub-component — circular arc around the shield perimeter
// ---------------------------------------------------------------------------

interface ProgressRingProps {
  width: number;
  height: number;
  progress: number;
  tierColor: string;
  strokeWidth: number;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  width,
  height,
  progress,
  tierColor,
  strokeWidth,
}) => {
  // Draw a simplified elliptical progress arc around the shield
  const cx = width / 2;
  const cy = height / 2;
  const rx = (width - strokeWidth) / 2;
  const ry = (height - strokeWidth) / 2;

  // Full ellipse circumference approximation
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const dashOffset = circumference * (1 - Math.min(progress, 1));

  return (
    <Svg width={width} height={height}>
      {/* Track */}
      <Circle
        cx={cx}
        cy={cy}
        r={(rx + ry) / 2}
        fill="none"
        stroke={brandColors.borderDefault}
        strokeWidth={strokeWidth}
        opacity={0.2}
      />
      {/* Fill */}
      <Circle
        cx={cx}
        cy={cy}
        r={(rx + ry) / 2}
        fill="none"
        stroke={tierColor}
        strokeWidth={strokeWidth}
        opacity={0.6}
        strokeDasharray={`${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90, ${cx}, ${cy})`}
      />
    </Svg>
  );
};
