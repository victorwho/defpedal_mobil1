import type { Coordinate, MeasurementSystem, RouteOption, RoutingMode } from '@defensivepedal/core';
import { formatDistance } from '@defensivepedal/core';
import { useCallback, useRef, useState } from 'react';

import { mobileApi } from '../lib/api';
import {
  fetchForecastForDate,
  scheduleDailyWeatherNotifications,
} from '../lib/daily-weather-notification';
import {
  reminderFireAt,
  scheduleFirstRideReminder,
  type ReminderSlot,
  type ReminderTarget,
} from '../lib/firstRideReminder';
import { writeSavedLoop } from '../lib/loopStorage';
import { ensureNotificationPermissionAsync } from '../lib/push-notifications';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';
import { useT } from './useTranslation';
import { useUnits } from './useUnits';

export type RideLaterSubject =
  | {
      readonly kind: 'route';
      readonly origin: Coordinate;
      readonly destination: Coordinate;
      readonly mode: RoutingMode;
      readonly avoidUnpaved: boolean;
      readonly avoidHills: boolean;
      readonly avoidHeat: boolean;
      readonly isEbike: boolean;
    }
  | {
      readonly kind: 'loop';
      readonly start: Coordinate;
      readonly route: RouteOption;
      readonly distanceMeters: number;
      readonly climbMeters: number | null;
      readonly unpavedShare: number;
    };

export type RideLaterStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'set'; readonly slot: ReminderSlot }
  | { readonly kind: 'no_permission' }
  | { readonly kind: 'failed' };

/**
 * "Ride it later" (docs/plans/onboarding-first-ride.md step 4 / [D6]): save
 * the route to the account, then schedule a local reminder for the chosen
 * slot with that day's weather in it.
 *
 * Route: a failed save still schedules — the reminder carries the route itself.
 * Loop: the reminder reopens the SAVED loop, so a failed save is a failure.
 * Declined notification permission keeps the save and says so.
 */
export const useRideLater = (subject: RideLaterSubject | null) => {
  const t = useT();
  const units = useUnits();
  const [status, setStatus] = useState<RideLaterStatus>({ kind: 'idle' });
  // A ref, not the status: two fast taps both read a stale 'idle' closure and
  // would save the route twice.
  const inFlightRef = useRef(false);

  const choose = useCallback(
    async (slot: ReminderSlot) => {
      if (!subject || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await runRideLater({ slot, subject, t, units, setStatus });
      } finally {
        inFlightRef.current = false;
      }
    },
    [subject, t, units],
  );

  /** Back to the slot choice, e.g. to retry after notifications were declined. */
  const reset = useCallback(() => {
    if (!inFlightRef.current) setStatus({ kind: 'idle' });
  }, []);

  return { status, choose, reset };
};

const runRideLater = async ({
  slot,
  subject,
  t,
  units,
  setStatus,
}: {
  slot: ReminderSlot;
  subject: RideLaterSubject;
  t: (key: string, vars?: Record<string, string | number>) => string;
  units: MeasurementSystem;
  setStatus: (status: RideLaterStatus) => void;
}): Promise<void> => {
  setStatus({ kind: 'busy' });
  const now = new Date();
  const fireAt = reminderFireAt(slot, now);

  let target: ReminderTarget;
  const where = subject.kind === 'route' ? subject.origin : subject.start;
  if (subject.kind === 'route') {
    const saved = await mobileApi
      .saveRoute({
        name: t('onboardingRide.savedRouteName'),
        origin: subject.origin,
        destination: subject.destination,
        waypoints: [],
        mode: subject.mode,
        avoidUnpaved: subject.avoidUnpaved,
        avoidHills: subject.avoidHills,
        avoidHeat: subject.avoidHeat,
        isEbike: subject.isEbike,
      })
      .catch(() => null);
    target = {
      kind: 'route',
      savedRouteId: saved?.id ?? null,
      origin: subject.origin,
      destination: subject.destination,
      mode: subject.mode,
      avoidUnpaved: subject.avoidUnpaved,
      isEbike: subject.isEbike,
    };
  } else {
    // Same order as loop-planner: the account first (its id keys
    // everything), then the full-fidelity local cache.
    const saved = await mobileApi
      .saveLoop({
        name: t('loop.nameFallback', {
          distance: formatDistance(subject.distanceMeters, units),
        }),
        start: subject.start,
        route: subject.route,
        distanceMeters: subject.distanceMeters,
        climbMeters: subject.climbMeters,
        unpavedShare: subject.unpavedShare,
      })
      .catch(() => null);
    if (!saved) {
      setStatus({ kind: 'failed' });
      telemetry.capture('onb_ride_later', {
        slot,
        isLoop: true,
        outcome: 'save_failed',
      });
      return;
    }
    void writeSavedLoop(saved.id, {
      route: subject.route,
      start: subject.start,
    });
    useAppStore.getState().addSavedLoop({
      id: saved.id,
      name: saved.name,
      distanceMeters: saved.distanceMeters,
      climbMeters: saved.climbMeters,
      unpavedShare: saved.unpavedShare,
      createdAt: saved.createdAt,
    });
    target = { kind: 'loop', savedLoopId: saved.id };
  }

  const forecast = await fetchForecastForDate(where.lat, where.lon, fireAt, now).catch(() => null);
  const body = forecast
    ? t('onboardingRide.reminderBody', {
        weather: t('onboardingRide.reminderWeather', {
          temp: Math.round(forecast.tempMax),
          rain: Math.round(forecast.precipitationProbability),
        }),
      })
    : t('onboardingRide.reminderBodyNoWeather');

  const result = await scheduleFirstRideReminder({
    fireAt,
    title: t('onboardingRide.reminderTitle'),
    body,
    target,
    ensurePermission: ensureNotificationPermissionAsync,
    now,
  }).catch(() => 'unavailable' as const);

  telemetry.capture('onb_ride_later', {
    slot,
    isLoop: subject.kind === 'loop',
    outcome: result,
  });
  if (result !== 'scheduled') {
    setStatus({ kind: 'no_permission' });
    return;
  }
  useAppStore.getState().setFirstRideReminderAt(fireAt.toISOString());
  // Drop any weather ping already queued for that day (see the scheduler).
  if (useAppStore.getState().notifyWeather) {
    void scheduleDailyWeatherNotifications(where.lat, where.lon).catch(() => undefined);
  }
  setStatus({ kind: 'set', slot });
};
