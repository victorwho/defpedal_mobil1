import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WeatherWarning } from '../../lib/weather';
import { brandColors, gray, safetyColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm } from '../tokens/typography';

type WeatherWarningModalProps = {
  warnings: readonly WeatherWarning[];
  visible: boolean;
  onDismiss: () => void;
};

export const WeatherWarningModal = ({
  warnings,
  visible,
  onDismiss,
}: WeatherWarningModalProps) => {
  if (warnings.length === 0) return null;

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
            <Ionicons name="warning" size={28} color={safetyColors.caution} />
            <Text style={styles.title}>Weather Warning</Text>
          </View>

          <View style={styles.warningList}>
            {warnings.map((w) => (
              <View key={w.type} style={styles.warningRow}>
                <Ionicons name={w.icon as any} size={20} color={safetyColors.caution} />
                <Text style={styles.warningText}>{w.message}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.subtitle}>
            Stay alert and ride with caution.
          </Text>

          <Pressable style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>Start anyway</Text>
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
  },
  warningList: {
    gap: space[3],
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.lg,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  warningText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
    flex: 1,
  },
  subtitle: {
    ...textSm,
    color: gray[400],
    textAlign: 'center',
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
