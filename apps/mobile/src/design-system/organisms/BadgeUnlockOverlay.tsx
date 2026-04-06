/**
 * Design System — BadgeUnlockOverlay Organism
 *
 * Full-screen celebration overlay when a badge is earned.
 * Animation: shield spring-in → particle burst → icon fade → name slide up.
 * Requires tap to dismiss. Max 2 per session. Suppressed during NAVIGATING.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { BadgeUnlockEvent } from '@defensivepedal/core';

import { BadgeIcon } from '../atoms/BadgeIcon';
import {
  tierColors,
  badgeAnimations,
  type BadgeTier,
} from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { space } from '../tokens/spacing';
import { fontFamily, textXl, textSm, textBase, textXs } from '../tokens/typography';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const TIER_FROM_NAME: Record<string, BadgeTier> = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  platinum: 'platinum',
  diamond: 'diamond',
};

// ---------------------------------------------------------------------------
// Particle burst
// ---------------------------------------------------------------------------

type Particle = {
  id: number;
  angle: number;
  translateX: Animated.Value;
  translateY: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
};

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (i / count) * 2 * Math.PI,
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(1),
    scale: new Animated.Value(0),
  }));
}

function animateParticles(particles: Particle[]) {
  const { duration, radiusMin, radiusMax } = badgeAnimations.particleBurst;

  const animations = particles.map((p) => {
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    const targetX = Math.cos(p.angle) * radius;
    const targetY = Math.sin(p.angle) * radius;

    return Animated.parallel([
      Animated.timing(p.translateX, {
        toValue: targetX,
        duration,
        useNativeDriver: true,
      }),
      Animated.timing(p.translateY, {
        toValue: targetY,
        duration,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(p.scale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 0,
          duration: duration - 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(p.opacity, {
        toValue: 0,
        duration,
        delay: duration * badgeAnimations.particleBurst.fadeStart,
        useNativeDriver: true,
      }),
    ]);
  });

  Animated.stagger(30, animations).start();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BadgeUnlockOverlayProps {
  badge: BadgeUnlockEvent;
  onDismiss: () => void;
}

export const BadgeUnlockOverlay: React.FC<BadgeUnlockOverlayProps> = ({
  badge,
  onDismiss,
}) => {
  const tier: BadgeTier = badge.tier
    ? TIER_FROM_NAME[badge.tier] ?? 'bronze'
    : 'bronze';
  const tierColor = tierColors[tier].primary;

  // Animations
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const shieldScale = useRef(new Animated.Value(0.3)).current;
  const shieldOpacity = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslateY = useRef(new Animated.Value(20)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const tierOpacity = useRef(new Animated.Value(0)).current;
  const flavorOpacity = useRef(new Animated.Value(0)).current;
  const dismissOpacity = useRef(new Animated.Value(0)).current;

  const [particles] = useState(() =>
    createParticles(badgeAnimations.particleBurst.count),
  );

  useEffect(() => {
    // T+0ms: Background dims
    Animated.timing(bgOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // T+100ms: Shield scales in with spring
    setTimeout(() => {
      shieldOpacity.setValue(1);
      Animated.spring(shieldScale, {
        toValue: 1,
        damping: badgeAnimations.unlockSpring.damping,
        stiffness: badgeAnimations.unlockSpring.stiffness,
        mass: badgeAnimations.unlockSpring.mass,
        useNativeDriver: true,
      }).start();
    }, 100);

    // T+200ms: Particle burst
    setTimeout(() => {
      animateParticles(particles);
    }, 200);

    // T+400ms: Icon fade in
    setTimeout(() => {
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, 400);

    // T+800ms: Badge name slides up
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(nameTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, 800);

    // T+1000ms: Tier label fades in
    setTimeout(() => {
      Animated.timing(tierOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, 1000);

    // T+1200ms: Flavor text fades in
    setTimeout(() => {
      Animated.timing(flavorOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, 1200);

    // T+1500ms: Dismiss hint fades in
    setTimeout(() => {
      Animated.timing(dismissOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 1500);
  }, []);

  return (
    <Pressable style={styles.container} onPress={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]} />

      {/* Particle burst */}
      <View style={styles.particleContainer}>
        {particles.map((p) => (
          <Animated.View
            key={p.id}
            style={[
              styles.particle,
              {
                backgroundColor: tierColor,
                transform: [
                  { translateX: p.translateX },
                  { translateY: p.translateY },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
              },
            ]}
          />
        ))}
      </View>

      {/* Shield */}
      <Animated.View
        style={[
          styles.shieldContainer,
          {
            opacity: shieldOpacity,
            transform: [{ scale: shieldScale }],
          },
        ]}
      >
        <Animated.View style={{ opacity: iconOpacity }}>
          <BadgeIcon
            badgeKey={badge.badgeKey}
            tier={tier}
            size="lg"
          />
        </Animated.View>
      </Animated.View>

      {/* Name */}
      <Animated.View
        style={{
          opacity: nameOpacity,
          transform: [{ translateY: nameTranslateY }],
          marginTop: space[5],
        }}
      >
        <Text style={styles.badgeName}>{badge.name}</Text>
      </Animated.View>

      {/* Tier */}
      <Animated.View style={{ opacity: tierOpacity, marginTop: space[2] }}>
        <Text style={[styles.tierLabel, { color: tierColor }]}>
          {tierColors[tier].label}
        </Text>
      </Animated.View>

      {/* Flavor text */}
      <Animated.View style={{ opacity: flavorOpacity, marginTop: space[3] }}>
        <Text style={styles.flavorText}>{badge.flavorText}</Text>
      </Animated.View>

      {/* Dismiss hint */}
      <Animated.View style={[styles.dismissHint, { opacity: dismissOpacity }]}>
        <Text style={styles.dismissText}>Tap to dismiss</Text>
      </Animated.View>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Overlay Manager — reads from appStore queue, max 2 per session
// ---------------------------------------------------------------------------

const MAX_OVERLAYS_PER_SESSION = 2;

export const BadgeUnlockOverlayManager: React.FC = () => {
  const appState = useAppStore((s) => s.appState);
  const pendingBadgeUnlocks = useAppStore((s) => s.pendingBadgeUnlocks);
  const shiftBadgeUnlock = useAppStore((s) => s.shiftBadgeUnlock);

  const shownCountRef = useRef(0);
  const [current, setCurrent] = useState<BadgeUnlockEvent | null>(null);

  useEffect(() => {
    // Suppress during navigation
    if (appState === 'NAVIGATING') return;
    // Already showing one
    if (current) return;
    // Reached session limit
    if (shownCountRef.current >= MAX_OVERLAYS_PER_SESSION) return;
    // Nothing in queue
    if (pendingBadgeUnlocks.length === 0) return;

    const next = shiftBadgeUnlock();
    if (next) {
      setCurrent(next);
      shownCountRef.current++;
    }
  }, [appState, pendingBadgeUnlocks, current]);

  if (!current) return null;

  return (
    <BadgeUnlockOverlay
      badge={current}
      onDismiss={() => setCurrent(null)}
    />
  );
};

// Need appStore import for the manager
import { useAppStore } from '../../store/appStore';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  particleContainer: {
    position: 'absolute',
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: badgeAnimations.particleBurst.particleSize,
    height: badgeAnimations.particleBurst.particleSize,
    borderRadius: badgeAnimations.particleBurst.particleSize / 2,
  },
  shieldContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    textAlign: 'center',
  },
  tierLabel: {
    ...textSm,
    fontFamily: fontFamily.mono.semiBold,
    textAlign: 'center',
  },
  flavorText: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: brandColors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: space[8],
  },
  dismissHint: {
    position: 'absolute',
    bottom: 60,
  },
  dismissText: {
    ...textXs,
    color: brandColors.textMuted,
    textAlign: 'center',
  },
});
