// @vitest-environment happy-dom
//
// The one hook every unsolicited Pedal Plus nudge goes through. What matters:
// it never shows during the dark launch, to a subscriber or mid-ride; it takes
// the session's single Plus slot; and it yields to any ask that already
// claimed a slot (docs/plans/pedal-plus-nudges.md §4).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUiEnabled = true;
let mockIsPlus = false;

vi.mock('../usePremium', () => ({
  usePremium: () => ({ uiEnabled: mockUiEnabled, isPlus: mockIsPlus }),
}));

vi.mock('../../lib/telemetry', () => ({
  telemetry: { capture: vi.fn() },
}));

import { EMPTY_PLUS_NUDGE_STATE, resetPlusNudgeSessionForTest } from '../../lib/plus-nudges';
import { claimPromptSlot, resetPromptArbitrationForTest } from '../../lib/prompt-arbitration';
import { useAppStore } from '../../store/appStore';
import { usePlusNudge } from '../usePlusNudge';

beforeEach(() => {
  mockUiEnabled = true;
  mockIsPlus = false;
  resetPlusNudgeSessionForTest();
  resetPromptArbitrationForTest();
  useAppStore.setState({ plusNudgeState: EMPTY_PLUS_NUDGE_STATE, appState: 'IDLE' });
});

afterEach(() => {
  useAppStore.setState({ plusNudgeState: EMPTY_PLUS_NUDGE_STATE, appState: 'IDLE' });
});

describe('usePlusNudge', () => {
  it('shows when wanted and eligible, and records the show', () => {
    const { result } = renderHook(() => usePlusNudge('cool_hot_day', true));
    expect(result.current.visible).toBe(true);
    expect(useAppStore.getState().plusNudgeState.surfaces.cool_hot_day?.lastShownAt).toEqual(
      expect.any(String),
    );
  });

  it('stays hidden when the trigger does not hold', () => {
    const { result } = renderHook(() => usePlusNudge('cool_hot_day', false));
    expect(result.current.visible).toBe(false);
    expect(useAppStore.getState().plusNudgeState.surfaces.cool_hot_day).toBeUndefined();
  });

  it('shows nothing during the dark launch', () => {
    mockUiEnabled = false;
    const { result } = renderHook(() => usePlusNudge('cool_hot_day', true));
    expect(result.current.visible).toBe(false);
  });

  it('never sells to a subscriber', () => {
    mockIsPlus = true;
    const { result } = renderHook(() => usePlusNudge('ebike_post_ride', true));
    expect(result.current.visible).toBe(false);
  });

  it('never shows mid-ride', () => {
    useAppStore.setState({ appState: 'NAVIGATING' });
    const { result } = renderHook(() => usePlusNudge('modes_moved', true));
    expect(result.current.visible).toBe(false);
  });

  it('allows only one unsolicited Plus surface per session', () => {
    renderHook(() => usePlusNudge('cool_hot_day', true));
    const { result } = renderHook(() => usePlusNudge('ebike_post_ride', true));
    expect(result.current.visible).toBe(false);
  });

  it('yields to an ask that already claimed a slot this session', () => {
    claimPromptSlot('review');
    const { result } = renderHook(() => usePlusNudge('ebike_post_ride', true));
    expect(result.current.visible).toBe(false);
  });

  it('stays visible after its own show (the spacing cap does not hide it)', () => {
    const { result, rerender } = renderHook(() => usePlusNudge('cool_hot_day', true));
    rerender();
    expect(result.current.visible).toBe(true);
  });

  it('hides on dismiss and counts the dismissal', () => {
    const { result } = renderHook(() => usePlusNudge('cool_hot_day', true));
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    expect(useAppStore.getState().plusNudgeState.surfaces.cool_hot_day?.dismissals).toBe(1);
  });

  it('hides on accept WITHOUT counting a dismissal', () => {
    const { result } = renderHook(() => usePlusNudge('cool_hot_day', true));
    act(() => result.current.accept());
    expect(result.current.visible).toBe(false);
    expect(useAppStore.getState().plusNudgeState.surfaces.cool_hot_day?.dismissals).toBe(0);
  });

  it('disappears if the rider subscribes while it is up', () => {
    const { result, rerender } = renderHook(() => usePlusNudge('cool_hot_day', true));
    expect(result.current.visible).toBe(true);
    mockIsPlus = true;
    rerender();
    expect(result.current.visible).toBe(false);
  });
});
