import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { darkTheme } from '../../../design-system/tokens/colors';
import { radii } from '../../../design-system/tokens/radii';
import { space } from '../../../design-system/tokens/spacing';
import { fontFamily, textSm } from '../../../design-system/tokens/typography';

const ICON_SIZE = 40;

/**
 * The icon's CENTRE must sit on the map's centre: callers place the hazard,
 * suggestion or start at the camera centre (onCenterChange). It used to sit
 * 40% of the width above the bottom edge, so everything landed about half a
 * screen away from where the pin pointed. The label hangs below, out of flow,
 * so it cannot shift the icon.
 */
export const CrosshairOverlay = React.memo(() => (
  <View style={styles.crosshairOverlay} pointerEvents="none">
    <View style={styles.anchor}>
      <Ionicons name="add-circle-outline" size={ICON_SIZE} color={darkTheme.accent} />
      <View style={styles.labelSlot}>
        <Text style={styles.crosshairLabel}>Move map to position</Text>
      </View>
    </View>
  </View>
));

CrosshairOverlay.displayName = 'CrosshairOverlay';

const styles = StyleSheet.create({
  crosshairOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  anchor: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  labelSlot: {
    position: 'absolute',
    top: ICON_SIZE + space[2],
    left: -150,
    right: -150,
    alignItems: 'center',
  },
  crosshairLabel: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.accent,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.md,
    overflow: 'hidden',
  },
});
