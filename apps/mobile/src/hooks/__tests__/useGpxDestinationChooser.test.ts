// @vitest-environment happy-dom
/**
 * useGpxDestinationChooser — Unit Tests
 *
 * Without Garmin Connect the chooser is invisible (immediate 'share');
 * with it, an Alert offers Garmin / share / cancel.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

let mockInstalled = false;
vi.mock('../../lib/garmin', () => ({
  isGarminConnectInstalled: () => Promise.resolve(mockInstalled),
}));

type AlertButton = { text: string; onPress?: () => void; style?: string };
const alertSpy = vi.fn<(title: string, message?: string, buttons?: AlertButton[]) => void>();
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Alert: {
      alert: (title: string, message?: string, buttons?: AlertButton[]) =>
        alertSpy(title, message, buttons),
    },
  };
});

vi.mock('../useTranslation', () => ({
  useT: () => (key: string) => key,
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useGpxDestinationChooser } = await import('../useGpxDestinationChooser');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockInstalled = false;
  alertSpy.mockReset();
});

describe('useGpxDestinationChooser', () => {
  it('fires the callback immediately with share when Garmin is not installed', async () => {
    const { result } = renderHook(() => useGpxDestinationChooser());
    const onChoose = vi.fn();

    act(() => {
      result.current.chooseGpxDestination(onChoose);
    });

    expect(onChoose).toHaveBeenCalledWith('share');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('offers Garmin / share / cancel when Garmin Connect is installed', async () => {
    mockInstalled = true;
    const { result } = renderHook(() => useGpxDestinationChooser());
    // Detection is async — wait for the availability state to settle.
    await waitFor(() => {
      act(() => {
        result.current.chooseGpxDestination(() => undefined);
      });
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, , buttons] = alertSpy.mock.calls.at(-1)!;
    expect(title).toBe('preview.exportDestinationTitle');
    expect(buttons?.map((b) => b.text)).toEqual([
      'preview.exportToGarmin',
      'preview.exportShareFile',
      'common.cancel',
    ]);
  });

  it('routes the chosen destination through the button callbacks', async () => {
    mockInstalled = true;
    const { result } = renderHook(() => useGpxDestinationChooser());
    const onChoose = vi.fn();

    await waitFor(() => {
      act(() => {
        result.current.chooseGpxDestination(onChoose);
      });
      expect(alertSpy).toHaveBeenCalled();
    });

    const [, , buttons] = alertSpy.mock.calls.at(-1)!;
    buttons![0]!.onPress!();
    expect(onChoose).toHaveBeenLastCalledWith('garmin');
    buttons![1]!.onPress!();
    expect(onChoose).toHaveBeenLastCalledWith('share');
  });
});
