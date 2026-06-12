/**
 * Design System v1.0 — Early End Reason Modal
 *
 * Single-choice question shown after a rider chooses to SAVE a ride they ended
 * before reaching the destination. Skippable — Save submits whatever is
 * selected (null if nothing), Skip and backdrop-dismiss both submit null.
 * Selecting "Other" reveals a free-text field whose contents ride along as the
 * note. i18n-agnostic: the parent supplies the already-translated strings.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EarlyEndReason } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { Button } from '../atoms';
import { Modal } from './Modal';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase, textXs } from '../tokens/typography';

const NOTE_MAX_LENGTH = 280;

export interface EarlyEndReasonOption {
  readonly value: EarlyEndReason;
  readonly label: string;
}

export interface EarlyEndReasonModalProps {
  readonly visible: boolean;
  readonly title: string;
  readonly options: ReadonlyArray<EarlyEndReasonOption>;
  readonly saveLabel: string;
  readonly skipLabel: string;
  readonly otherPlaceholder: string;
  readonly onSubmit: (reason: EarlyEndReason | null, note: string | null) => void;
  /**
   * Optional abort path: closes the modal WITHOUT ending the ride (the rider
   * changed their mind after tapping Save/Discard in the End Ride dialog).
   * Rendered as an explicit button — backdrop-dismiss stays disabled because
   * of the Android Alert touch-propagation issue documented below.
   */
  readonly cancelLabel?: string;
  readonly onCancel?: () => void;
}

export const EarlyEndReasonModal: React.FC<EarlyEndReasonModalProps> = ({
  visible,
  title,
  options,
  saveLabel,
  skipLabel,
  otherPlaceholder,
  onSubmit,
  cancelLabel,
  onCancel,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [selected, setSelected] = useState<EarlyEndReason | null>(null);
  const [note, setNote] = useState('');

  // Reset each time the modal opens so a prior ride's answer never leaks.
  useEffect(() => {
    if (visible) {
      setSelected(null);
      setNote('');
    }
  }, [visible]);

  const submit = (reason: EarlyEndReason | null) => {
    const trimmed = note.trim();
    onSubmit(reason, reason === 'other' && trimmed.length > 0 ? trimmed : null);
  };

  return (
    // Intentionally NOT passing onClose: on Android, an Alert.alert button tap
    // propagates the touch through to the modal we mount underneath, hitting
    // the backdrop Pressable and dismissing the picker before the rider can
    // see it. Force an explicit Save or Skip — Skip is the documented out.
    <Modal
      visible={visible}
      title={title}
      footer={
        <View style={styles.footer}>
          <Button variant="primary" size="lg" fullWidth onPress={() => submit(selected)}>
            {saveLabel}
          </Button>
          <Button variant="ghost" size="md" onPress={() => onSubmit(null, null)}>
            {skipLabel}
          </Button>
          {cancelLabel && onCancel ? (
            <Button variant="ghost" size="md" onPress={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
        </View>
      }
    >
      <View style={styles.optionList}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <View key={option.value}>
              <Pressable
                onPress={() => setSelected(isSelected ? null : option.value)}
                style={[styles.option, isSelected && styles.optionSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
              >
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={isSelected ? colors.accent : colors.textMuted}
                />
                <Text style={styles.optionLabel}>{option.label}</Text>
              </Pressable>
              {option.value === 'other' && isSelected ? (
                <View style={styles.noteWrap}>
                  <TextInput
                    style={styles.noteInput}
                    value={note}
                    onChangeText={setNote}
                    placeholder={otherPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={NOTE_MAX_LENGTH}
                    autoFocus
                    textAlignVertical="top"
                    accessibilityLabel={otherPlaceholder}
                  />
                  <Text style={styles.noteCounter}>
                    {note.length}/{NOTE_MAX_LENGTH}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    optionList: {
      gap: space[2],
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[3],
      paddingHorizontal: space[3],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
    },
    optionSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.bgPrimary,
    },
    optionLabel: {
      ...textBase,
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fontFamily.body.regular,
    },
    noteWrap: {
      marginTop: space[2],
      gap: space[1],
    },
    noteInput: {
      ...textBase,
      minHeight: 72,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      color: colors.textPrimary,
      fontFamily: fontFamily.body.regular,
    },
    noteCounter: {
      ...textXs,
      alignSelf: 'flex-end',
      color: colors.textMuted,
      fontFamily: fontFamily.body.regular,
    },
    footer: {
      flex: 1,
      gap: space[2],
      alignItems: 'center',
    },
  });
