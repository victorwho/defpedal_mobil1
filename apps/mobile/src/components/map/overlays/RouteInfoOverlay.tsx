import type { Coordinate } from '@defensivepedal/core';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brandColors } from '../../../design-system/tokens/colors';
import { radii } from '../../../design-system/tokens/radii';
import { space } from '../../../design-system/tokens/spacing';
import { fontFamily, textSm, textXs } from '../../../design-system/tokens/typography';
import type { DecodedRoute } from '../types';

type RouteInfoOverlayProps = {
  selectedRoute: DecodedRoute | null;
  routeCount: number;
  followUser: boolean;
  userLocation?: Coordinate | null;
};

export const RouteInfoOverlay = React.memo(({
  selectedRoute,
  routeCount,
  followUser,
  userLocation,
}: RouteInfoOverlayProps) => (
  <View style={styles.overlay}>
    <Text style={styles.overlayTitle}>
      {selectedRoute ? `${selectedRoute.route.id} selected` : 'Preview pending'}
    </Text>
    <Text style={styles.overlaySubtitle}>
      {selectedRoute
        ? `${routeCount} alternative${routeCount === 1 ? '' : 's'} · ${selectedRoute.route.riskSegments.length} risk overlays · ${
            followUser && userLocation ? 'Following rider' : 'Manual camera'
          }`
        : 'Load a route preview to render alternatives and risk segments.'}
    </Text>
  </View>
));

RouteInfoOverlay.displayName = 'RouteInfoOverlay';

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    right: space[3],
    bottom: space[3],
    left: space[3],
    borderRadius: radii['2xl'],
    backgroundColor: 'rgba(11, 16, 32, 0.92)',
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
  },
  overlayTitle: {
    color: brandColors.accent,
    ...textSm,
    fontFamily: fontFamily.heading.extraBold,
  },
  overlaySubtitle: {
    color: brandColors.textSecondary,
    ...textXs,
    lineHeight: 18,
  },
});
