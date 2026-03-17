import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

type MapStageScreenProps = PropsWithChildren<{
  map: ReactNode;
  topOverlay?: ReactNode;
  rightOverlay?: ReactNode;
  footer?: ReactNode;
}>;

export const MapStageScreen = ({
  map,
  topOverlay,
  rightOverlay,
  footer,
  children,
}: MapStageScreenProps) => (
  <View style={styles.root}>
    <View style={StyleSheet.absoluteFill}>{map}</View>
    <SafeAreaView style={styles.safeArea}>
      {topOverlay ? <View style={styles.topOverlay}>{topOverlay}</View> : null}
      {rightOverlay ? <View style={styles.rightOverlay}>{rightOverlay}</View> : null}
      <View style={styles.flexSpacer} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomDock}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  safeArea: {
    flex: 1,
  },
  topOverlay: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  rightOverlay: {
    position: 'absolute',
    top: '34%',
    right: 16,
    zIndex: 3,
  },
  flexSpacer: {
    flex: 1,
  },
  bottomDock: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(11, 16, 32, 0.96)',
    overflow: 'hidden',
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginTop: 12,
    marginBottom: 6,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 16,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
  },
});
