/**
 * Cool-mode production gate — every write path into `avoidHeat`.
 *
 * `coolMode.ts` states that guarding the SETTER closes all five ways the flag
 * can turn on, so hiding the Cool pill is only about not showing a dead
 * control. That claim was false: `setRouteRequest` synced the flag straight
 * from the request without coercion, and that is precisely the path a claimed
 * share takes — `ShareClaimProcessor` calls it and pushes to `/route-preview`,
 * bypassing route-planning's heal effect entirely.
 *
 * The visible result in a store build was a route served by the shade graph
 * with the mode pill reading Safe. The canopy comparison then made it legible
 * to the rider ("Shade route: 29% tree-lined"), which is what surfaced it.
 *
 * `mobileEnv` is mocked to a production build so the REAL `resolveAvoidHeat`
 * runs, rather than mocking the gate itself and proving only that a mock was
 * called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/env', () => ({
  mobileEnv: {
    appEnv: 'production',
    appVariant: 'production',
    mobileApiUrl: 'https://api.example.com',
    mapboxPublicToken: 'pk.test',
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'anon',
    revenueCatAndroidKey: '',
    revenueCatIosKey: '',
    googleWebClientId: '',
    googleIosClientId: '',
    sentryDsn: '',
    posthogApiKey: '',
  },
}));

const { useAppStore } = await import('../appStore');
const { isCoolModeEnabled } = await import('../../lib/coolMode');

const initial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ avoidHeat: false });
});

afterEach(() => {
  useAppStore.setState(initial, true);
});

describe('avoidHeat in a production build', () => {
  it('confirms the fixture really is a production build', () => {
    // Without this the whole file would pass vacuously on a dev-flavoured env.
    expect(isCoolModeEnabled()).toBe(false);
  });

  it('refuses the direct setter', () => {
    useAppStore.getState().setAvoidHeat(true);
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });

  // The share-claim / saved-route path.
  it('refuses a request carrying avoidHeat, as a claimed share does', () => {
    useAppStore.getState().setRouteRequest({ avoidHeat: true });
    expect(useAppStore.getState().avoidHeat).toBe(false);
    expect(useAppStore.getState().routeRequest.avoidHeat).toBeFalsy();
  });

  it('still honours the other profile flags on the same request', () => {
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

  it('refuses the named routing mode', () => {
    useAppStore.getState().selectRoutingMode('cool');
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });

  it('clears a stale true that reaches the store some other way', () => {
    useAppStore.setState({ avoidHeat: true });
    // Any subsequent request sync re-coerces rather than preserving it.
    useAppStore.getState().setRouteRequest({ avoidHeat: true });
    expect(useAppStore.getState().avoidHeat).toBe(false);
  });
});
