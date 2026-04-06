import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { brandColors } from '../tokens/colors';
import { shadows } from '../tokens/shadows';

type BackButtonProps = {
  onPress?: () => void;
};

/**
 * Consistent back button: yellow circle with chevron arrow.
 * Defaults to router.back() if no onPress provided.
 */
export const BackButton = ({ onPress }: BackButtonProps) => (
  <Pressable
    style={styles.button}
    onPress={onPress ?? (() => router.back())}
    accessibilityLabel="Go back"
    accessibilityRole="button"
    hitSlop={8}
  >
    <Ionicons name="chevron-back" size={22} color={brandColors.textInverse} />
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brandColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
});
