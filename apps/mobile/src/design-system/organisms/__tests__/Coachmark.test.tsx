// @vitest-environment happy-dom
//
// The onboarding spotlight tour: one step at a time, Next / Got it / Skip,
// and a step whose target is not on screen is skipped rather than
// spotlighting nothing.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// The test shim of react-native has no BackHandler; the tour only needs a
// subscription it can remove.
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
  };
});

import { Coachmark, type CoachmarkStep } from '../Coachmark';

const target = (rect: [number, number, number, number] | null) => ({
  current: {
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
      rect ? cb(...rect) : cb(0, 0, 0, 0),
  } as never,
});

const labels = {
  next: 'Next',
  done: 'Got it',
  skip: 'Skip',
  progress: (c: number, t: number) => `${c}/${t}`,
};

const steps = (rects: Array<[number, number, number, number] | null>): CoachmarkStep[] =>
  rects.map((rect, i) => ({ key: `s${i}`, text: `step ${i}`, targetRef: target(rect) }));

describe('Coachmark', () => {
  it('walks the steps in order and finishes on "Got it"', async () => {
    const onFinish = vi.fn();
    const onAction = vi.fn();
    render(
      <Coachmark
        steps={steps([[0, 100, 300, 80], [0, 300, 300, 60]])}
        labels={labels}
        onAction={onAction}
        onFinish={onFinish}
      />,
    );

    expect(await screen.findByText('step 0')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));

    expect(await screen.findByText('step 1')).toBeTruthy();
    fireEvent.click(screen.getByText('Got it'));

    expect(onAction.mock.calls).toEqual([
      ['s0', 'next'],
      ['s1', 'done'],
    ]);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('Skip ends the tour from any step', async () => {
    const onFinish = vi.fn();
    const onAction = vi.fn();
    render(
      <Coachmark steps={steps([[0, 100, 300, 80], [0, 300, 300, 60]])} labels={labels} onAction={onAction} onFinish={onFinish} />,
    );

    fireEvent.click(await screen.findByText('Skip'));

    expect(onAction).toHaveBeenCalledWith('s0', 'skip');
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skips a step whose target is not on screen', async () => {
    render(
      <Coachmark steps={steps([null, [0, 300, 300, 60]])} labels={labels} onFinish={vi.fn()} />,
    );

    expect(await screen.findByText('step 1')).toBeTruthy();
    expect(screen.queryByText('step 0')).toBeNull();
    // The rider only ever sees one step, so it must read "1 of 1", not "2 of 2".
    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('finishes quietly when no target can be shown', async () => {
    const onFinish = vi.fn();
    render(<Coachmark steps={steps([null])} labels={labels} onFinish={onFinish} />);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });
});
