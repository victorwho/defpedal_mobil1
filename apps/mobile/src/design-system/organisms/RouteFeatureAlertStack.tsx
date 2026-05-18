/**
 * RouteFeatureAlertStack — bottom-right proximity alert column.
 *
 * Reads the active approaching-feature list from
 * `useApproachingRouteFeatures` and renders up to `MAX_VISIBLE_FEATURE_ALERTS`
 * cards. Anything past that count collapses into a "+N more" chip at the
 * bottom of the stack.
 *
 * Fires a single safety-critical haptic the first time each feature appears
 * (tracked across renders by a ref keyed on feature id). The
 * `useHaptics().warning()` token is the right vocabulary here because it's
 * the only token that fires during NAVIGATING.
 *
 * Mounts at the screen level inside `navigation.tsx` so positioning sits
 * absolute over the map — does NOT participate in the bottomCluster's
 * flex layout. Safe-area aware via the parent's insets.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../hooks/useHaptics';
import { useApproachingRouteFeatures } from '../../hooks/useApproachingRouteFeatures';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';
import { RouteFeatureAlert } from './RouteFeatureAlert';

export interface RouteFeatureAlertStackProps {
  /**
   * Extra bottom inset in points. Caller supplies the height of any HUD
   * element below the stack (e.g. `FooterCard`) so the alerts park above
   * it rather than overlapping. Default 180 leaves room for FooterCard +
   * SteepGradeIndicator on typical phones; tablets/small screens may want
   * to tune.
   */
  readonly bottomOffset?: number;
}

export const RouteFeatureAlertStack = ({
  bottomOffset = 180,
}: RouteFeatureAlertStackProps) => {
  const { visible, hiddenCount } = useApproachingRouteFeatures();
  const haptics = useHaptics();

  // Track which feature ids have fired their entry haptic this session.
  // A Set persists across renders without triggering re-renders itself.
  const hapticFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const item of visible) {
      if (hapticFiredRef.current.has(item.feature.id)) continue;
      hapticFiredRef.current.add(item.feature.id);
      if (item.config.haptic) {
        haptics.warning();
      }
    }
    // Prune ids that are no longer visible so they re-fire if they
    // somehow surface again (rare — would require a reroute).
    const visibleIds = new Set(visible.map((i) => i.feature.id));
    for (const id of hapticFiredRef.current) {
      if (!visibleIds.has(id)) {
        hapticFiredRef.current.delete(id);
      }
    }
  }, [visible, haptics]);

  if (visible.length === 0) return null;

  return (
    <View
      style={[styles.stack, { bottom: bottomOffset }]}
      pointerEvents="none"
    >
      {visible.map((item) => (
        <RouteFeatureAlert key={item.feature.id} item={item} />
      ))}
      {hiddenCount > 0 ? (
        <View style={styles.moreChip}>
          <Text style={styles.moreChipText}>{`+${hiddenCount} more`}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    right: space[3],
    gap: space[2],
    alignItems: 'flex-end',
    zIndex: zIndex.sticky,
  },
  moreChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    ...shadows.sm,
  },
  moreChipText: {
    ...textXs,
    color: brandColors.textMuted,
    fontFamily: fontFamily.body.bold,
    fontVariant: ['tabular-nums'],
  },
});
