import type { PropsWithChildren, ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLLAPSED_HEIGHT = 48; // just handle + peek
const EXPANDED_RATIO = 0.65; // 65% of screen
const EXPANDED_HEIGHT = SCREEN_HEIGHT * EXPANDED_RATIO;
const SNAP_THRESHOLD = 80; // drag distance to trigger snap

type MapStageScreenProps = PropsWithChildren<{
  map: ReactNode;
  topOverlay?: ReactNode;
  rightOverlay?: ReactNode;
  footer?: ReactNode;
  /** When true, renders children inside a bottom sheet. When false (default), children are ignored. */
  useBottomSheet?: boolean;
}>;

const CollapsibleSheet = ({
  children,
  footer,
  bottomInset,
}: {
  children: ReactNode;
  footer?: ReactNode;
  bottomInset: number;
}) => {
  const [expanded, setExpanded] = useState(true);
  const effectiveExpanded = EXPANDED_HEIGHT - bottomInset;
  const effectiveCollapsed = COLLAPSED_HEIGHT;
  const sheetHeight = useRef(new Animated.Value(effectiveExpanded)).current;
  const expandedRef = useRef(true);

  const snapTo = (expand: boolean) => {
    expandedRef.current = expand;
    setExpanded(expand);
    Animated.spring(sheetHeight, {
      toValue: expand ? effectiveExpanded : effectiveCollapsed,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderMove: (_, gesture) => {
        const startHeight = expandedRef.current ? effectiveExpanded : effectiveCollapsed;
        const newHeight = Math.max(
          effectiveCollapsed,
          Math.min(effectiveExpanded, startHeight - gesture.dy),
        );
        sheetHeight.setValue(newHeight);
      },
      onPanResponderRelease: (_, gesture) => {
        // Simple: drag down > threshold = collapse, drag up > threshold = expand
        if (gesture.dy > SNAP_THRESHOLD) {
          snapTo(false);
        } else if (gesture.dy < -SNAP_THRESHOLD) {
          snapTo(true);
        } else {
          // Snap back to current state
          snapTo(expandedRef.current);
        }
      },
    }),
  ).current;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.bottomDock}
    >
      <Animated.View style={[styles.sheet, { maxHeight: sheetHeight }]} {...panResponder.panHandlers}>
        <Pressable onPress={() => snapTo(!expandedRef.current)} style={styles.handleTouchArea}>
          <View style={styles.handle} />
        </Pressable>
        {expanded ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : null}
      </Animated.View>
      {footer ? (
        <View style={[styles.fixedFooter, { paddingBottom: bottomInset + space[2] }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

export const MapStageScreen = ({
  map,
  topOverlay,
  rightOverlay,
  footer,
  children,
  useBottomSheet = false,
}: MapStageScreenProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>{map}</View>
      <View style={[styles.safeArea, { paddingTop: insets.top }]} pointerEvents="box-none">
        {topOverlay ? <View style={styles.topOverlay} pointerEvents="box-none">{topOverlay}</View> : null}
        {rightOverlay ? <View style={styles.rightOverlay}>{rightOverlay}</View> : null}
        <View style={styles.flexSpacer} pointerEvents="box-none" />

        {useBottomSheet ? (
          <CollapsibleSheet footer={footer} bottomInset={insets.bottom}>{children}</CollapsibleSheet>
        ) : footer ? (
          <View style={[styles.bottomFooter, { paddingBottom: space[2] }]} pointerEvents="box-none">
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  );
};

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
    top: '50%',
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
  },
  handleTouchArea: {
    alignItems: 'center',
    paddingVertical: space[3],
  },
  handle: {
    width: 54,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
  fixedFooter: {
    backgroundColor: 'rgba(11, 16, 32, 0.96)',
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3],
    gap: space[2] + space[0.5],
  },
  bottomFooter: {
    paddingHorizontal: space[4],
    gap: space[2],
  },
});
