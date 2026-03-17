import type { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';
import { BrandLogo } from './BrandLogo';

type ScreenProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  aside?: ReactNode;
}>;

export const Screen = ({ title, eyebrow, subtitle, aside, children }: ScreenProps) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.canvas}>
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerShell}>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <BrandLogo />
              <View style={styles.titleWrap}>
                {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            </View>
            {aside ? <View style={styles.asideWrap}>{aside}</View> : null}
          </View>
        </View>
        {children}
      </ScrollView>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  canvas: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  content: {
    paddingTop: 14,
    padding: 20,
    paddingBottom: 44,
    gap: 18,
  },
  headerShell: {
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    padding: 18,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  asideWrap: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: mobileTheme.colors.brand,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: mobileTheme.colors.textOnDark,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  titleWrap: {
    flex: 1,
    gap: 5,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.55,
  },
  glowTop: {
    top: -90,
    right: -30,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
  },
  glowBottom: {
    left: -60,
    bottom: 40,
    width: 180,
    height: 180,
    backgroundColor: 'rgba(37, 99, 235, 0.14)',
  },
});
