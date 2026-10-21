import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { mobileApi } from './api';
import {
  REMINDER_NOTIFICATION_TYPE,
  markReminderTapped,
  parseReminderTarget,
} from './firstRideReminder';
import { COMMUTE_NOTIFICATION_TYPE, parseCommuteTarget } from './commute-notification';
import { hasNotificationsNativeModule } from './notificationNativeModule';
import { telemetry } from './telemetry';
import { useAppStore } from '../store/appStore';

let _notifications: typeof import('expo-notifications') | null | undefined;
const getNotifications = () => {
  if (!hasNotificationsNativeModule()) return null;
  if (_notifications !== undefined) return _notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _notifications = require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    _notifications = null;
  }
  return _notifications;
};

/**
 * Configure foreground notification behavior.
 * Must be called once at app startup.
 */
export const configureNotificationHandler = () => {
  const N = getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

/**
 * Ensure the OS notification permission is granted, prompting the user once
 * if it hasn't been decided yet. Safe to call on every app open — it never
 * re-prompts after the user has permanently denied (canAskAgain === false),
 * so it won't spam the system dialog.
 *
 * Returns true only when permission is currently granted.
 */
export const ensureNotificationPermissionAsync = async (): Promise<boolean> => {
  const N = getNotifications();
  if (!N) return false;

  const { status: existingStatus, canAskAgain } = await N.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  if (!canAskAgain) return false;

  const { status } = await N.requestPermissionsAsync();
  return status === 'granted';
};

/**
 * Pure gate for push-token registration (2026-07-16, consent-gated anonymous
 * push). Register when a session exists (anonymous OR full) AND the user is
 * either a full account (today's behavior, zero regression) or an anonymous
 * user who explicitly opted into "Riding tips & reminders". The OS-permission
 * condition is enforced inside `registerForPushNotifications` itself
 * (ensureNotificationPermissionAsync — unchanged).
 *
 * Historical note: there was never an anonymous gate here — 323 of 439
 * production tokens belonged to anonymous users when this shipped. This gate
 * makes anonymous registration lawful (consent) rather than enabling it.
 */
export const shouldRegisterPushToken = (input: {
  hasSession: boolean;
  isAnonymous: boolean;
  notifyRidingTips: boolean;
}): boolean => {
  if (!input.hasSession) return false;
  if (!input.isAnonymous) return true;
  return input.notifyRidingTips;
};

/**
 * Consent-aware registration entry point. Reads the riding-tips opt-in from
 * the store at call time; the caller supplies the session facts.
 */
export const registerForPushNotificationsIfEligible = async (input: {
  hasSession: boolean;
  isAnonymous: boolean;
}): Promise<string | null> => {
  const eligible = shouldRegisterPushToken({
    ...input,
    notifyRidingTips: useAppStore.getState().notifyRidingTips,
  });
  if (!eligible) return null;
  return registerForPushNotifications();
};

/**
 * Register for push notifications, request permission, get Expo push token,
 * and send it to the server.
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
  const N = getNotifications();
  if (!N) return null;

  // Check/request permission (prompts once if undecided)
  const granted = await ensureNotificationPermissionAsync();
  if (!granted) {
    return null;
  }

  // Android: set notification channel
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'Defensive Pedal',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FACC15',
    });
  }

  // Get Expo push token — requires EAS project ID
  let expoPushToken: string | null = null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await N.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    expoPushToken = tokenData.data;
  } catch {
    // Token registration fails without EAS project ID — permission still granted
    return null;
  }

  if (!expoPushToken) return null;

  // Register token with server
  try {
    const deviceId = Device.modelId ?? Device.deviceName ?? 'unknown-device';
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    await mobileApi.registerPushToken(expoPushToken, deviceId, platform);
  } catch {
    // Token registration failure is non-fatal
  }

  return expoPushToken;
};

/**
 * Unregister push token from server (call on sign-out).
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const deviceId = Device.modelId ?? Device.deviceName ?? 'unknown-device';
    await mobileApi.unregisterPushToken(deviceId);
  } catch {
    // Non-fatal
  }
};

/**
 * Where a notification leads when the rider acts on it: 'route' when it opens
 * a specific route (commute briefing, first-ride reminder), 'open' for any
 * other destination, null when there is nowhere specific to go. Drives the
 * action button on the in-app notice.
 */
export const notificationActionKind = (
  data: Record<string, unknown> | null | undefined,
): 'route' | 'open' | null => {
  if (!data) return null;
  if (typeof data.deepLink === 'string' && data.deepLink.startsWith('/')) return 'open';
  switch (data.type) {
    case COMMUTE_NOTIFICATION_TYPE:
      return parseCommuteTarget(data) ? 'route' : 'open';
    case REMINDER_NOTIFICATION_TYPE:
      return parseReminderTarget(data) ? 'route' : 'open';
    case 'community':
      return data.tripShareId ? 'open' : null;
    case 'follow_request':
    case 'weekly_summary':
    case 'first_ride':
    case 'activation_ladder':
    case 'hazard':
    case 'weather':
    case 'daily-weather':
    case 'city_riders_pulse':
    case 'nudge':
      return 'open';
    default:
      return null;
  }
};

/** Tap-time side effects: they record the TAP, whatever the rider does next. */
const recordNotificationTap = (data: Record<string, unknown>): void => {
  switch (data.type) {
    case REMINDER_NOTIFICATION_TYPE: {
      const target = parseReminderTarget(data);
      telemetry.capture('onb_reminder_tapped', { kind: target?.kind ?? 'invalid' });
      if (target) markReminderTapped();
      break;
    }
    case COMMUTE_NOTIFICATION_TYPE:
      telemetry.capture('commute_briefing_tapped', {
        direction: parseCommuteTarget(data)?.direction ?? 'invalid',
      });
      break;
    case 'nudge': {
      // Pedal Nudge tap (review 2026-06-12 item 23): report the tap so the
      // attribution sweep can close the funnel.
      const nudgeLogId = typeof data.nudgeLogId === 'string' ? data.nudgeLogId : null;
      if (nudgeLogId) {
        void mobileApi.postNudgeTelemetry(nudgeLogId, 'tapped').catch(() => {
          // Non-fatal — the server-side 2h attribution sweep is the backstop.
        });
      }
      break;
    }
    default:
      break;
  }
};

/**
 * Go where a notification leads. Called straight from a tap when there is
 * nothing to show, otherwise from the in-app notice's action button.
 */
export const performNotificationAction = (data: Record<string, unknown> | null | undefined): void => {
  // Audit 2026-07-05 UX-5: honor an explicit deep link generically so senders
  // that ship `deepLink` (e.g. ambassador referral pushes → '/my-shares')
  // land somewhere useful even without a dedicated case below. Must run
  // BEFORE the `type` bail — the referral payloads carry no `type`.
  if (data && typeof data.deepLink === 'string' && data.deepLink.startsWith('/')) {
    router.push(data.deepLink as never);
    return;
  }

  if (!data?.type) return;

  switch (data.type) {
    case 'community':
      if (data.tripShareId) {
        router.push('/community-feed');
      }
      break;
    // Audit 2026-07-05 UX-5: previously-unhandled high-intent taps.
    case 'follow_request':
      // Follow requests are managed from the profile surface.
      router.push('/profile');
      break;
    case 'weekly_summary':
      router.push(
        typeof data.screen === 'string' ? (`/${data.screen.replace(/^\//, '')}` as never) : '/impact-dashboard',
      );
      break;
    case 'first_ride':
      router.push('/route-planning');
      break;
    case 'activation_ladder':
      // Anonymous activation ladder (docs/plans/anonymous-activation-ladder.md):
      // all rungs land on route planning — the plan-framed copy promises a
      // route/score, and this is where both live.
      router.push('/route-planning');
      break;
    case 'hazard':
    case 'weather':
    case 'daily-weather':
    // City Riders Pulse (docs/plans/city-riders-pulse-notification.md): the
    // ask is "join them?" — land on route planning.
    case 'city_riders_pulse':
      router.push('/route-planning');
      break;
    // First-ride reminder ("Ride it later", docs/plans/onboarding-first-ride.md
    // step 4): reopen exactly the route or loop the rider saved. The payload
    // is validated, since it is replayed into routing.
    case REMINDER_NOTIFICATION_TYPE: {
      const target = parseReminderTarget(data);
      if (!target) {
        router.push('/route-planning');
        break;
      }
      // Never pull a rider out of a ride in progress.
      if (useAppStore.getState().appState === 'NAVIGATING') break;
      if (target.kind === 'loop') {
        router.push({ pathname: '/loop-planner', params: { loopId: target.savedLoopId } } as never);
        break;
      }
      useAppStore.getState().setRouteRequest({
        origin: target.origin,
        destination: target.destination,
        waypoints: [],
        startOverride: undefined,
        mode: target.mode,
        avoidUnpaved: target.avoidUnpaved,
        avoidHills: false,
        avoidHeat: false,
        isEbike: target.isEbike,
      });
      // After setRouteRequest, which clears the saved-route lineage.
      if (target.savedRouteId) useAppStore.getState().setLastLoadedSavedRouteId(target.savedRouteId);
      router.push('/route-preview');
      break;
    }
    // Commute briefing (docs/plans/commute-mode.md): the Safe route the
    // briefing described, with the rider's current bike preferences. Hazards
    // are fetched live by route preview.
    case COMMUTE_NOTIFICATION_TYPE: {
      const target = parseCommuteTarget(data);
      if (!target) {
        router.push('/route-planning');
        break;
      }
      const state = useAppStore.getState();
      if (state.appState === 'NAVIGATING') break;
      state.setRouteRequest({
        origin: target.origin,
        destination: target.destination,
        waypoints: [],
        startOverride: undefined,
        mode: 'safe',
        avoidUnpaved: state.avoidUnpaved,
        avoidHills: false,
        avoidHeat: false,
        isEbike: state.isEbike,
      });
      router.push('/route-preview');
      break;
    }
    case 'nudge': {
      // Route by trigger: celebrations to the impact dashboard, everything
      // else (ride-asking streak/reminder nudges) to route-planning.
      const triggerId = typeof data.triggerId === 'string' ? data.triggerId : '';
      if (
        triggerId === 'milestone_celebration' ||
        triggerId === 'post_ride_celebration' ||
        triggerId === 'post_hazard_thanks' ||
        triggerId === 'community_signal'
      ) {
        router.push('/impact-dashboard');
      } else {
        router.push('/route-planning');
      }
      break;
    }
    default:
      break;
  }
};

/**
 * Handle a notification tap. The system shade truncates long text, so a
 * notification with visible text is re-shown in full in-app first
 * (`NotificationNoticeManager` in app/_layout.tsx); its action button then
 * goes where the notification leads. One with nothing to show acts at once.
 */
export const handleNotificationResponse = (
  response: any,
): void => {
  const content = response?.notification?.request?.content as
    | { title?: unknown; body?: unknown; data?: unknown }
    | undefined;
  const data =
    content?.data && typeof content.data === 'object' ? (content.data as Record<string, unknown>) : null;
  if (data) recordNotificationTap(data);

  // Local weather pings carry their text in `data` as well; use either.
  const pick = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const title = pick(content?.title) || pick(data?.title);
  const body = pick(content?.body) || pick(data?.body);
  if (!title && !body) {
    performNotificationAction(data);
    return;
  }

  useAppStore.getState().setNotificationNotice({
    title,
    body,
    tone: data?.tone === 'caution' ? 'caution' : 'good',
    data,
  });
  // Land on the map under the notice. On a cold start the notice would
  // otherwise mount over a still-loading `app/index.tsx`, whose `<Redirect>`
  // can drop silently when an overlay is up (user "stuck at loading screen").
  // Never during a ride: the notice waits until the ride ends.
  if (useAppStore.getState().appState !== 'NAVIGATING') router.push('/route-planning');
};
