// @vitest-environment happy-dom
/**
 * Guards the identity rule in TelemetryProvider.
 *
 * The bug this pins: auth resolves asynchronously, so `user` is null on every
 * cold start for a moment. `telemetry.identify(null)` calls PostHog's
 * `reset()`, which mints a brand-new anonymous distinct_id — so without an
 * `isLoading` guard every launch began a fresh identity and the link to the
 * account was made late or never. Measured at 613 of 796 distinct_ids matching
 * no account, and 51% of provably-active users unattributable.
 *
 * `reset()` is a SIGN-OUT operation. "Auth has not answered yet" is not one.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  value: { user: null as { id: string; email: string | null } | null, isLoading: true },
}));
const identify = vi.hoisted(() => vi.fn());
const applyConsent = vi.hoisted(() => vi.fn());

vi.mock('./AuthSessionProvider', () => ({
  useAuthSession: () => authState.value,
}));

vi.mock('../lib/telemetry', () => ({
  telemetry: { identify },
  applyTelemetryConsent: applyConsent,
}));

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ analyticsConsent: { sentry: true, posthog: true } }),
}));

const { TelemetryProvider } = await import('./TelemetryProvider');

const renderProvider = () =>
  render(React.createElement(TelemetryProvider, null, React.createElement('div')));

describe('TelemetryProvider identity', () => {
  beforeEach(() => {
    identify.mockClear();
    applyConsent.mockClear();
    authState.value = { user: null, isLoading: true };
  });

  it('does NOT touch identity while auth is still resolving', () => {
    renderProvider();
    expect(identify).not.toHaveBeenCalled();
  });

  it('identifies the user once auth has resolved', () => {
    authState.value = {
      user: { id: 'user-1', email: 'rider@example.com' },
      isLoading: false,
    };
    renderProvider();
    expect(identify).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'rider@example.com',
    });
  });

  it('identifies an anonymous user by id, with a null email', () => {
    authState.value = { user: { id: 'anon-1', email: null }, isLoading: false };
    renderProvider();
    expect(identify).toHaveBeenCalledWith({ id: 'anon-1', email: null });
  });

  /**
   * The other half of the rule: a genuine signed-out state MUST still reset,
   * or a shared device keeps reporting the previous rider.
   */
  it('resets identity for a genuine signed-out state', () => {
    authState.value = { user: null, isLoading: false };
    renderProvider();
    expect(identify).toHaveBeenCalledWith(null);
  });

  it('applies consent regardless of auth state', () => {
    renderProvider();
    expect(applyConsent).toHaveBeenCalledWith({ sentry: true, posthog: true });
  });
});
