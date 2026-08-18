import { describe, expect, it } from 'vitest';

import { resolveNotificationPrefSync } from './profilePrefSync';

const local = {
  notifyWeather: true,
  notifyHazard: true,
  notifyCommunity: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  shareConversionFeedOptin: true,
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
});
