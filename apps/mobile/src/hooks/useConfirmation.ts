import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useT } from './useTranslation';

interface ConfirmationOptions {
  /** Alert title */
  readonly title: string;
  /** Alert message body */
  readonly message: string;
  /** Label for the confirm button (defaults to title) */
  readonly confirmLabel?: string;
  /** Button style: 'destructive' (red) or 'default' */
  readonly confirmStyle?: 'destructive' | 'default';
  /** Label for the cancel button (defaults to i18n common.cancel) */
  readonly cancelLabel?: string;
  /** Called when user taps confirm */
  readonly onConfirm: () => void;
  /** Called when user taps cancel (optional) */
  readonly onCancel?: () => void;
}

/**
 * Returns a `confirm()` function that shows a native Alert dialog
 * with Cancel + Confirm buttons.
 *
 * Usage:
 *   const confirm = useConfirmation();
 *   confirm({
 *     title: 'End ride?',
 *     message: 'Your progress will be saved.',
 *     confirmLabel: 'End Ride',
 *     confirmStyle: 'destructive',
 *     onConfirm: () => { ... },
 *   });
 */
export const useConfirmation = () => {
  const t = useT();

  return useCallback(
    (options: ConfirmationOptions) => {
      const {
        title,
        message,
        confirmLabel,
        confirmStyle = 'destructive',
        cancelLabel,
        onConfirm,
        onCancel,
      } = options;

      Alert.alert(title, message, [
        {
          text: cancelLabel ?? t('common.cancel'),
          style: 'cancel',
          onPress: onCancel,
        },
        {
          text: confirmLabel ?? title,
          style: confirmStyle,
          onPress: onConfirm,
        },
      ]);
    },
    [t],
  );
};
