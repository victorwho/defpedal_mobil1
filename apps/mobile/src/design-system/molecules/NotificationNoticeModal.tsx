import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WeatherNotice } from '../../store/appStore';
import { Mascot } from '../atoms/Mascot';
import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm } from '../tokens/typography';

type WeatherNoticeModalProps = {
  notice: WeatherNotice | null;
  visible: boolean;
  onDismiss: () => void;
};

/**
 * Re-shows the daily weather notification content in-app after the user taps
 * the system notification. Mirrors WeatherWarningModal styling.
 */
export const WeatherNoticeModal = ({
  notice,
  visible,
  onDismiss,
}: WeatherNoticeModalProps) => {
  if (!notice) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Mascot pose={notice.tone === 'caution' ? 'rain' : 'ride'} size="sm" />
            <Text style={styles.title}>{notice.title}</Text>
          </View>

          <Text style={styles.body}>{notice.body}</Text>

          <Pressable
            style={styles.button}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[6],
  },
  card: {
    width: '100%',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgDeep,
    padding: space[5],
    gap: space[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  title: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 20,
    flex: 1,
  },
  body: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: gray[300],
    lineHeight: 22,
  },
  button: {
    alignSelf: 'center',
    paddingHorizontal: space[6],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    backgroundColor: gray[700],
  },
  buttonText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
  },
});
