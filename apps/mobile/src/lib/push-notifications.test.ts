import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-device
vi.mock('expo-device', () => ({
  default: {},
  modelId: 'test-device-model',
  deviceName: 'Test Device',
}));

// Mock expo-constants
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'test-project-id' },
      },
    },
  },
}));

// Mock expo-router
vi.mock('expo-router', () => ({
  router: {
    push: vi.fn(),
  },
}));

// Mock expo-modules-core so the native-module probe deterministically reports
// "absent" under node (an unmocked import throws a __DEV__ reference error).
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => null,
}));

// Mock the api module
vi.mock('./api', () => ({
  mobileApi: {
    registerPushToken: vi.fn().mockResolvedValue({ ok: true }),
    unregisterPushToken: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import {
  handleNotificationResponse,
  notificationActionKind,
  performNotificationAction,
  unregisterPushToken,
  configureNotificationHandler,
  registerForPushNotifications,
  ensureNotificationPermissionAsync,
  shouldRegisterPushToken,
} from './push-notifications';
import { router } from 'expo-router';
import { mobileApi } from './api';
import { useAppStore } from '../store/appStore';

describe('push-notifications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('native module guard', () => {
    it('configureNotificationHandler is a no-op when native module is absent', () => {
      // NativeModules from vitest.setup.ts is empty {}, so hasNotificationsNative = false
      configureNotificationHandler();
    });

    it('registerForPushNotifications returns null when native module is absent', async () => {
      const result = await registerForPushNotifications();
      expect(result).toBeNull();
    });

    it('ensureNotificationPermissionAsync returns false when native module is absent', async () => {
      const granted = await ensureNotificationPermissionAsync();
      expect(granted).toBe(false);
    });
  });

  describe('handleNotificationResponse', () => {
    it('navigates to community-feed for community notification with tripShareId', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: { type: 'community', tripShareId: 'share-123' },
            },
          },
        },
      });

      expect(router.push).toHaveBeenCalledWith('/community-feed');
    });

    it('navigates to route-planning for hazard notification', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: { type: 'hazard' },
            },
          },
        },
      });

      expect(router.push).toHaveBeenCalledWith('/route-planning');
    });

    it('navigates to route-planning for weather notification', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: { type: 'weather' },
            },
          },
        },
      });

      expect(router.push).toHaveBeenCalledWith('/route-planning');
    });

    it('does nothing for unknown notification type', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: { type: 'unknown_type' },
            },
          },
        },
      });

      expect(router.push).not.toHaveBeenCalled();
    });

    it('does nothing when data has no type', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: {},
            },
          },
        },
      });

      expect(router.push).not.toHaveBeenCalled();
    });

    it('does nothing when data is undefined', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: undefined,
            },
          },
        },
      });

      expect(router.push).not.toHaveBeenCalled();
    });

    it('shows a daily-weather tap in full, from its data payload', () => {
      useAppStore.getState().clearNotificationNotice();

      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: {
                type: 'daily-weather',
                title: 'Perfect day to ride',
                body: '18-24°C, clear skies.',
                tone: 'good',
              },
            },
          },
        },
      });

      expect(useAppStore.getState().notificationNotice).toMatchObject({
        title: 'Perfect day to ride',
        body: '18-24°C, clear skies.',
        tone: 'good',
      });
      // Must also navigate to a real screen — the modal would otherwise mount
      // over a still-loading app/index.tsx on cold start and the user gets
      // stuck at the loading screen (see push-notifications.ts comment).
      expect(router.push).toHaveBeenCalledWith('/route-planning');
    });

    it('does not navigate for community type without tripShareId', () => {
      handleNotificationResponse({
        notification: {
          request: {
            content: {
              data: { type: 'community' },
            },
          },
        },
      });

      expect(router.push).not.toHaveBeenCalled();
    });
  });

  describe('show the notification first', () => {
    const HOME = { lat: 44.43, lon: 26.1 };
    const WORK = { lat: 44.45, lon: 26.08 };
    const commuteData = { type: 'commute', direction: 'to_work', origin: HOME, destination: WORK, tone: 'good' };
    const tap = (content: Record<string, unknown>) =>
      handleNotificationResponse({ notification: { request: { content } } });

    beforeEach(() => {
      vi.mocked(router.push).mockClear();
      useAppStore.getState().clearNotificationNotice();
      useAppStore.setState({ appState: 'IDLE' });
    });

    it('a tap with text shows it in full and does not act yet', () => {
      tap({ title: 'Your 08:00 ride to work', body: 'Long body text', data: commuteData });
      expect(useAppStore.getState().notificationNotice).toEqual({
        title: 'Your 08:00 ride to work',
        body: 'Long body text',
        tone: 'good',
        data: commuteData,
      });
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith('/route-planning');
    });

    it('server pushes are shown too (title and body on the content)', () => {
      tap({ title: 'Streak at risk', body: 'Ride today', data: { type: 'nudge', triggerId: 'streak_at_risk_mild' } });
      expect(useAppStore.getState().notificationNotice?.title).toBe('Streak at risk');
    });

    it('does not navigate during a ride; the notice waits', () => {
      useAppStore.setState({ appState: 'NAVIGATING' });
      tap({ title: 'T', body: 'B', data: commuteData });
      expect(router.push).not.toHaveBeenCalled();
      expect(useAppStore.getState().notificationNotice?.title).toBe('T');
    });

    it('the commute action opens route preview for the briefing route', () => {
      useAppStore.setState({ avoidUnpaved: true, isEbike: false });
      performNotificationAction(commuteData);
      expect(useAppStore.getState().routeRequest).toMatchObject({
        origin: HOME,
        destination: WORK,
        mode: 'safe',
        avoidUnpaved: true,
      });
      expect(router.push).toHaveBeenCalledWith('/route-preview');
    });

    it('an invalid commute payload falls back to route planning', () => {
      performNotificationAction({ ...commuteData, origin: { lat: 999, lon: 0 } });
      expect(router.push).toHaveBeenCalledWith('/route-planning');
    });

    it('the commute action never interrupts a ride', () => {
      useAppStore.setState({ appState: 'NAVIGATING' });
      performNotificationAction(commuteData);
      expect(router.push).not.toHaveBeenCalled();
    });

    it.each([
      [commuteData, 'route'],
      [{ ...commuteData, origin: null }, 'open'],
      [{ type: 'daily-weather' }, 'open'],
      [{ deepLink: '/my-shares' }, 'open'],
      [{ type: 'community' }, null],
      [{ type: 'unknown' }, null],
      [null, null],
    ])('notificationActionKind(%j) = %s', (data, kind) => {
      expect(notificationActionKind(data as Record<string, unknown> | null)).toBe(kind);
    });
  });

  describe('unregisterPushToken', () => {
    it('calls API unregister without throwing', async () => {
      await unregisterPushToken();

      expect(mobileApi.unregisterPushToken).toHaveBeenCalledWith('test-device-model');
    });

    it('does not throw on API failure', async () => {
      vi.mocked(mobileApi.unregisterPushToken).mockRejectedValueOnce(new Error('Server error'));

      await expect(unregisterPushToken()).resolves.toBeUndefined();
    });
  });
});

describe('shouldRegisterPushToken (consent-gated anonymous push, 2026-07-16)', () => {
  it('never registers without a session', () => {
    expect(
      shouldRegisterPushToken({ hasSession: false, isAnonymous: false, notifyRidingTips: true }),
    ).toBe(false);
    expect(
      shouldRegisterPushToken({ hasSession: false, isAnonymous: true, notifyRidingTips: true }),
    ).toBe(false);
  });

  it('full accounts register regardless of the riding-tips opt-in (zero regression)', () => {
    expect(
      shouldRegisterPushToken({ hasSession: true, isAnonymous: false, notifyRidingTips: false }),
    ).toBe(true);
    expect(
      shouldRegisterPushToken({ hasSession: true, isAnonymous: false, notifyRidingTips: true }),
    ).toBe(true);
  });

  it('anonymous sessions register ONLY with the riding-tips opt-in ON', () => {
    expect(
      shouldRegisterPushToken({ hasSession: true, isAnonymous: true, notifyRidingTips: false }),
    ).toBe(false);
    expect(
      shouldRegisterPushToken({ hasSession: true, isAnonymous: true, notifyRidingTips: true }),
    ).toBe(true);
  });
});

describe('handleNotificationResponse — first-ride reminder', () => {
  const tap = (data: Record<string, unknown>) =>
    handleNotificationResponse({ notification: { request: { content: { data } } } });

  const routeData = {
    type: 'first_ride_reminder',
    kind: 'route',
    savedRouteId: 'saved-1',
    origin: { lat: 44.43, lon: 26.1 },
    destination: { lat: 44.45, lon: 26.08 },
    mode: 'safe',
    avoidUnpaved: true,
    isEbike: false,
  };

  beforeEach(() => {
    vi.mocked(router.push).mockClear();
    useAppStore.setState({ appState: 'IDLE', lastLoadedSavedRouteId: null });
  });

  it('reopens the saved route in preview', () => {
    tap(routeData);

    const request = useAppStore.getState().routeRequest;
    expect(request.origin).toEqual({ lat: 44.43, lon: 26.1 });
    expect(request.destination).toEqual({ lat: 44.45, lon: 26.08 });
    expect(useAppStore.getState().lastLoadedSavedRouteId).toBe('saved-1');
    expect(router.push).toHaveBeenCalledWith('/route-preview');
  });

  it('reopens a saved loop in the loop planner', () => {
    tap({ type: 'first_ride_reminder', kind: 'loop', savedLoopId: 'loop-9' });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/loop-planner', params: { loopId: 'loop-9' } });
  });

  it('ignores a malformed payload instead of routing to it', () => {
    tap({ ...routeData, destination: { lat: 999, lon: 0 } });
    expect(router.push).toHaveBeenCalledWith('/route-planning');
    expect(router.push).not.toHaveBeenCalledWith('/route-preview');
  });

  it('never interrupts a ride in progress', () => {
    useAppStore.setState({ appState: 'NAVIGATING' });
    tap(routeData);
    expect(router.push).not.toHaveBeenCalled();
  });
});
