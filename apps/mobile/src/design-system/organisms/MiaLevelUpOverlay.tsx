/**
 * Design System — MiaLevelUpOverlay Organism
 *
 * Full-screen celebration overlay for Mia journey level transitions.
 * Animation: scrim fade-in -> badge spring-in + particle burst -> text stagger.
 * Follows BadgeUnlockOverlay pattern closely.
 *
 * 4 variants by level transition (1->2, 2->3, 3->4, 4->5).
 * Level 4->5 includes a testimonial input field.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { MiaJourneyLevel } from '@defensivepedal/core';

import { MiaShareCard } from '../../components/MiaShareCard';
import { useShareCard } from '../../hooks/useShareCard';
import { usePersonaT } from '../../hooks/usePersonaT';
import { miaLevelColors } from '../tokens/miaColors';
import { brandColors } from '../tokens/colors';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import {
  fontFamily,
  textXl,
  textSm,
  textBase,
  textXs,
} from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Level variant config
// ---------------------------------------------------------------------------

type LevelVariant = {
  readonly colorKey: keyof typeof miaLevelColors;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly i18nKey: string;
};

const LEVEL_VARIANTS: Record<string, LevelVariant> = {
  '1to2': { colorKey: 'level2', icon: 'shield-checkmark', i18nKey: 'mia.levelUp.1to2' },
  '2to3': { colorKey: 'level3', icon: 'cafe', i18nKey: 'mia.levelUp.2to3' },
  '3to4': { colorKey: 'level4', icon: 'compass', i18nKey: 'mia.levelUp.3to4' },
  '4to5': { colorKey: 'level5', icon: 'star', i18nKey: 'mia.levelUp.4to5' },
};

// ---------------------------------------------------------------------------
// Particle burst (adapted from BadgeUnlockOverlay)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 14;
const PARTICLE_SIZE = 6;
const PARTICLE_DURATION = 800;
const PARTICLE_RADIUS_MIN = 60;
const PARTICLE_RADIUS_MAX = 120;
const PARTICLE_FADE_START = 0.6;

type Particle = {
  readonly id: number;
  readonly angle: number;
  readonly translateX: Animated.Value;
  readonly translateY: Animated.Value;
  readonly opacity: Animated.Value;
  readonly scale: Animated.Value;
};

function createParticles(count: number): readonly Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (i / count) * 2 * Math.PI,
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(1),
    scale: new Animated.Value(0),
  }));
}

function animateParticles(particles: readonly Particle[]) {
  const animations = particles.map((p) => {
    const radius = PARTICLE_RADIUS_MIN + Math.random() * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN);
    const targetX = Math.cos(p.angle) * radius;
    const targetY = Math.sin(p.angle) * radius;

    return Animated.parallel([
      Animated.timing(p.translateX, {
        toValue: targetX,
        duration: PARTICLE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(p.translateY, {
        toValue: targetY,
        duration: PARTICLE_DURATION,
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
          duration: PARTICLE_DURATION - 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(p.opacity, {
        toValue: 0,
        duration: PARTICLE_DURATION,
        delay: PARTICLE_DURATION * PARTICLE_FADE_START,
        useNativeDriver: true,
      }),
    ]);
  });

  Animated.stagger(30, animations).start();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MiaLevelUpOverlayStats {
  readonly totalRides: number;
  readonly totalKm: number;
  readonly daysSinceStart: number;
}

export interface MiaLevelUpOverlayProps {
  readonly fromLevel: MiaJourneyLevel;
  readonly toLevel: MiaJourneyLevel;
  readonly onDismiss: () => void;
  readonly onTestimonialSubmit?: (text: string) => void;
  readonly stats?: MiaLevelUpOverlayStats;
}

// English level titles — captions are always English regardless of locale so
// they cross-post cleanly. Mirrors the LEVEL_NAMES map in MiaShareCard.
const LEVEL_TITLES_EN: Record<number, string> = {
  1: 'First Pedal',
  2: 'Neighborhood Explorer',
  3: 'Cafe Rider',
  4: 'Urban Navigator',
  5: 'Confident Cyclist',
};

export const MiaLevelUpOverlay: React.FC<MiaLevelUpOverlayProps> = ({
  fromLevel,
  toLevel,
  onDismiss,
  onTestimonialSubmit,
  stats,
}) => {
  const t = usePersonaT();
  const { share: shareCard, isSharing } = useShareCard();
  const variantKey = `${fromLevel}to${toLevel}`;
  const variant = LEVEL_VARIANTS[variantKey] ?? LEVEL_VARIANTS['1to2'];
  const levelColor = miaLevelColors[variant.colorKey];
  const isTestimonialLevel = fromLevel === 4 && toLevel === 5;

  // Testimonial state
  const [testimonialText, setTestimonialText] = useState('');
  const [testimonialSubmitted, setTestimonialSubmitted] = useState(false);

  // Animations
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.3)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const shareOpacity = useRef(new Animated.Value(0)).current;
  const testimonialOpacity = useRef(new Animated.Value(0)).current;
  const dismissOpacity = useRef(new Animated.Value(0)).current;

  const [particles] = useState(() => createParticles(PARTICLE_COUNT));

  useEffect(() => {
    const animation = Animated.sequence([
      // T+0ms: Background dims
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // T+200ms: Badge + particles (parallel)
      Animated.parallel([
        Animated.sequence([
          Animated.timing(badgeOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.spring(badgeScale, {
            toValue: 1,
            damping: 12,
            stiffness: 180,
            mass: 1,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(100),
          Animated.timing(iconOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]),
      // T+400ms: Icon fade in
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // T+600ms: Pause before text
      Animated.delay(200),
      // T+800ms: Title slides up
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // T+1100ms: Subtitle fades in
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // T+1300ms: Share button + testimonial fade in
      Animated.parallel([
        Animated.timing(shareOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        ...(isTestimonialLevel
          ? [
              Animated.timing(testimonialOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]
          : []),
      ]),
      // T+1500ms: Dismiss hint fades in
      Animated.timing(dismissOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    // Fire particles as side-effect (same pattern as BadgeUnlockOverlay)
    const particleTimer = setTimeout(() => animateParticles(particles), 200);

    return () => {
      animation.stop();
      clearTimeout(particleTimer);
    };
  }, []);

  const resolvedStats = stats ?? { totalRides: 0, totalKm: 0, daysSinceStart: 0 };
  const levelTitle = LEVEL_TITLES_EN[toLevel] ?? 'Cyclist';

  const handleShare = () => {
    void shareCard({
      type: 'mia',
      level: toLevel,
      levelTitle,
      card: (
        <MiaShareCard
          variant="capture"
          level={toLevel}
          stats={resolvedStats}
        />
      ),
    });
  };

  const handleTestimonialSubmit = () => {
    if (testimonialText.trim().length === 0) return;
    setTestimonialSubmitted(true);
    onTestimonialSubmit?.(testimonialText.trim());
  };

  return (
    <Pressable
      style={styles.container}
      onPress={isTestimonialLevel ? undefined : onDismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]} />

      {/* Particle burst */}
      <View style={styles.particleContainer}>
        {particles.map((p) => (
          <Animated.View
            key={p.id}
            style={[
              styles.particle,
              {
                backgroundColor: levelColor.particle,
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

      {/* Level badge circle */}
      <Animated.View
        style={[
          styles.badgeCircle,
          {
            backgroundColor: levelColor.primary,
            opacity: badgeOpacity,
            transform: [{ scale: badgeScale }],
          },
        ]}
      >
        <Animated.View style={{ opacity: iconOpacity }}>
          <Ionicons name={variant.icon} size={48} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>

      {/* Title */}
      <Animated.View
        style={{
          opacity: titleOpacity,
          transform: [{ translateY: titleTranslateY }],
          marginTop: space[5],
        }}
      >
        <Text style={styles.title}>{t(`${variant.i18nKey}.title`)}</Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.View style={{ opacity: subtitleOpacity, marginTop: space[2] }}>
        <Text style={styles.subtitle}>{t(`${variant.i18nKey}.subtitle`)}</Text>
      </Animated.View>

      {/* Share button */}
      <Animated.View style={{ opacity: shareOpacity, marginTop: space[4] }}>
        <Pressable
          style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={isSharing}
          accessibilityState={{ disabled: isSharing, busy: isSharing }}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color={brandColors.textInverse} />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={18} color={brandColors.textInverse} />
              <Text style={styles.shareButtonText}>{t('share.shareLevelUp')}</Text>
            </>
          )}
        </Pressable>
      </Animated.View>

      {/* Testimonial input (level 4->5 only) */}
      {isTestimonialLevel ? (
        <Animated.View style={[styles.testimonialWrap, { opacity: testimonialOpacity }]}>
          <Text style={styles.testimonialPrompt}>
            {t('mia.levelUp.4to5.testimonialPrompt')}
          </Text>
          <TextInput
            style={styles.testimonialInput}
            placeholder={t('mia.levelUp.4to5.testimonialAlt')}
            placeholderTextColor={brandColors.textMuted}
            value={testimonialText}
            onChangeText={setTestimonialText}
            maxLength={280}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <View style={styles.testimonialFooter}>
            <Text style={styles.charCount}>{testimonialText.length}/280</Text>
            {testimonialSubmitted ? (
              <View style={styles.submitDoneRow}>
                <Ionicons name="checkmark-circle" size={16} color={levelColor.primary} />
                <Text style={[styles.submitDoneText, { color: levelColor.primary }]}>Sent!</Text>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.submitButton,
                  { backgroundColor: levelColor.primary },
                  testimonialText.trim().length === 0 && styles.submitButtonDisabled,
                ]}
                onPress={handleTestimonialSubmit}
                disabled={testimonialText.trim().length === 0}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </Pressable>
            )}
          </View>
          {/* Dismiss button for testimonial variant (since tap-to-dismiss is off) */}
          <Pressable style={styles.doneButton} onPress={onDismiss}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Dismiss hint (non-testimonial levels only) */}
      {!isTestimonialLevel ? (
        <Animated.View style={[styles.dismissHint, { opacity: dismissOpacity }]}>
          <Text style={styles.dismissText}>Tap to dismiss</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: zIndex.supreme,
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
    width: PARTICLE_SIZE,
    height: PARTICLE_SIZE,
    borderRadius: PARTICLE_SIZE / 2,
  },
  badgeCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: space[6],
  },
  subtitle: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: brandColors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: space[8],
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[5],
    paddingVertical: space[2],
    borderRadius: radii.full,
    backgroundColor: brandColors.accent,
    minWidth: 120,
    justifyContent: 'center',
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textInverse,
    fontSize: 14,
  },
  testimonialWrap: {
    marginTop: space[4],
    width: SCREEN_W - space[8] * 2,
    gap: space[2],
  },
  testimonialPrompt: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textSecondary,
    textAlign: 'center',
  },
  testimonialInput: {
    borderWidth: 1,
    borderColor: brandColors.bgTertiary,
    borderRadius: radii.lg,
    backgroundColor: brandColors.bgPrimary,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    color: brandColors.textPrimary,
    fontFamily: fontFamily.body.regular,
    fontSize: 14,
    minHeight: 72,
  },
  testimonialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    ...textXs,
    color: brandColors.textMuted,
  },
  submitDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  submitDoneText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
  },
  submitButton: {
    paddingHorizontal: space[4],
    paddingVertical: space[1],
    borderRadius: radii.full,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textInverse,
    fontSize: 13,
  },
  doneButton: {
    alignSelf: 'center',
    paddingHorizontal: space[6],
    paddingVertical: space[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: brandColors.bgTertiary,
    marginTop: space[2],
  },
  doneButtonText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
    fontSize: 14,
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
