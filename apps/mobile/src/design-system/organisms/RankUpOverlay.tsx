/**
 * Design System — RankUpOverlay Organism
 *
 * Full-screen celebration when the user reaches a new tier.
 * Distinct from BadgeUnlockOverlay — bigger, more dramatic.
 * Only 1 rank-up per session. Requires tap to dismiss.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { RiderTierName } from '@defensivepedal/core';

import { useTheme } from '../ThemeContext';
import { TierPill } from '../atoms/TierPill';
import { riderTiers, type RiderTierKey } from '../tokens/tierColors';
import { hasTierImage, tierImages } from '../tokens/tierImages';
import { fontFamily } from '../tokens/typography';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { zIndex } from '../tokens/zIndex';

export interface RankUpOverlayProps {
  oldTier: RiderTierName;
  newTier: RiderTierName;
  tierDisplayName: string;
  tagline: string;
  tierColor: string;
  perkDescription: string;
  onDismiss: () => void;
}

const PARTICLE_COUNT = 20;

export const RankUpOverlay = React.memo(function RankUpOverlay({
  oldTier,
  newTier,
  tierDisplayName,
  tagline,
  tierColor,
  perkDescription,
  onDismiss,
}: RankUpOverlayProps) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useRef(false);

  // Animation values
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const oldPillScale = useRef(new Animated.Value(1)).current;
  const oldPillOpacity = useRef(new Animated.Value(1)).current;
  const mascotScale = useRef(new Animated.Value(0)).current;
  const newPillScale = useRef(new Animated.Value(0.3)).current;
  const tierNameY = useRef(new Animated.Value(30)).current;
  const tierNameOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const perkOpacity = useRef(new Animated.Value(0)).current;
  const dismissOpacity = useRef(new Animated.Value(0)).current;

  // Particles
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((val) => {
      reducedMotion.current = val;
    });
  }, []);

  useEffect(() => {
    if (reducedMotion.current) {
      // Instant final state
      bgOpacity.setValue(0.8);
      oldPillOpacity.setValue(0);
      mascotScale.setValue(1);
      newPillScale.setValue(1);
      tierNameOpacity.setValue(1);
      tierNameY.setValue(0);
      taglineOpacity.setValue(1);
      perkOpacity.setValue(1);
      dismissOpacity.setValue(1);
      return;
    }

    const sequence = Animated.sequence([
      // T+0: Background dims
      Animated.timing(bgOpacity, { toValue: 0.8, duration: 200, useNativeDriver: true }),
      // T+100: Old pill shrinks + fades
      Animated.parallel([
        Animated.timing(oldPillScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
        Animated.timing(oldPillOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      // T+300: Particle burst
      Animated.parallel(
        particles.map((p, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
          const dist = 80 + Math.random() * 60;
          return Animated.parallel([
            Animated.timing(p.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(p.scale, { toValue: 0.5 + Math.random() * 0.5, duration: 400, useNativeDriver: true }),
            Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 600, useNativeDriver: true }),
            Animated.timing(p.y, { toValue: Math.sin(angle) * dist, duration: 600, useNativeDriver: true }),
            Animated.sequence([
              Animated.delay(400),
              Animated.timing(p.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
          ]);
        }),
      ),
      // T+400: Mascot springs in
      Animated.spring(mascotScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      // T+500: New tier pill springs in
      Animated.spring(newPillScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      // T+700: Tier name slides up
      Animated.parallel([
        Animated.timing(tierNameY, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(tierNameOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      // T+900: Tagline fades in
      Animated.timing(taglineOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      // T+1100: Perk fades in
      Animated.timing(perkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      // T+1500: Dismiss text
      Animated.timing(dismissOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);

    // Haptic feedback
    try {
      const { hapticImpact } = require('../../lib/haptics');
      setTimeout(() => hapticImpact('heavy'), 500);
    } catch { /* no haptics available */ }

    sequence.start();
  }, [bgOpacity, oldPillScale, oldPillOpacity, mascotScale, newPillScale, tierNameY, tierNameOpacity, taglineOpacity, perkOpacity, dismissOpacity, particles]);

  const tierKey = newTier as RiderTierKey;
  const tierInfo = riderTiers[tierKey];

  return (
    <Pressable
      style={[styles.overlay, { width, height }]}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`New rank: ${tierDisplayName}. Tap to dismiss`}
    >
      {/* Dark backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]} />

      {/* Particles */}
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              backgroundColor: tierColor,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { scale: p.scale },
              ],
              opacity: p.opacity,
            },
          ]}
        />
      ))}

      {/* Old tier pill (shrinks out) */}
      <Animated.View style={{ transform: [{ scale: oldPillScale }], opacity: oldPillOpacity, marginBottom: space[3] }}>
        <TierPill tier={oldTier} size="md" />
      </Animated.View>

      {/* Mascot / fallback icon */}
      <Animated.View style={{ transform: [{ scale: mascotScale }], marginBottom: space[3] }}>
        {hasTierImage(tierKey) ? (
          <View style={styles.mascotImageWrap}>
            <Image source={tierImages[tierKey]} style={styles.mascotImageInner} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.mascotCircle, { borderColor: tierColor }]}>
            <Ionicons name="bicycle" size={64} color={tierColor} />
          </View>
        )}
      </Animated.View>

      {/* New tier pill */}
      <Animated.View style={{ transform: [{ scale: newPillScale }], marginBottom: space[2] }}>
        <TierPill tier={newTier} size="lg" />
      </Animated.View>

      {/* Tier name */}
      <Animated.Text
        style={[
          styles.tierName,
          { color: colors.textPrimary },
          { transform: [{ translateY: tierNameY }], opacity: tierNameOpacity },
        ]}
      >
        {tierDisplayName}
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          { color: colors.textSecondary },
          { opacity: taglineOpacity },
        ]}
      >
        &ldquo;{tagline}&rdquo;
      </Animated.Text>

      {/* Perk description */}
      <Animated.Text
        style={[
          styles.perk,
          { color: colors.accent },
          { opacity: perkOpacity },
        ]}
      >
        Unlocked: {perkDescription}
      </Animated.Text>

      {/* Dismiss hint */}
      <Animated.Text
        style={[
          styles.dismiss,
          { color: colors.textMuted },
          { opacity: dismissOpacity },
        ]}
      >
        tap to dismiss
      </Animated.Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: zIndex.supreme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mascotImageWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mascotImageInner: {
    width: 156,
    height: 156,
  },
  mascotCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  tierName: {
    fontSize: 24,
    fontFamily: fontFamily.heading.bold,
    marginBottom: space[2],
  },
  tagline: {
    fontSize: 15,
    fontFamily: fontFamily.body.regular,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: space[6],
    marginBottom: space[3],
  },
  perk: {
    fontSize: 13,
    fontFamily: fontFamily.body.medium,
    textAlign: 'center',
    paddingHorizontal: space[6],
    marginBottom: space[6],
  },
  dismiss: {
    fontSize: 11,
    fontFamily: fontFamily.body.regular,
    position: 'absolute',
    bottom: 60,
  },
});
