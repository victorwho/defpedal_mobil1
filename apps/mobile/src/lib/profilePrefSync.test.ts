import { describe, expect, it } from 'vitest';

import { resolveNotificationPrefSync, toProfileUpdatePayload } from './profilePrefSync';

const local = {
  notifyWeather: true,
  notifyHazard: true,
  notifyCommunity: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  shareConversionFeedOptin: true,
  shareTripsPublicly: true,
} as const;

describe('resolveNotificationPrefSync', () => {
  it('hydrates a configured window instead of overwriting it with device defaults', () => {
    // The reinstall case: local is back at factory defaults, the server still
    // holds what the rider actually chose.
    const plan = resolveNotificationPrefSync(local, {
      notifyWeather: true,
      notifyHazard: true,
      notifyCommunity: true,
      quietHoursStart: '23:30',
      quietHoursEnd: '06:00',
      shareConversionFeedOptin: true,
    });

    expect(plan.hydrate.quietHoursStart).toBe('23:30');
    expect(plan.hydrate.quietHoursEnd).toBe('06:00');
    expect(plan.push.quietHoursStart).toBeUndefined();
    expect(plan.push.quietHoursEnd).toBeUndefined();
  });

  it('never re-opts a rider into sharing they turned off', () => {
    const plan = resolveNotificationPrefSync(local, { shareConversionFeedOptin: false });

    expect(plan.hydrate.shareConversionFeedOptin).toBe(false);
    expect(plan.push.shareConversionFeedOptin).toBeUndefined();
  });

  it('hydrates notify flags the rider disabled server-side', () => {
    const plan = resolveNotificationPrefSync(local, {
      notifyWeather: false,
      notifyHazard: true,
      notifyCommunity: false,
    });

    expect(plan.hydrate.notifyWeather).toBe(false);
    expect(plan.hydrate.notifyCommunity).toBe(false);
    expect(plan.hydrate.notifyHazard).toBe(true);
  });

  it('seeds the server from local when it has never held a value', () => {
    const plan = resolveNotificationPrefSync(local, {});

    expect(plan.hydrate).toEqual({});
    expect(plan.push).toEqual({ ...local });
  });

  it('treats a half-set window as unset and seeds both ends', () => {
    const plan = resolveNotificationPrefSync(local, { quietHoursStart: '23:00', quietHoursEnd: null });

    expect(plan.hydrate.quietHoursStart).toBeUndefined();
    expect(plan.push.quietHoursStart).toBe('22:00');
    expect(plan.push.quietHoursEnd).toBe('07:00');
  });

  it('falls back to pushing local when the profile read fails (offline)', () => {
    const plan = resolveNotificationPrefSync(local, null);

    expect(plan.hydrate).toEqual({});
    expect(plan.push).toEqual({ ...local });
  });

  it('mixes hydrate and push when the server is only partially populated', () => {
    const plan = resolveNotificationPrefSync(local, { notifyWeather: false });

    expect(plan.hydrate.notifyWeather).toBe(false);
    expect(plan.push.notifyHazard).toBe(true);
    expect(plan.push.quietHoursStart).toBe('22:00');
  });

  // ── shareTripsPublicly <-> auto_share_rides (2026-09-14) ──

  it('hydrates the sharing toggle from a STAMPED server value', () => {
    const plan = resolveNotificationPrefSync(local, {
      autoShareRides: false,
      autoShareRidesSetAt: '2026-09-14T10:00:00.000Z',
    });

    expect(plan.hydrate.shareTripsPublicly).toBe(false);
    expect(plan.push.shareTripsPublicly).toBeUndefined();
  });

  it('IGNORES an unstamped server value and seeds from the device instead', () => {
    // The defect this closes. auto_share_rides is NOT NULL, so it always holds
    // a value — but for 3,364 of 3,365 accounts that value is the trigger
    // default nobody chose. Letting it win would hide the product owner, who
    // had shared 245 rides while the column sat at false.
    const plan = resolveNotificationPrefSync(local, { autoShareRides: false });

    expect(plan.hydrate.shareTripsPublicly).toBeUndefined();
    expect(plan.push.shareTripsPublicly).toBe(true);
    expect(toProfileUpdatePayload(plan.push).autoShareRides).toBe(true);
  });

  it('does not let a device default overwrite a STAMPED server opt-out', () => {
    // The reinstall case — error-log #81. Once a human has set it, the server
    // owns it and factory defaults cannot undo the choice.
    const freshInstall = { ...local, shareTripsPublicly: true };
    const plan = resolveNotificationPrefSync(freshInstall, {
      autoShareRides: false,
      autoShareRidesSetAt: '2026-09-14T10:00:00.000Z',
    });

    expect(plan.hydrate.shareTripsPublicly).toBe(false);
    expect(plan.push.shareTripsPublicly).toBeUndefined();
    expect(toProfileUpdatePayload(plan.push).autoShareRides).toBeUndefined();
  });

  it('carries a deliberate device opt-out up to an unstamped server', () => {
    // The mirror image, and the reason the stamp exists rather than a plain
    // server-wins rule: a rider who turned sharing OFF on the device must not
    // be re-opted in by the default `true` sitting in the column.
    const optedOut = { ...local, shareTripsPublicly: false };
    const plan = resolveNotificationPrefSync(optedOut, { autoShareRides: true });

    expect(plan.hydrate.shareTripsPublicly).toBeUndefined();
    expect(toProfileUpdatePayload(plan.push).autoShareRides).toBe(false);
  });

  it('treats an older server that omits the stamp as never-set', () => {
    const plan = resolveNotificationPrefSync(local, {
      autoShareRides: false,
      autoShareRidesSetAt: null,
    });

    expect(plan.hydrate.shareTripsPublicly).toBeUndefined();
    expect(plan.push.shareTripsPublicly).toBe(true);
  });
});

describe('toProfileUpdatePayload', () => {
  it('renames the store key to the wire key', () => {
    // Fastify's ajv runs removeAdditional, so the store key would be silently
    // STRIPPED rather than rejected — the sync would look like it worked.
    expect(toProfileUpdatePayload({ shareTripsPublicly: false })).toEqual({
      autoShareRides: false,
    });
  });

  it('omits the key entirely when there is nothing to push', () => {
    const payload = toProfileUpdatePayload({ notifyWeather: true });
    expect(payload).toEqual({ notifyWeather: true });
    expect('autoShareRides' in payload).toBe(false);
    expect('shareTripsPublicly' in payload).toBe(false);
  });

  it('passes every other field through untouched', () => {
    expect(toProfileUpdatePayload({ ...local })).toEqual({
      notifyWeather: true,
      notifyHazard: true,
      notifyCommunity: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      shareConversionFeedOptin: true,
      autoShareRides: true,
    });
  });
});
