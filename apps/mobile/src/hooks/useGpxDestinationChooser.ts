/**
 * useGpxDestinationChooser — picks where an exported GPX goes.
 *
 * When the Garmin Connect app is installed (Android), tapping an export
 * button offers "Send to Garmin Connect" (explicit intent — Garmin's
 * course-import screen opens directly, then auto-syncs to the watch) or
 * the ordinary save/share sheet. Without Garmin the chooser is invisible:
 * the callback fires immediately with 'share', preserving the one-tap flow.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { isGarminConnectInstalled } from '../lib/garmin';
import { useT } from './useTranslation';

export type GpxDestination = 'share' | 'garmin';

export interface UseGpxDestinationChooserReturn {
  readonly chooseGpxDestination: (
    onChoose: (target: GpxDestination) => void,
  ) => void;
}

export function useGpxDestinationChooser(): UseGpxDestinationChooserReturn {
  const t = useT();
  const [garminAvailable, setGarminAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isGarminConnectInstalled().then((installed) => {
      if (!cancelled) setGarminAvailable(installed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseGpxDestination = useCallback<
    UseGpxDestinationChooserReturn['chooseGpxDestination']
  >(
    (onChoose) => {
      if (!garminAvailable) {
        onChoose('share');
        return;
      }
      Alert.alert(t('preview.exportDestinationTitle'), undefined, [
        {
          text: t('preview.exportToGarmin'),
          onPress: () => onChoose('garmin'),
        },
        {
          text: t('preview.exportShareFile'),
          onPress: () => onChoose('share'),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [garminAvailable, t],
  );

  return { chooseGpxDestination };
}
