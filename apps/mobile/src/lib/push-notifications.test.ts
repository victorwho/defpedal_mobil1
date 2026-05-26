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
  unregisterPushToken,
  configureNotificationHandler,
  registerForPushNotifications,
  ensureNotificationPermissionAsync,
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

    it('sets weatherNotice in the store for a daily-weather tap', () => {
      useAppStore.getState().clearWeatherNotice();

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

      expect(useAppStore.getState().weatherNotice).toEqual({
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
