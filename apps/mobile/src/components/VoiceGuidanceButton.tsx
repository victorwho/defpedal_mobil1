import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileTheme } from '../lib/theme';

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
        color={enabled ? mobileTheme.colors.textPrimary : mobileTheme.colors.textOnDark}
      />
    </View>
    {!compact ? <Text style={styles.label}>{enabled ? 'Voice on' : 'Voice off'}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    borderRadius: 22,
    backgroundColor: 'rgba(11, 16, 32, 0.88)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
    minWidth: 74,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },
  buttonCompact: {
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 0,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEnabled: {
    backgroundColor: mobileTheme.colors.brand,
  },
  iconWrapDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  label: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
});
