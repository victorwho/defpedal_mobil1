/**
 * Design System v1.0 — Mascot (Pedal)
 *
 * Renders the brand mascot in one of the supported poses.
 * Decorative-by-default for screen readers — use `accessibilityLabel` to opt in
 * when the mascot is the content (e.g. empty states, 404).
 *
 * Safety quarantine:
 *   - returns null when the user has opted out (Profile > Display)
 *   - returns null while appState === 'NAVIGATING' so the mascot never appears
 *     over the navigation HUD or hazard surfaces.
 *
 * Layout:
 *   - width derived from the chosen size; height derived from the pose's
 *     aspectRatio. Explicit dimensions reserve space and prevent layout shift.
 *
 * Usage:
 *   <Mascot pose="trapeze" size="lg" />
 *   <Mascot pose="binoculars" size="md" accessibilityLabel="No badges yet" />
 */
import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';

import { useAppStore } from '../../store/appStore';
import {
  mascotPoses,
  mascotSizes,
  type MascotPose,
  type MascotSize,
} from '../tokens/mascotPoses';

interface MascotProps {
  pose: MascotPose;
  /** Standard sizes mapped to px width. Default: 'md' (120px). */
  size?: MascotSize;
  /**
   * If provided, the mascot becomes a meaningful element for screen readers.
   * Omit (default) to keep it decorative.
   */
  accessibilityLabel?: string;
  /** Override the width derived from `size`. Use sparingly. */
  width?: number;
  style?: StyleProp<ImageStyle>;
  testID?: string;
}

export function Mascot({
  pose,
  size = 'md',
  accessibilityLabel,
  width,
  style,
  testID,
}: MascotProps): React.ReactElement | null {
  const showMascot = useAppStore((s) => s.showMascot);
  const appState = useAppStore((s) => s.appState);

  // Opt-out gate
  if (!showMascot) return null;
  // Safety quarantine — never over the nav HUD
  if (appState === 'NAVIGATING') return null;

  const asset = mascotPoses[pose];
  const resolvedWidth = width ?? mascotSizes[size];
  const resolvedHeight = Math.round(resolvedWidth / asset.aspectRatio);

  const isDecorative = !accessibilityLabel;

  return (
    <Image
      source={asset.source}
      style={[{ width: resolvedWidth, height: resolvedHeight }, style]}
      resizeMode="contain"
      accessible={!isDecorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'yes'}
      testID={testID}
    />
  );
}

export type { MascotProps };
