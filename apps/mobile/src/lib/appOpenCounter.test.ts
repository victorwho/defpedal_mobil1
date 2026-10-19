import { beforeEach, describe, expect, it, vi } from 'vitest';

import { countLaunchOnce, resetLaunchCountForTest } from './appOpenCounter';

beforeEach(() => resetLaunchCountForTest());

describe('countLaunchOnce', () => {
  it('counts a launch once, however many times the root re-mounts (e.g. at signup)', () => {
    const increment = vi.fn();
    countLaunchOnce(increment);
    countLaunchOnce(increment); // the guard re-mounting after the account switch
    countLaunchOnce(increment);
    expect(increment).toHaveBeenCalledTimes(1);
  });
});
