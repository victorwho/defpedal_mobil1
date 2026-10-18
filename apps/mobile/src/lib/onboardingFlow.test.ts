import { describe, expect, it } from 'vitest';

import { decideOnboardingFlow } from './onboardingFlow';

describe('decideOnboardingFlow', () => {
  it('selects the new flow only on an explicit true', async () => {
    await expect(
      decideOnboardingFlow(async () => ({ onboardingFirstRideEnabled: true })),
    ).resolves.toEqual({ flow: 'first_ride', definitive: true, anonymousRide: false });
  });

  it('treats an explicit false as a definitive "today’s flow"', async () => {
    await expect(
      decideOnboardingFlow(async () => ({ onboardingFirstRideEnabled: false })),
    ).resolves.toEqual({ flow: 'legacy', definitive: true, anonymousRide: false });
  });

  it('treats an absent field (older server) as a definitive "today’s flow"', async () => {
    await expect(decideOnboardingFlow(async () => ({}))).resolves.toEqual({
      flow: 'legacy',
      definitive: true,
      anonymousRide: false,
    });
  });

  it('fails closed, NOT definitively, when the read throws', async () => {
    await expect(
      decideOnboardingFlow(async () => {
        throw new Error('401');
      }),
    ).resolves.toEqual({ flow: 'legacy', definitive: false, anonymousRide: false });
  });

  it('fails closed, NOT definitively, when the read throws synchronously', async () => {
    await expect(
      decideOnboardingFlow(() => {
        throw new TypeError('getProfile is not a function');
      }),
    ).resolves.toEqual({ flow: 'legacy', definitive: false, anonymousRide: false });
  });

  it('fails closed, NOT definitively, when the read is slower than the timeout', async () => {
    const slow = () =>
      new Promise<{ onboardingFirstRideEnabled: boolean }>((resolve) =>
        setTimeout(() => resolve({ onboardingFirstRideEnabled: true }), 200),
      );
    await expect(decideOnboardingFlow(slow, 20)).resolves.toEqual({
      flow: 'legacy',
      definitive: false,
      anonymousRide: false,
    });
  });

  it('allows the first ride before signup only with BOTH switches on', async () => {
    await expect(
      decideOnboardingFlow(async () => ({ onboardingFirstRideEnabled: true, onboardingAnonymousRideEnabled: true })),
    ).resolves.toMatchObject({ flow: 'first_ride', anonymousRide: true });
    await expect(
      decideOnboardingFlow(async () => ({ onboardingFirstRideEnabled: false, onboardingAnonymousRideEnabled: true })),
    ).resolves.toMatchObject({ flow: 'legacy', anonymousRide: false });
  });
});
