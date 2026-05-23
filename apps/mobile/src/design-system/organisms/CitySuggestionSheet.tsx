/**
 * Design System v1.0 — City Suggestion Sheet
 *
 * Modal that collects a free-text "city suggestion" tied to a coordinate
 * the user has just placed via the crosshair on route-preview. Wrapped in
 * KeyboardAvoidingView; counter turns warning-coloured near the cap.
 * i18n-agnostic: the parent supplies the already-translated strings.
 */
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { Button } from '../atoms';
import { Modal } from './Modal';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase, textXs } from '../tokens/typography';

const BODY_MIN_LENGTH = 1;
const BODY_MAX_LENGTH = 500;
const COUNTER_WARN_AT = BODY_MAX_LENGTH - 50;

export interface CitySuggestionSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly cancelLabel: string;
  readonly minLengthHint: string;
  readonly submitting: boolean;
  readonly onSubmit: (body: string) => void;
  readonly onCancel: () => void;
}

export const CitySuggestionSheet: React.FC<CitySuggestionSheetProps> = ({
  visible,
  title,
  subtitle,
  placeholder,
  submitLabel,
  submittingLabel,
  cancelLabel,
  minLengthHint,
  submitting,
  onSubmit,
  onCancel,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [body, setBody] = useState('');

  // Clear the input every time the modal re-opens so a prior session's text
  // doesn't leak forward.
  useEffect(() => {
    if (visible) setBody('');
  }, [visible]);

  const trimmedLength = body.trim().length;
  const canSubmit =
    trimmedLength >= BODY_MIN_LENGTH && trimmedLength <= BODY_MAX_LENGTH && !submitting;
  const counterColor =
    body.length >= COUNTER_WARN_AT ? colors.caution : colors.textMuted;

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title={title}
      description={subtitle}
      footer={
        <View style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={() => onSubmit(body.trim())}
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
          <Button variant="ghost" size="md" onPress={onCancel}>
            {cancelLabel}
          </Button>
        </View>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.avoidingView}
      >
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={BODY_MAX_LENGTH}
          autoFocus
          autoCapitalize="sentences"
          autoCorrect
          textAlignVertical="top"
          accessibilityLabel={title}
          accessibilityHint={subtitle}
        />
        <View style={styles.metaRow}>
          {trimmedLength > 0 && trimmedLength < BODY_MIN_LENGTH ? (
            <Text style={styles.minHint}>{minLengthHint}</Text>
          ) : (
            <View style={styles.minHintPlaceholder} />
          )}
          <Text
            style={[styles.counter, { color: counterColor }]}
            accessibilityLiveRegion="polite"
          >
            {body.length} / {BODY_MAX_LENGTH}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    avoidingView: {
      width: '100%',
    },
    input: {
      ...textBase,
      minHeight: 120,
      maxHeight: 240,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      backgroundColor: colors.bgPrimary,
      color: colors.textPrimary,
      paddingHorizontal: space[3],
      paddingTop: space[3],
      paddingBottom: space[3],
      fontFamily: fontFamily.body.regular,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space[2],
    },
    minHint: {
      ...textXs,
      flex: 1,
      color: colors.caution,
      fontFamily: fontFamily.body.regular,
    },
    minHintPlaceholder: {
      flex: 1,
    },
    counter: {
      ...textXs,
      fontFamily: fontFamily.body.regular,
      fontVariant: ['tabular-nums'],
    },
    footer: {
      gap: space[2],
    },
  });
