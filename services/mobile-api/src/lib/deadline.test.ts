import { describe, expect, it, vi } from 'vitest';

import { resolveWithinDeadline } from './deadline';

describe('resolveWithinDeadline', () => {
  it('returns the value when it settles in time', async () => {
    await expect(resolveWithinDeadline(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('gives up and returns undefined when the deadline passes', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));
    await expect(resolveWithinDeadline(slow, 20)).resolves.toBeUndefined();
  });

  it('returns undefined when the promise rejects before the deadline', async () => {
    await expect(resolveWithinDeadline(Promise.reject(new Error('upstream')), 50)).resolves.toBeUndefined();
  });

  it('does not leave an unhandled rejection when the loser fails after the deadline', async () => {
    // The whole point of the helper: the abandoned promise keeps running. If
    // its rejection went unobserved, Node's default policy would kill the
    // process — long after the request it belonged to had been answered.
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    const failsLate = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('late upstream')), 30));
    await expect(resolveWithinDeadline(failsLate, 5)).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 80));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does not wait for the loser once the deadline has passed', async () => {
    const started = Date.now();
    const never = new Promise<string>(() => {});
    await resolveWithinDeadline(never, 25);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
