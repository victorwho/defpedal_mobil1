import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brandColors, gray } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { shadows } from '../design-system/tokens/shadows';
import { fontFamily, textXs } from '../design-system/tokens/typography';

type VoiceGuidanceButtonProps = {
  enabled: boolean;
  onPress: () => void;
  compact?: boolean;
};

export const VoiceGuidanceButton = ({
  enabled,
  onPress,
  compact = false,
}: VoiceGuidanceButtonProps) => (
  <Pressable
    style={[styles.button, compact ? styles.buttonCompact : null]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={enabled ? 'Turn voice guidance off' : 'Turn voice guidance on'}
  >
    <View style={[styles.iconWrap, enabled ? styles.iconWrapEnabled : styles.iconWrapDisabled]}>
      <Ionicons
        name={enabled ? 'volume-high' : 'volume-mute'}
        size={compact ? 22 : 24}
        color={enabled ? brandColors.textInverse : brandColors.textPrimary}
      />
    </View>
    {!compact ? <Text style={styles.label}>{enabled ? 'Voice on' : 'Voice off'}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.xl + space[1] + space[0.5],
    backgroundColor: 'rgba(11, 16, 32, 0.88)',
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    paddingHorizontal: space[2] + space[0.5],
    paddingVertical: space[2] + space[0.5],
    alignItems: 'center',
    gap: space[2],
    minWidth: 74,
    ...shadows.lg,
  },
  buttonCompact: {
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: radii.xl + space[1],
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEnabled: {
    backgroundColor: brandColors.accent,
  },
  iconWrapDisabled: {
    backgroundColor: gray[800],
  },
  label: {
    color: brandColors.textPrimary,
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
  },
});
