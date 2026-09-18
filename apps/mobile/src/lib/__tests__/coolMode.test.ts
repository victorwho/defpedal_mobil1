/**
 * Cool mode went LIVE in production on 2026-09-18. Before that it was
 * dev/preview only, and these tests asserted that a production build could
 * never end up in cool mode through any of the five `avoidHeat` entry paths.
 *
 * ⚠️ THE DISABLE BRANCH IS NOW UNREACHABLE, AND IS NOT TESTED HERE.
 *
 * `isCoolModeEnabled()` returns a literal `true`, so `resolveAvoidHeat`'s
 * `: false` arm cannot be exercised without reimplementing it — and a test
 * that reimplements the code under test proves only that the test agrees with
 * itself. There is deliberately no such test in this file; pretending to cover
 * a dead branch is worse than leaving it visibly uncovered.
 *
 * If cool mode is ever gated again, restore a stubbable source for the flag
 * (it previously read `mobileEnv.appVariant` / `appEnv`, which `vi.doMock`
 * could control) and bring back the disabled-path cases from git history —
 * `git log -- apps/mobile/src/lib/__tests__/coolMode.test.ts`. Those cases are
 * what make re-gating safe, because `avoidHeat` has five entry paths and only
 * one of them is the Cool pill.
 *
 * What IS still worth pinning, and is pinned below: `resolveAvoidHeat` remains
 * the single choke point every write path calls, and it always yields a
 * boolean. The store-level proof that each of those paths actually routes
 * through it lives in `store/__tests__/appStore.coolModeGate.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { isCoolModeEnabled, resolveAvoidHeat } from '../coolMode';

describe('isCoolModeEnabled', () => {
  it('is on for every build, including production', () => {
    expect(isCoolModeEnabled()).toBe(true);
  });
});

describe('resolveAvoidHeat — the choke point', () => {
  it('passes an explicit request through while the mode is enabled', () => {
    expect(resolveAvoidHeat(true)).toBe(true);
    expect(resolveAvoidHeat(false)).toBe(false);
  });

  // `undefined` means "not specified", never "on". A saved route or a claimed
  // share that omits the flag must not opt the rider into cool routing.
  it('treats a missing preference as off, not as on', () => {
    expect(resolveAvoidHeat(undefined)).toBe(false);
  });

  it('always yields a boolean, whatever it is handed', () => {
    for (const input of [true, false, undefined]) {
      expect(typeof resolveAvoidHeat(input)).toBe('boolean');
    }
  });
});
