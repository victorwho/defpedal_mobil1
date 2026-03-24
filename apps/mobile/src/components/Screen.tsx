import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brandColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  text3xl,
  textBase,
  textXs,
} from '../design-system/tokens/typography';
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
    backgroundColor: brandColors.bgDeep,
  },
  canvas: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  content: {
    paddingTop: space[3] + space[0.5],
    padding: space[5],
    paddingBottom: space[10] + space[1],
    gap: space[4] + space[0.5],
  },
  headerShell: {
    borderRadius: radii['2xl'] + space[1],
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    padding: space[4] + space[0.5],
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space[4],
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3] + space[0.5],
  },
  asideWrap: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: brandColors.accent,
  },
  title: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 32,
    color: brandColors.textPrimary,
    letterSpacing: -0.8,
  },
  subtitle: {
    ...textBase,
    color: brandColors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  titleWrap: {
    flex: 1,
    gap: space[1] + space[0.5],
  },
  glow: {
    position: 'absolute',
    borderRadius: radii.full,
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
