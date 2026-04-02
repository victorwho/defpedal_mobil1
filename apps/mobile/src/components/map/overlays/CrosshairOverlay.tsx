import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { darkTheme } from '../../../design-system/tokens/colors';
import { radii } from '../../../design-system/tokens/radii';
import { space } from '../../../design-system/tokens/spacing';
import { fontFamily, textSm } from '../../../design-system/tokens/typography';

export const CrosshairOverlay = React.memo(() => (
  <View style={styles.crosshairOverlay} pointerEvents="none">
    <Ionicons name="add-circle-outline" size={40} color={darkTheme.accent} />
    <Text style={styles.crosshairLabel}>Tap map to place hazard</Text>
  </View>
));

CrosshairOverlay.displayName = 'CrosshairOverlay';

const styles = StyleSheet.create({
  crosshairOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[2],
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
