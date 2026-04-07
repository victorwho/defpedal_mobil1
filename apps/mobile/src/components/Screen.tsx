import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../design-system';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  text3xl,
  textBase,
  textXs,
} from '../design-system/tokens/typography';
import { surfaceTints } from '../design-system/tokens/tints';
import { BrandLogo } from './BrandLogo';

type ScreenProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  aside?: ReactNode;
  /** Extra bottom padding added to ScrollView content (e.g. to clear a BottomNav). */
  contentBottomPadding?: number;
}>;

export const Screen = ({ title, eyebrow, subtitle, aside, children, contentBottomPadding }: ScreenProps) => {
  const { colors, mode } = useTheme();

  const headerBg = mode === 'dark'
    ? surfaceTints.glass          // rgba(17, 24, 39, 0.86)
    : surfaceTints.glassLight;    // rgba(255, 255, 255, 0.85)

  const glowOpacity = mode === 'dark' ? 0.55 : 0.15;

  return (
    <SafeAreaView style={[staticStyles.safeArea, { backgroundColor: colors.bgDeep }]}>
      <View style={[staticStyles.canvas, { backgroundColor: colors.bgDeep }]}>
        <View style={[staticStyles.glow, staticStyles.glowTop, { opacity: glowOpacity }]} />
        <View style={[staticStyles.glow, staticStyles.glowBottom, { opacity: glowOpacity }]} />
        <ScrollView
          contentContainerStyle={[
            staticStyles.content,
            contentBottomPadding != null && { paddingBottom: contentBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[staticStyles.headerShell, { borderColor: colors.borderDefault, backgroundColor: headerBg }]}>
            <View style={staticStyles.headerRow}>
              <View style={staticStyles.brandRow}>
                <BrandLogo />
                <View style={staticStyles.titleWrap}>
                  {eyebrow ? <Text style={[staticStyles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
                  <Text style={[staticStyles.title, { color: colors.textPrimary }]}>{title}</Text>
                  {subtitle ? <Text style={[staticStyles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
                </View>
              </View>
              {aside ? <View style={staticStyles.asideWrap}>{aside}</View> : null}
            </View>
          </View>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const staticStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  canvas: {
    flex: 1,
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
  },
  title: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  subtitle: {
    ...textBase,
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
