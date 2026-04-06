import { Image, StyleSheet, Text, View } from 'react-native';

import { brandColors, gray } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { fontFamily, textXs } from '../design-system/tokens/typography';

type BrandLogoProps = {
  size?: number;
};

const LOGO_URI = 'https://i.ibb.co/RkpnNLM0/notext-yellow.png';

export const BrandLogo = ({ size = 52 }: BrandLogoProps) => (
  <View
    style={[
      styles.shell,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
      },
    ]}
  >
    <Image
      source={{ uri: LOGO_URI }}
      style={{
        width: size * 0.72,
        height: size * 0.72,
      }}
      resizeMode="contain"
      accessibilityLabel="Defensive Pedal logo"
    />
    <View pointerEvents="none" style={styles.ring} />
    <Text style={styles.fallback}>DP</Text>
  </View>
);

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: gray[50],
    borderWidth: 1,
    borderColor: brandColors.borderStrong,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.full,
    borderWidth: 3,
    borderColor: 'rgba(250, 204, 21, 0.26)',
  },
  fallback: {
    position: 'absolute',
    color: brandColors.textInverse,
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    letterSpacing: 0.8,
    opacity: 0,
  },
});

