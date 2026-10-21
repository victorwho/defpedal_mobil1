import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '../design-system';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { brandTints, surfaceTints } from '../design-system/tokens/tints';
import { fontFamily, textBase } from '../design-system/tokens/typography';
import { QUIET_HOURS_OPTIONS } from '../lib/quietHours';

type CommuteTimePickerProps = {
  visible: boolean;
  title: string;
  value: string | null;
  onSelect: (time: string) => void;
  onClose: () => void;
};

/**
 * Half-hour time list in a modal, same options and look as the quiet-hours
 * pickers in Profile. Controlled, so setup can open it on its own.
 */
export const CommuteTimePicker = ({ visible, title, value, onSelect, onClose }: CommuteTimePickerProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={title}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.list} bounces={false}>
            {QUIET_HOURS_OPTIONS.map((option) => {
              const selected = option === value;
              return (
                <Pressable
                  key={option}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={option}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.text, selected && styles.textSelected]}>{option}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: surfaceTints.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space[6],
    },
    content: {
      width: '100%',
      maxHeight: '70%',
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgDeep,
      padding: space[5],
      gap: space[4],
    },
    title: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
      textAlign: 'center',
    },
    list: { maxHeight: 300 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3],
      paddingHorizontal: space[4],
      borderRadius: radii.lg,
    },
    rowSelected: { backgroundColor: brandTints.accentLight },
    text: {
      ...textBase,
      fontFamily: fontFamily.body.regular,
      color: colors.textPrimary,
    },
    textSelected: {
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
  });
