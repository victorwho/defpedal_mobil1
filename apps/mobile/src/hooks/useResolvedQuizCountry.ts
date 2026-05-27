import {
  resolveQuizCountry,
  type QuizCountry,
  type QuizCountrySource,
} from '@defensivepedal/core';
import { useMemo } from 'react';

import { getDeviceRegion } from '../i18n';
import { useAppStore } from '../store/appStore';

import { useCurrentLocation } from './useCurrentLocation';

export interface ResolvedQuizCountry {
  readonly country: QuizCountry;
  readonly source: QuizCountrySource;
}

/**
 * Resolve which quiz pool (RO or ES) to serve the current rider.
 *
 * Composite policy (delegated to `resolveQuizCountry` in core):
 *   1. Profile override (`'RO'` / `'ES'`) wins.
 *   2. GPS bbox lookup (covers RO mainland, ES mainland + Balearics + Canary).
 *   3. Device-locale region (`'RO'` / `'ES'`).
 *   4. Default to `'RO'`.
 *
 * The `source` field is purely informational — useful for surfacing
 * "Auto · detected: Spain" in the Profile picker subtitle and for telemetry.
 */
export const useResolvedQuizCountry = (): ResolvedQuizCountry => {
  const preference = useAppStore((state) => state.quizCountryPreference);
  const { location } = useCurrentLocation();

  return useMemo(
    () =>
      resolveQuizCountry({
        preference,
        coords: location ? { lat: location.lat, lon: location.lon } : null,
        deviceLocaleRegion: getDeviceRegion(),
      }),
    [preference, location],
  );
};
