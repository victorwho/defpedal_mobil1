/**
 * Design System — XpGainToast Atom
 *
 * Subtle floating "+XP" indicator after actions that earn XP.
 * Animates upward and fades out.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { fontFamily } from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';

export interface XpGainToastProps {
  xp: number;
  tierColor: string;
  /** Called when animation finishes (for cleanup) */
  onDone?: () => void;
}

export const XpGainToast = React.memo(function XpGainToast({ xp, tierColor, onDone }: XpGainToastProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -40,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onDone?.();
    });
  }, [translateY, opacity, onDone]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: width / 2 - 40,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.text, { color: tierColor }]}>
        +{xp} XP
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120,
    width: 80,
    alignItems: 'center',
    zIndex: zIndex.toast,
  },
  text: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 16,
  },
});
