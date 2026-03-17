import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { brandColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';

type MapStageScreenProps = PropsWithChildren<{
  map: ReactNode;
  topOverlay?: ReactNode;
  rightOverlay?: ReactNode;
  footer?: ReactNode;
  /** When true, renders children inside a bottom sheet. When false (default), children are ignored. */
  useBottomSheet?: boolean;
}>;

export const MapStageScreen = ({
  map,
  topOverlay,
  rightOverlay,
  footer,
  children,
  useBottomSheet = false,
}: MapStageScreenProps) => (
  <View style={styles.root}>
    <View style={StyleSheet.absoluteFill}>{map}</View>
    <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
      {topOverlay ? <View style={styles.topOverlay} pointerEvents="box-none">{topOverlay}</View> : null}
      {rightOverlay ? <View style={styles.rightOverlay}>{rightOverlay}</View> : null}
      <View style={styles.flexSpacer} pointerEvents="box-none" />

      {useBottomSheet ? (
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
      ) : footer ? (
        <View style={styles.bottomFooter} pointerEvents="box-none">
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  safeArea: {
    flex: 1,
  },
  topOverlay: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    gap: space[3],
  },
  rightOverlay: {
    position: 'absolute',
    top: '34%',
    right: space[4],
    zIndex: 3,
    gap: space[3],
  },
  flexSpacer: {
    flex: 1,
  },
  bottomDock: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii['2xl'] + space[2],
    borderTopRightRadius: radii['2xl'] + space[2],
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(11, 16, 32, 0.96)',
    overflow: 'hidden',
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 54,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginTop: space[3],
    marginBottom: space[1] + space[0.5],
  },
  content: {
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3],
    paddingBottom: space[4] + space[0.5],
    gap: space[4],
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3] + space[0.5],
    paddingBottom: space[4] + space[0.5],
    gap: space[2] + space[0.5],
  },
  bottomFooter: {
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    gap: space[2],
  },
});
