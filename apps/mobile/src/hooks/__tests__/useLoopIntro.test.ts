// @vitest-environment happy-dom
//
// The app-open Loop intro, end to end through the store: who sees it, what
// closing and "Try it" do, and that it never stacks on another notice.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a) } }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));

import { EMPTY_LOOP_INTRO_STATE } from '../../lib/loop-intro';
import { claimPromptSlot, resetPromptArbitrationForTest } from '../../lib/prompt-arbitration';
import { useAppStore } from '../../store/appStore';
import { useLoopIntro } from '../useLoopIntro';

const eligible = () =>
  useAppStore.setState({
    loopIntro: EMPTY_LOOP_INTRO_STATE,
    hasOpenedLoopPlanner: false,
    savedLoops: [],
    onboardingCompleted: true,
    appState: 'IDLE',
    regionGate: { status: 'passed', countryCode: 'RO' },
    // No other app-open notice pending.
    hasSeenPlusModesNotice: true,
    hasSeenMeetPedalCard: true,
  });

beforeEach(() => {
  push.mockClear();
  resetPromptArbitrationForTest();
  eligible();
});

describe('useLoopIntro', () => {
  it('shows to an eligible rider and records the showing', () => {
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(true);
    expect(useAppStore.getState().loopIntro.lastShownAt).toEqual(expect.any(String));
  });

  it('closes from the X and counts the close', () => {
    const { result } = renderHook(() => useLoopIntro());
    act(() => result.current.close());
    expect(result.current.visible).toBe(false);
    expect(useAppStore.getState().loopIntro.closes).toBe(1);
  });

  it('Try it opens the Loop planner and retires the intro', () => {
    const { result } = renderHook(() => useLoopIntro());
    act(() => result.current.tryIt());
    expect(push).toHaveBeenCalledWith('/loop-planner');
    expect(result.current.visible).toBe(false);
    expect(useAppStore.getState().loopIntro.retired).toBe(true);
  });

  it('stays hidden for a rider who already has a saved loop', () => {
    useAppStore.setState({ savedLoops: [{ id: 'x' } as never] });
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(false);
  });

  // Two separate tests on purpose: in one test, the first hook stays mounted,
  // claims the session slot once the store changes, and hides the second hook
  // for the wrong reason — which is exactly how this check first passed vacuously.
  it('never stacks on the one-time free-modes notice', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z')); // promo still running
    useAppStore.setState({ hasSeenPlusModesNotice: false });
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(false);
    vi.useRealTimers();
  });

  it('never stacks on the Meet Pedal card', () => {
    useAppStore.setState({ hasSeenMeetPedalCard: false, completedRideCount: 1 });
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(false);
  });

  // Async on purpose: in this test environment a store update reaches a
  // mounted hook on a later tick, not synchronously inside act().
  it('disappears if a ride starts while it is up', async () => {
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(true);
    await act(async () => {
      useAppStore.setState({ appState: 'NAVIGATING' });
    });
    await waitFor(() => expect(result.current.visible).toBe(false));
  });

  it('disappears if a route preview resumes while it is up', async () => {
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(true);
    await act(async () => {
      useAppStore.setState({ appState: 'ROUTE_PREVIEW' });
    });
    await waitFor(() => expect(result.current.visible).toBe(false));
  });

  it('yields to another ask already shown this session', () => {
    claimPromptSlot('plus');
    const { result } = renderHook(() => useLoopIntro());
    expect(result.current.visible).toBe(false);
  });
});
