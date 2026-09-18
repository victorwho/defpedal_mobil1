/**
 * Every store path that can set `avoidHeat` must go through `resolveAvoidHeat`.
 *
 * `coolMode.ts` claims that guarding the setters closes all five ways the flag
 * can turn on, so gating the mode is a one-line change rather than an audit.
 * That claim was false once: `setRouteRequest` synced the flag straight from
 * the request, and that is exactly the path a claimed share takes —
 * `ShareClaimProcessor` calls it and pushes to `/route-preview`, bypassing
 * route-planning's heal effect. The visible result in a store build was a
 * shade-graph route with the mode pill reading "Safe".
 *
 * ⚠️ WHY THE MODULE IS STUBBED RATHER THAN THE BUILD ENV.
 * Cool mode is now ON in production, so `resolveAvoidHeat` is currently an
 * identity function and a test using the real module could not tell a coercing
 * path from a bypassing one — every assertion would pass either way. Stubbing
 * `isCoolModeEnabled` to `false` restores the distinction: any path that does
 * NOT delegate keeps its `true` and fails. This tests the plumbing, which is
 * the durable property, rather than today's flag value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The real implementation's shape, with the flag forced off. */
vi.mock('../../lib/coolMode', () => ({
  isCoolModeEnabled: () => false,
  // Mirrors `isCoolModeEnabled() ? requested === true : false` with the flag
  // off, which is the behaviour these paths must honour.
  resolveAvoidHeat: (_requested: boolean | undefined) => false,
}));

const { useAppStore } = await import('../appStore');

const initial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ avoidHeat: false });
});

afterEach(() => {
  useAppStore.setState(initial, true);
});

describe('every avoidHeat write path delegates to resolveAvoidHeat', () => {
  it('the direct setter', () => {
    useAppStore.getState().setAvoidHeat(true);
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });

  // The share-claim and saved-route path — the one that was broken.
  it('a request carrying avoidHeat, as a claimed share does', () => {
    useAppStore.getState().setRouteRequest({ avoidHeat: true });
    expect(useAppStore.getState().avoidHeat).toBe(false);
    // The nested copy is a second source of truth for the same flag; two
    // disagreeing copies is how this class of bug is built.
    expect(useAppStore.getState().routeRequest.avoidHeat).toBeFalsy();
  });

  it('the named routing mode', () => {
    useAppStore.getState().selectRoutingMode('cool');
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });

  it('re-coerces a stale true that reached the store some other way', () => {
    useAppStore.setState({ avoidHeat: true });
    useAppStore.getState().setRouteRequest({ avoidHeat: true });
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });

  /*
   * The coercion must be surgical. An earlier fix that dropped the whole
   * profile-flag sync would also have passed the assertions above.
   */
  it('leaves the other profile flags on the same request untouched', () => {
    useAppStore.getState().setRouteRequest({
      avoidHeat: true,
      avoidHills: true,
      avoidUnpaved: true,
    });
    const state = useAppStore.getState();
    expect(state.avoidHeat).toBe(false);
    expect(state.avoidHills).toBe(true);
    expect(state.avoidUnpaved).toBe(true);
  });
});
