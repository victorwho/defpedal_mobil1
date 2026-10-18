/**
 * "Ride it later" — the first-ride reminder (docs/plans/onboarding-first-ride.md
 * step 4 / [D6]).
 *
 * A LOCAL scheduled notification at a slot the rider picked, not a server
 * push: it is exact to their choice, needs no push token, and works for every
 * account. Timing is as inexact as the weather ping's (Android batches
 * `timeInterval` triggers under Doze, ±15 min) — accepted, never fixed with
 * SCHEDULE_EXACT_ALARM, which Play restricts.
 *
 * The payload carries everything a tap needs to reopen the route, so it works
 * even when the save to the account failed.
 */
import type { Coordinate, RoutingMode } from '@defensivepedal/core';
import { Platform } from 'react-native';

import { hasNotificationsNativeModule } from './notificationNativeModule';

export type ReminderSlot = 'tomorrow_morning' | 'tomorrow_evening' | 'weekend';
export const REMINDER_SLOTS: readonly ReminderSlot[] = ['tomorrow_morning', 'tomorrow_evening', 'weekend'];

export const REMINDER_NOTIFICATION_ID = 'first-ride-reminder';
export const REMINDER_NOTIFICATION_TYPE = 'first_ride_reminder';
const REMINDER_CHANNEL_ID = 'ride-reminder';

const MORNING_HOUR = 8;
const EVENING_HOUR = 18;
const WEEKEND_HOUR = 10;
/** A weekend slot must leave at least this long before it fires. */
const MIN_LEAD_MS = 2 * 60 * 60 * 1000;

const atLocal = (base: Date, dayOffset: number, hour: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/**
 * When a slot fires, in the device's local time. Day arithmetic goes through
 * `setDate` so a DST change in between cannot shift the hour.
 *
 * "This weekend" is the first Saturday or Sunday 10:00 at least two hours
 * away — on a Saturday afternoon that is Sunday, on a Sunday afternoon the
 * next Saturday.
 */
export const reminderFireAt = (slot: ReminderSlot, now: Date): Date => {
  if (slot === 'tomorrow_morning') return atLocal(now, 1, MORNING_HOUR);
  if (slot === 'tomorrow_evening') return atLocal(now, 1, EVENING_HOUR);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = atLocal(now, offset, WEEKEND_HOUR);
    const day = candidate.getDay();
    if ((day === 6 || day === 0) && candidate.getTime() - now.getTime() >= MIN_LEAD_MS) {
      return candidate;
    }
  }
  return atLocal(now, 7, WEEKEND_HOUR);
};

export const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export type ReminderTarget =
  | {
      readonly kind: 'route';
      readonly savedRouteId: string | null;
      readonly origin: Coordinate;
      readonly destination: Coordinate;
      readonly mode: RoutingMode;
      readonly avoidUnpaved: boolean;
      readonly isEbike: boolean;
    }
  | { readonly kind: 'loop'; readonly savedLoopId: string };

const isCoordinate = (value: unknown): value is Coordinate => {
  const c = value as Coordinate | null;
  return (
    typeof c === 'object' &&
    c !== null &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180
  );
};

/** Validate a tapped notification's payload; anything malformed opens nothing. */
export const parseReminderTarget = (data: unknown): ReminderTarget | null => {
  const d = data as Record<string, unknown> | null;
  if (!d || d.type !== REMINDER_NOTIFICATION_TYPE) return null;
  if (d.kind === 'loop') {
    return typeof d.savedLoopId === 'string' && d.savedLoopId.length > 0
      ? { kind: 'loop', savedLoopId: d.savedLoopId }
      : null;
  }
  if (d.kind !== 'route' || !isCoordinate(d.origin) || !isCoordinate(d.destination)) return null;
  const mode: RoutingMode = d.mode === 'fast' ? 'fast' : 'safe';
  return {
    kind: 'route',
    savedRouteId: typeof d.savedRouteId === 'string' ? d.savedRouteId : null,
    origin: { lat: d.origin.lat, lon: d.origin.lon },
    destination: { lat: d.destination.lat, lon: d.destination.lon },
    mode,
    avoidUnpaved: d.avoidUnpaved === true,
    isEbike: d.isEbike === true,
  };
};

// A tap on the reminder, remembered until the ride it leads to starts, so the
// goal event can say it came from the reminder ([D13]). In memory, and it
// EXPIRES: a rider who taps, backs out and rides something else an hour later
// was not brought back by the reminder.
export const REMINDER_TAP_WINDOW_MS = 30 * 60 * 1000;
let reminderTappedAt: number | null = null;
export const markReminderTapped = (now: number = Date.now()): void => {
  reminderTappedAt = now;
};
export const consumeReminderTapped = (now: number = Date.now()): boolean => {
  const tapped = reminderTappedAt !== null && now - reminderTappedAt <= REMINDER_TAP_WINDOW_MS;
  reminderTappedAt = null;
  return tapped;
};

export type ScheduleReminderResult = 'scheduled' | 'no_permission' | 'unavailable';

/**
 * Schedule (or replace) the single first-ride reminder. Only one exists at a
 * time — picking a new slot moves it.
 */
export const scheduleFirstRideReminder = async (input: {
  readonly fireAt: Date;
  readonly title: string;
  readonly body: string;
  readonly target: ReminderTarget;
  readonly ensurePermission: () => Promise<boolean>;
  readonly now?: Date;
}): Promise<ScheduleReminderResult> => {
  if (!hasNotificationsNativeModule()) return 'unavailable';
  let N: typeof import('expo-notifications');
  try {
    N = require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return 'unavailable';
  }
  if (!(await input.ensurePermission())) return 'no_permission';

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Ride reminders',
      importance: N.AndroidImportance.DEFAULT,
      description: 'Reminders for rides you planned',
    });
  }
  await N.cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID).catch(() => undefined);

  const now = input.now ?? new Date();
  const seconds = Math.max(60, Math.floor((input.fireAt.getTime() - now.getTime()) / 1000));
  await N.scheduleNotificationAsync({
    identifier: REMINDER_NOTIFICATION_ID,
    content: {
      title: input.title,
      body: input.body,
      sound: 'default',
      data: { type: REMINDER_NOTIFICATION_TYPE, ...input.target },
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: 'timeInterval' as never, seconds, repeats: false },
  });
  return 'scheduled';
};
