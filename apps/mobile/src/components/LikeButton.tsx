import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useHaptics } from '../design-system/hooks/useHaptics';
import { useReducedMotion } from '../design-system/hooks/useReducedMotion';
import { brandColors, gray } from '../design-system/tokens/colors';
import { springs } from '../design-system/tokens/motion';

type ReactionButtonProps = {
  active: boolean;
  count: number;
  onPress: () => void;
  icon: 'thumbs-up' | 'heart';
  activeColor: string;
  label?: string;
};

const ReactionButton = ({ active, count, onPress, icon, activeColor, label }: ReactionButtonProps) => {
  const reduced = useReducedMotion();
  const haptics = useHaptics();
  const scale = useRef(new Animated.Value(1)).current;

  const iconName = active
    ? (icon === 'thumbs-up' ? 'thumbs-up' : 'heart')
    : (icon === 'thumbs-up' ? 'thumbs-up-outline' : 'heart-outline');

  const a11yLabel = label ?? (icon === 'thumbs-up' ? 'Like' : 'Love');

  const handlePress = () => {
    haptics.confirm();
    if (!reduced) {
      // Bloom: quick overshoot then settle. Wobbly spring on the way up
      // (overshoot 1.35), snappy back to rest.
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.35,
          ...springs.wobbly,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          ...springs.snappy,
          useNativeDriver: true,
        }),
      ]).start();
    }
    onPress();
  };

  return (
    <Pressable
      style={[styles.button, active && styles.buttonActive]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${a11yLabel}, ${count}`}
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={iconName} size={20} color={active ? activeColor : gray[400]} />
      </Animated.View>
      <Text style={[styles.count, active && { color: activeColor }]}>{count}</Text>
    </Pressable>
  );
};

type LikeButtonProps = {
  liked: boolean;
  count: number;
  onPress: () => void;
};

// Single consolidated reaction (review P3): one heart in the brand accent.
// (Safety red is reserved for hazards, so the heart uses the accent, not red.)
export const LikeButton = ({ liked, count, onPress }: LikeButtonProps) => (
  <ReactionButton
    active={liked}
    count={count}
    onPress={onPress}
    icon="heart"
    activeColor={brandColors.accent}
    label="Like"
  />
);

type ReactionBarProps = {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  onLike: () => void;
  onComment: () => void;
  // Deprecated — reactions consolidated to a single heart (review P3). Kept
  // optional so existing callers (FeedCard, ActivityFeedCard) compile without
  // change; ignored. Remove once those call sites drop the love props.
  loveCount?: number;
  lovedByMe?: boolean;
  onLove?: () => void;
};

export const ReactionBar = ({
  likeCount,
  commentCount,
  likedByMe,
  onLike,
  onComment,
}: ReactionBarProps) => (
  <View style={styles.bar}>
    <LikeButton liked={likedByMe} count={likeCount} onPress={onLike} />
    <Pressable
      style={styles.button}
      onPress={onComment}
      accessibilityRole="button"
      accessibilityLabel={`Comments, ${commentCount}`}
    >
      <Ionicons name="chatbubble-outline" size={18} color={gray[400]} />
      <Text style={styles.count}>{commentCount}</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  buttonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    color: gray[400],
  },
});
