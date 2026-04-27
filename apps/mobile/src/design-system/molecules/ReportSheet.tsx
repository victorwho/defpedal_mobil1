/**
 * Design System v1.0 — ReportSheet Molecule
 *
 * Compliance plan item 7. UGC moderation entry point — invoked from
 * FeedCard / comment row / hazard detail sheet overflow menus.
 *
 * Composes the Modal organism (PR #24) for the centered card + backdrop.
 * Reason picker as Pressable chips, free-text details (≤500 chars).
 * Fires haptics.warning() on submit, success() on completion.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Modal } from '../organisms/Modal';
import { Button } from '../atoms';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textBase, textSm } from '../tokens/typography';
import {
  useReportContent,
  type ReportReason,
  type ReportTargetType,
} from '../../hooks/useReportContent';
import { useT } from '../../hooks/useTranslation';

const REASON_KEYS: readonly { reason: ReportReason; labelKey: string }[] = [
  { reason: 'spam', labelKey: 'report.reasonSpam' },
  { reason: 'harassment', labelKey: 'report.reasonHarassment' },
  { reason: 'hate', labelKey: 'report.reasonHate' },
  { reason: 'sexual', labelKey: 'report.reasonSexual' },
  { reason: 'violence', labelKey: 'report.reasonViolence' },
  { reason: 'illegal', labelKey: 'report.reasonIllegal' },
  { reason: 'other', labelKey: 'report.reasonOther' },
] as const;

export interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** Called after the report is accepted by the server. Use to update local UI (optimistic hide). */
  onReported?: () => void;
}

export const ReportSheet: React.FC<ReportSheetProps> = ({
  visible,
  onClose,
  targetType,
  targetId,
  onReported,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const haptics = useHaptics();
  const reportMutation = useReportContent();

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  const reset = useCallback(() => {
    setSelectedReason(null);
    setDetails('');
    reportMutation.reset();
  }, [reportMutation]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(() => {
    if (!selectedReason || reportMutation.isPending) return;

    haptics.warning();

    reportMutation.mutate(
      {
        targetType,
        targetId,
        reason: selectedReason,
        details: details.trim() ? details.trim().slice(0, 500) : undefined,
      },
      {
        onSuccess: () => {
          haptics.success();
          onReported?.();
          Alert.alert(t('report.successTitle'), t('report.successMessage'), [
            { text: 'OK', onPress: handleClose },
          ]);
        },
        onError: (err) => {
          const message =
            err instanceof Error && err.message.toLowerCase().includes('already reported')
              ? t('report.alreadyReported')
              : t('report.errorMessage');
          haptics.error();
          Alert.alert(t('report.errorTitle'), message);
        },
      },
    );
  }, [
    selectedReason,
    targetType,
    targetId,
    details,
    haptics,
    reportMutation,
    onReported,
    handleClose,
    t,
  ]);

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title={t('report.title')}
      description={t('report.subtitle')}
      footer={
        <View style={styles.footerRow}>
          <Button variant="secondary" onPress={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmit}
            disabled={!selectedReason || reportMutation.isPending}
            loading={reportMutation.isPending}
          >
            {t('report.submit')}
          </Button>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>{t('report.reasonLabel')}</Text>
        <View style={styles.reasonChips}>
          {REASON_KEYS.map(({ reason, labelKey }) => {
            const selected = reason === selectedReason;
            return (
              <Pressable
                key={reason}
                onPress={() => {
                  haptics.light();
                  setSelectedReason(reason);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(labelKey)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>{t('report.detailsLabel')}</Text>
        <TextInput
          style={styles.detailsInput}
          value={details}
          onChangeText={setDetails}
          placeholder={t('report.detailsPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={500}
          editable={!reportMutation.isPending}
          accessibilityLabel={t('report.detailsLabel')}
        />
        <Text style={styles.charCount}>{details.length} / 500</Text>
      </View>
    </Modal>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    body: {
      gap: space[3],
      paddingVertical: space[2],
    },
    sectionLabel: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    reasonChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    chip: {
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
    },
    chipSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      ...textSm,
      color: colors.textPrimary,
    },
    chipTextSelected: {
      color: colors.bgPrimary,
      fontFamily: fontFamily.body.semiBold,
    },
    detailsInput: {
      ...textBase,
      minHeight: 80,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      backgroundColor: colors.bgSecondary,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    charCount: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'right',
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: space[2],
    },
  });
