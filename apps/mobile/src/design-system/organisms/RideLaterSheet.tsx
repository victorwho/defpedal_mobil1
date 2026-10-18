import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../atoms/Button';
import { Spinner } from '../atoms/Spinner';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textLg } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';
import type { RideLaterStatus } from '../../hooks/useRideLater';
import { REMINDER_SLOTS, type ReminderSlot } from '../../lib/firstRideReminder';

const SLOT_LABEL: Record<ReminderSlot, string> = {
  tomorrow_morning: 'onboardingRide.slotTomorrowMorning',
  tomorrow_evening: 'onboardingRide.slotTomorrowEvening',
  weekend: 'onboardingRide.slotWeekend',
};

const SLOT_SET: Record<ReminderSlot, string> = {
  tomorrow_morning: 'onboardingRide.laterSetMorning',
  tomorrow_evening: 'onboardingRide.laterSetEvening',
  weekend: 'onboardingRide.laterSetWeekend',
};

const SLOT_ICON: Record<ReminderSlot, keyof typeof Ionicons.glyphMap> = {
  tomorrow_morning: 'sunny-outline',
  tomorrow_evening: 'partly-sunny-outline',
  weekend: 'calendar-outline',
};

export interface RideLaterSheetProps {
  readonly visible: boolean;
  readonly status: RideLaterStatus;
  readonly onChoose: (slot: ReminderSlot) => void;
  /** Cancel before choosing, or Done after. */
  readonly onClose: () => void;
}

/**
 * "When do you want to go?" — the slot picker behind "Ride it later"
 * (docs/plans/onboarding-first-ride.md [D6]). Three fixed slots, no clock
 * picker: a date/time picker would be a new native module for a choice most
 * riders make in one tap. The outcome is shown in the same sheet.
 */
export const RideLaterSheet = ({ visible, status, onChoose, onClose }: RideLaterSheetProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = useT();
  const busy = status.kind === 'busy';
  const outcome =
    status.kind === 'set'
      ? t(SLOT_SET[status.slot])
      : status.kind === 'no_permission'
        ? t('onboardingRide.laterNoNotifications')
        : status.kind === 'failed'
          ? t('onboardingRide.laterFailed')
          : null;
  const finished = status.kind === 'set' || status.kind === 'no_permission';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => undefined : onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel={t('onboardingRide.laterCancel')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}>
        <Text style={styles.title} accessibilityRole="header">
          {t('onboardingRide.laterTitle')}
        </Text>

        {outcome ? (
          <Text style={styles.outcome} accessibilityLiveRegion="polite">
            {outcome}
          </Text>
        ) : null}

        {!finished ? (
          <View style={styles.slots}>
            {REMINDER_SLOTS.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => onChoose(slot)}
                disabled={busy}
                style={({ pressed }) => [styles.slot, (pressed || busy) && styles.slotPressed]}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
              >
                <Ionicons name={SLOT_ICON[slot]} size={20} color={colors.accent} />
                <Text style={styles.slotText}>{t(SLOT_LABEL[slot])}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {busy ? <Spinner /> : null}

        <Button variant={finished ? 'primary' : 'ghost'} size="lg" fullWidth disabled={busy} onPress={onClose}>
          {finished ? t('onboardingRide.coachDone') : t('onboardingRide.laterCancel')}
        </Button>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      gap: space[4],
      paddingHorizontal: space[5],
      paddingTop: space[5],
      borderTopLeftRadius: radii['2xl'],
      borderTopRightRadius: radii['2xl'],
      backgroundColor: colors.bgPrimary,
    },
    title: {
      ...textLg,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
    },
    outcome: {
      ...textBase,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    slots: {
      gap: space[2],
    },
    slot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: 52,
      paddingHorizontal: space[4],
      borderRadius: radii.xl,
      borderWidth: 1.5,
      borderColor: colors.borderDefault,
    },
    slotPressed: {
      opacity: 0.6,
    },
    slotText: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
  });

