import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { brandColors, gray, safetyColors } from '../design-system/tokens/colors';

type ReactionButtonProps = {
  active: boolean;
  count: number;
  onPress: () => void;
  icon: 'thumbs-up' | 'heart';
  activeColor: string;
};

const ReactionButton = ({ active, count, onPress, icon, activeColor }: ReactionButtonProps) => {
  const iconName = active
    ? (icon === 'thumbs-up' ? 'thumbs-up' : 'heart')
    : (icon === 'thumbs-up' ? 'thumbs-up-outline' : 'heart-outline');

  const label = icon === 'thumbs-up' ? 'Like' : 'Love';
  return (
    <Pressable
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={iconName} size={20} color={active ? activeColor : gray[400]} />
      <Text style={[styles.count, active && { color: activeColor }]}>{count}</Text>
    </Pressable>
  );
};

type LikeButtonProps = {
  liked: boolean;
  count: number;
  onPress: () => void;
};

export const LikeButton = ({ liked, count, onPress }: LikeButtonProps) => (
  <ReactionButton
    active={liked}
    count={count}
    onPress={onPress}
    icon="thumbs-up"
    activeColor={brandColors.accent}
  />
);

type LoveButtonProps = {
  loved: boolean;
  count: number;
  onPress: () => void;
};

export const LoveButton = ({ loved, count, onPress }: LoveButtonProps) => (
  <ReactionButton
    active={loved}
    count={count}
    onPress={onPress}
    icon="heart"
    activeColor={safetyColors.danger}
  />
);

type ReactionBarProps = {
  likeCount: number;
  loveCount: number;
  commentCount: number;
  likedByMe: boolean;
  lovedByMe: boolean;
  onLike: () => void;
  onLove: () => void;
  onComment: () => void;
};

export const ReactionBar = ({
  likeCount,
  loveCount,
  commentCount,
  likedByMe,
  lovedByMe,
  onLike,
  onLove,
  onComment,
}: ReactionBarProps) => (
  <View style={styles.bar}>
    <LikeButton liked={likedByMe} count={likeCount} onPress={onLike} />
    <LoveButton loved={lovedByMe} count={loveCount} onPress={onLove} />
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
