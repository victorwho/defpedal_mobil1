import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../design-system';
import { ScreenHeader, type ScreenHeaderVariant } from '../design-system/atoms/ScreenHeader';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';

type ScreenProps = PropsWithChildren<{
  /** Screen title (required) */
  title: string;
  /** Header variant: 'brand-logo' (default), 'back', 'close', 'title-only' */
  headerVariant?: ScreenHeaderVariant;
  /** Eyebrow text above title (brand-logo variant only) */
  eyebrow?: string;
  /** Subtitle below title (brand-logo variant only) */
  subtitle?: string;
  /** Right-side accessory in header (e.g. action button) */
  aside?: ReactNode;
  /** Custom back/close handler (back/close variants only) */
  onBack?: () => void;
  /** Extra bottom padding added to ScrollView content (e.g. to clear a BottomNav). */
  contentBottomPadding?: number;
}>;

export const Screen = ({
  title,
  headerVariant = 'brand-logo',
  eyebrow,
  subtitle,
  aside,
  onBack,
  children,
  contentBottomPadding,
}: ScreenProps) => {
  const { colors, mode } = useTheme();

  const glowOpacity = mode === 'dark' ? 0.55 : 0.15;

  // Determine if header should be inside ScrollView (brand-logo) or fixed (nav variants)
  const isNavHeader = headerVariant === 'back' || headerVariant === 'close' || headerVariant === 'title-only';

  return (
    <SafeAreaView style={[staticStyles.safeArea, { backgroundColor: colors.bgDeep }]}>
      <View style={[staticStyles.canvas, { backgroundColor: colors.bgDeep }]}>
        <View style={[staticStyles.glow, staticStyles.glowTop, { opacity: glowOpacity }]} />
        <View style={[staticStyles.glow, staticStyles.glowBottom, { opacity: glowOpacity }]} />

        {/* Nav-style header (back/close/title-only) sits above scroll content */}
        {isNavHeader ? (
          <ScreenHeader
            variant={headerVariant}
            title={title}
            rightAccessory={aside}
            onBack={onBack}
          />
        ) : null}

        <ScrollView
          contentContainerStyle={[
            staticStyles.content,
            isNavHeader && staticStyles.contentNoTopPadding,
            contentBottomPadding != null && { paddingBottom: contentBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Brand-logo header scrolls with content */}
          {!isNavHeader ? (
            <ScreenHeader
              variant="brand-logo"
              title={title}
              eyebrow={eyebrow}
              subtitle={subtitle}
              rightAccessory={aside}
            />
          ) : null}
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
  contentNoTopPadding: {
    paddingTop: 0,
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
