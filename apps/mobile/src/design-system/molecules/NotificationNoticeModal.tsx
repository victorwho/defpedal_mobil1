import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { NotificationNotice } from '../../store/appStore';
import { Mascot } from '../atoms/Mascot';
import { brandColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm } from '../tokens/typography';

type NotificationNoticeModalProps = {
  notice: NotificationNotice | null;
  visible: boolean;
  closeLabel: string;
  /** Null when the notification leads nowhere specific: Close only. */
  actionLabel: string | null;
  onAction: () => void;
  onClose: () => void;
};

/**
 * Shows a tapped notification's full title and text in-app (the system shade
 * truncates it), then lets the rider go where it leads. Labels come from the
 * caller so this stays i18n-agnostic.
 */
export const NotificationNoticeModal = ({
  notice,
  visible,
  closeLabel,
  actionLabel,
  onAction,
  onClose,
}: NotificationNoticeModalProps) => {
  if (!notice) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Mascot pose={notice.tone === 'caution' ? 'rain' : 'ride'} size="sm" />
            {notice.title ? <Text style={styles.title}>{notice.title}</Text> : null}
          </View>

          {notice.body ? (
            <ScrollView style={styles.bodyScroll}>
              <Text style={styles.body}>{notice.body}</Text>
            </ScrollView>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.closeButton]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
            >
              <Text style={styles.closeText}>{closeLabel}</Text>
            </Pressable>
            {actionLabel ? (
              <Pressable
                style={[styles.button, styles.actionButton]}
                onPress={onAction}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                <Text style={styles.actionText}>{actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
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
    maxHeight: '80%',
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
  bodyScroll: {
    flexGrow: 0,
  },
  body: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: gray[300],
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space[3],
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space[5],
    borderRadius: radii.lg,
  },
  closeButton: {
    backgroundColor: gray[700],
  },
  actionButton: {
    backgroundColor: brandColors.accent,
  },
  closeText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
  },
  actionText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textInverse,
  },
});
