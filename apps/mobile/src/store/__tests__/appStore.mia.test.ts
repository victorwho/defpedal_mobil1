// @vitest-environment happy-dom
/**
 * appStore — Mia Persona Actions — Unit Tests
 *
 * Tests the 6 Mia store actions + telemetry queue + defaults.
 * Isolated from the main appStore.test.ts to avoid coupling.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must mock ALL native dependencies before importing store
// ---------------------------------------------------------------------------

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    getAllKeys: vi.fn(),
    multiGet: vi.fn(),
    multiSet: vi.fn(),
    multiRemove: vi.fn(),
  },
}));
vi.mock('../../i18n', () => ({
  getDeviceLocale: () => 'en',
  translate: (locale: string, key: string) => key,
}));
vi.mock('../../lib/env', () => ({
  getEnvVar: (key: string) => key === 'EXPO_PUBLIC_MOBILE_API_URL' ? 'http://localhost:8080' : '',
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {},
  Dimensions: { get: () => ({ width: 360, height: 800 }) },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
  PixelRatio: { get: () => 2 },
}));

const { useAppStore } = await import('../appStore');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('appStore — Mia persona actions', () => {
  beforeEach(() => {
    // Reset store to defaults
    useAppStore.setState({
      persona: 'alex',
      miaJourneyLevel: 1,
      miaJourneyStatus: null,
      miaPromptShown: false,
      pendingMiaLevelUp: null,
      pendingTelemetryEvents: [],
      homeLocation: null,
    });
  });

  describe('defaults', () => {
    it('defaults persona to alex', () => {
      expect(useAppStore.getState().persona).toBe('alex');
    });

    it('defaults miaJourneyLevel to 1', () => {
      expect(useAppStore.getState().miaJourneyLevel).toBe(1);
    });

    it('defaults miaJourneyStatus to null', () => {
      expect(useAppStore.getState().miaJourneyStatus).toBeNull();
    });

    it('defaults pendingMiaLevelUp to null', () => {
      expect(useAppStore.getState().pendingMiaLevelUp).toBeNull();
    });
  });

  describe('activateMiaJourney', () => {
    it('sets persona to mia with active status', () => {
      useAppStore.getState().activateMiaJourney('self_selected');
      const state = useAppStore.getState();
      expect(state.persona).toBe('mia');
      expect(state.miaJourneyStatus).toBe('active');
      expect(state.miaJourneyLevel).toBe(1);
    });
  });

  describe('levelUpMia', () => {
    it('sets pendingMiaLevelUp with from/to levels', () => {
      useAppStore.setState({ persona: 'mia', miaJourneyLevel: 2 });
      useAppStore.getState().levelUpMia(3);
      const state = useAppStore.getState();
      expect(state.pendingMiaLevelUp).toEqual({ fromLevel: 2, toLevel: 3 });
      expect(state.miaJourneyLevel).toBe(3);
    });

    it('updates miaJourneyLevel to new level', () => {
      useAppStore.setState({ persona: 'mia', miaJourneyLevel: 1 });
      useAppStore.getState().levelUpMia(2);
      expect(useAppStore.getState().miaJourneyLevel).toBe(2);
    });
  });

  describe('shiftMiaLevelUp', () => {
    it('returns pending event and clears it', () => {
      useAppStore.setState({
        pendingMiaLevelUp: { fromLevel: 1, toLevel: 2 },
      });
      const event = useAppStore.getState().shiftMiaLevelUp();
      expect(event).toEqual({ fromLevel: 1, toLevel: 2 });
      expect(useAppStore.getState().pendingMiaLevelUp).toBeNull();
    });

    it('returns null when no pending event', () => {
      const event = useAppStore.getState().shiftMiaLevelUp();
      expect(event).toBeNull();
    });
  });

  describe('optOutMia', () => {
    it('sets persona back to alex with opted_out status', () => {
      useAppStore.setState({ persona: 'mia', miaJourneyStatus: 'active' });
      useAppStore.getState().optOutMia();
      const state = useAppStore.getState();
      expect(state.persona).toBe('alex');
      expect(state.miaJourneyStatus).toBe('opted_out');
    });
  });

  describe('completeMiaJourney', () => {
    it('transitions persona to alex with completed status', () => {
      useAppStore.setState({ persona: 'mia', miaJourneyLevel: 5, miaJourneyStatus: 'active' });
      useAppStore.getState().completeMiaJourney();
      const state = useAppStore.getState();
      expect(state.persona).toBe('alex');
      expect(state.miaJourneyStatus).toBe('completed');
    });
  });

  describe('setMiaPromptShown', () => {
    it('sets miaPromptShown to true', () => {
      expect(useAppStore.getState().miaPromptShown).toBe(false);
      useAppStore.getState().setMiaPromptShown();
      expect(useAppStore.getState().miaPromptShown).toBe(true);
    });
  });

  describe('telemetry queue', () => {
    it('enqueues events immutably', () => {
      const event = { type: 'app_open', timestamp: Date.now(), payload: {} };
      useAppStore.getState().enqueueTelemetryEvent(event as any);
      const events = useAppStore.getState().pendingTelemetryEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it('appends to existing events', () => {
      const event1 = { type: 'app_open', timestamp: 1, payload: {} };
      const event2 = { type: 'route_generated_not_started', timestamp: 2, payload: {} };
      useAppStore.getState().enqueueTelemetryEvent(event1 as any);
      useAppStore.getState().enqueueTelemetryEvent(event2 as any);
      expect(useAppStore.getState().pendingTelemetryEvents).toHaveLength(2);
    });

    it('clearTelemetryEvents empties the queue', () => {
      useAppStore.getState().enqueueTelemetryEvent({ type: 'app_open', timestamp: 1, payload: {} } as any);
      useAppStore.getState().clearTelemetryEvents();
      expect(useAppStore.getState().pendingTelemetryEvents).toHaveLength(0);
    });
  });

  describe('homeLocation', () => {
    it('sets home location', () => {
      useAppStore.getState().setHomeLocation({ lat: 44.43, lon: 26.10 });
      expect(useAppStore.getState().homeLocation).toEqual({ lat: 44.43, lon: 26.10 });
    });
  });
});
