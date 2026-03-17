import { Image, StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

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
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.borderStrong,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(250, 204, 21, 0.26)',
  },
  fallback: {
    position: 'absolute',
    color: mobileTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    opacity: 0,
  },
});

