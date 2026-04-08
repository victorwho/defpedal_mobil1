import { describe, expect, it } from 'vitest';

import {
  buildDeveloperBypassSession,
  isDeveloperBypassConfigured,
  isMobileAuthSession,
} from './devAuth';

describe('developer auth bypass helpers', () => {
  it('builds a developer bypass session only when fully configured', () => {
    expect(
      buildDeveloperBypassSession({
        devAuthBypassEnabled: false,
        devAuthBypassToken: 'token',
        devAuthBypassUserId: 'dev-user',
        devAuthBypassEmail: 'developer@example.com',
      }),
    ).toBeNull();

    expect(
      buildDeveloperBypassSession({
        devAuthBypassEnabled: true,
        devAuthBypassToken: ' dev-token ',
        devAuthBypassUserId: ' dev-user ',
        devAuthBypassEmail: ' developer@example.com ',
      }),
    ).toEqual({
      accessToken: 'dev-token',
      isAnonymous: false,
      provider: 'dev-bypass',
      user: {
        id: 'dev-user',
        email: 'developer@example.com',
        provider: 'dev-bypass',
      },
    });
  });

  it('reports whether the developer bypass can be used', () => {
    expect(
      isDeveloperBypassConfigured({
        devAuthBypassEnabled: true,
        devAuthBypassToken: 'dev-token',
        devAuthBypassUserId: 'dev-user',
        devAuthBypassEmail: '',
      }),
    ).toBe(true);

    expect(
      isDeveloperBypassConfigured({
        devAuthBypassEnabled: true,
        devAuthBypassToken: '',
        devAuthBypassUserId: 'dev-user',
        devAuthBypassEmail: '',
      }),
    ).toBe(false);
  });

  it('validates persisted mobile auth session payloads', () => {
    expect(
      isMobileAuthSession({
        accessToken: 'dev-token',
        provider: 'dev-bypass',
        user: {
          id: 'dev-user',
          email: 'developer@example.com',
          provider: 'dev-bypass',
        },
      }),
    ).toBe(true);

    expect(
      isMobileAuthSession({
        provider: 'dev-bypass',
        user: {
          id: 'dev-user',
          email: 'developer@example.com',
          provider: 'dev-bypass',
        },
      }),
    ).toBe(false);
  });
});
