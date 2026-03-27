import { Pressable, StyleSheet, Text } from 'react-native';

import { mobileTheme } from '../lib/theme';

type LikeButtonProps = {
  liked: boolean;
  count: number;
  onPress: () => void;
};

export const LikeButton = ({ liked, count, onPress }: LikeButtonProps) => (
  <Pressable style={styles.button} onPress={onPress}>
    <Text style={[styles.icon, liked ? styles.iconActive : null]}>
      {liked ? '\u2665' : '\u2661'}
    </Text>
    <Text style={[styles.count, liked ? styles.countActive : null]}>
      {count > 0 ? count : ''}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  icon: {
    fontSize: 20,
    color: mobileTheme.colors.textOnDarkMuted,
  },
  iconActive: {
    color: mobileTheme.colors.danger,
  },
  count: {
    fontSize: 14,
    fontWeight: '700',
    color: mobileTheme.colors.textOnDarkMuted,
  },
  countActive: {
    color: mobileTheme.colors.danger,
  },
});
