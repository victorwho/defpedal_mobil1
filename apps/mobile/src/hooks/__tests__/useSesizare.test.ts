// @vitest-environment happy-dom
/**
 * useSesizare — Unit tests
 *
 * The ordering assertions are the point. With no preview sheet, the Alert is
 * the ONLY moment a rider learns something is on their clipboard, so the
 * browser must open from the Alert's button — never before it, and never
 * without the clipboard write having succeeded first.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AlertButton = { text?: string; onPress?: () => void; style?: string };

const alertSpy = vi.fn<(title: string, body?: string, buttons?: AlertButton[]) => void>();
const setStringSpy = vi.fn<(value: string) => Promise<boolean>>();
const openBrowserSpy = vi.fn<(url: string) => Promise<unknown>>();
const captureSpy = vi.fn();

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Alert: { alert: (t: string, b?: string, x?: AlertButton[]) => alertSpy(t, b, x) },
  };
});

vi.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => setStringSpy(value),
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => openBrowserSpy(url),
}));

vi.mock('../../lib/telemetry', () => ({
  telemetry: { capture: (...args: unknown[]) => captureSpy(...args) },
}));

vi.mock('../useTranslation', () => ({
  useT: () => (key: string) => key,
}));

import { useSesizare } from '../useSesizare';
import { useAppStore } from '../../store/appStore';

const BUCHAREST = { lat: 44.4612, lon: 26.1109 };

const validInput = {
  hazardType: 'pothole' as const,
  coordinate: BUCHAREST,
  address: 'strada Fabrica de Glucoză nr. 5, București',
  hazardId: 'haz-1',
  observedAt: '2026-08-27T09:14:00.000Z',
  surface: 'hazard_detail' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  setStringSpy.mockResolvedValue(true);
  openBrowserSpy.mockResolvedValue(undefined);
  useAppStore.setState({
    sesizariConfig: { enabled: true, baseUrl: 'https://civia.ro/sesizari' },
    queuedMutations: [],
  });
});

describe('useSesizare', () => {
  it('copies the Romanian petition text before anything else happens', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare(validInput);
    });

    expect(setStringSpy).toHaveBeenCalledTimes(1);
    const copied = setStringSpy.mock.calls[0][0];
    expect(copied).toContain('strada Fabrica de Glucoză nr. 5, București');
    expect(copied).toContain('groapă în carosabil');
    expect(copied).toContain('Coordonate GPS: 44.4612, 26.1109.');
    expect(copied).toContain('Vă rog să dispuneți remedierea.');
  });

  it('does NOT open the browser until the Alert button is pressed', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare(validInput);
    });

    // The Alert is the only paste instruction the rider ever sees.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(openBrowserSpy).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const openButton = buttons.find((button) => button.text === 'sesizare.openCivia');
    expect(openButton).toBeDefined();

    act(() => openButton?.onPress?.());
    expect(openBrowserSpy).toHaveBeenCalledWith('https://civia.ro/sesizari?ref=defensivepedal');
  });

  it('uses the server-supplied base URL so a civia.ro path change needs no release', async () => {
    useAppStore.setState({
      sesizariConfig: { enabled: true, baseUrl: 'https://civia.ro/sesizare-noua' },
    });
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare(validInput);
    });
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    act(() => buttons.find((b) => b.text === 'sesizare.openCivia')?.onPress?.());

    expect(openBrowserSpy).toHaveBeenCalledWith(
      'https://civia.ro/sesizare-noua?ref=defensivepedal',
    );
  });

  it('queues the server record rather than posting directly', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare(validInput);
    });

    const queued = useAppStore.getState().queuedMutations;
    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe('sesizare');
    expect(queued[0].payload).toMatchObject({
      hazardId: 'haz-1',
      hazardType: 'pothole',
      coordinate: BUCHAREST,
    });
  });

  it('still records the escalation when the hazard has no server id yet', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare({ ...validInput, hazardId: undefined });
    });

    const queued = useAppStore.getState().queuedMutations;
    expect(queued).toHaveLength(1);
    expect((queued[0].payload as { hazardId?: string }).hazardId).toBeUndefined();
    expect((queued[0].payload as { address?: string }).address).toBe(validInput.address);
  });

  it('bails out without opening a browser when the clipboard write fails', async () => {
    setStringSpy.mockRejectedValue(new Error('no clipboard'));
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare(validInput);
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('sesizare.clipboardFailedTitle');
    expect(openBrowserSpy).not.toHaveBeenCalled();
    // Nothing was queued — there is no escalation to record.
    expect(useAppStore.getState().queuedMutations).toHaveLength(0);
  });

  it('refuses hazard types no Romanian authority can act on', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare({
        ...validInput,
        hazardType: 'aggressive_traffic' as never,
      });
    });

    expect(setStringSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().queuedMutations).toHaveLength(0);
  });

  it('records a telemetry event with the surface it was tapped from', async () => {
    const { result } = renderHook(() => useSesizare());

    await act(async () => {
      await result.current.startSesizare({ ...validInput, surface: 'post_ride' });
    });

    expect(captureSpy).toHaveBeenCalledWith('sesizare_started', {
      hazard_type: 'pothole',
      surface: 'post_ride',
      has_hazard_id: true,
    });
  });
});
