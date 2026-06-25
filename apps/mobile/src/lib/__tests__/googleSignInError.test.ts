import { describe, it, expect } from 'vitest';

import { classifyGoogleSignInError } from '../supabase';

describe('classifyGoogleSignInError', () => {
  it('detects the AppAuth iat clock-skew error (full native string)', () => {
    const err = new Error(
      'RNGoogleSignIn: Unknown error in google sign in., Error ' +
        'Domain=org.openid.appauth.general Code=-15 "Issued at time is more ' +
        'than 600 seconds before or after the current time"',
    );
    expect(classifyGoogleSignInError(err).code).toBe('clock_skew');
  });

  it('matches the short "600 seconds" phrasing', () => {
    expect(classifyGoogleSignInError(new Error('iat off by 600 seconds')).code).toBe('clock_skew');
  });

  it('matches the AppAuth Code=-15 marker', () => {
    expect(classifyGoogleSignInError(new Error('appauth error code=-15')).code).toBe('clock_skew');
  });

  it('falls back to generic for unrelated failures', () => {
    expect(classifyGoogleSignInError(new Error('network request failed')).code).toBe('generic');
  });

  it('handles non-Error inputs without throwing', () => {
    expect(classifyGoogleSignInError('Issued at time is more than 600 seconds').code).toBe('clock_skew');
    expect(classifyGoogleSignInError(undefined).code).toBe('generic');
    expect(classifyGoogleSignInError(null).code).toBe('generic');
    expect(classifyGoogleSignInError({ weird: true }).code).toBe('generic');
  });

  it('always returns a non-empty fallback message', () => {
    expect(classifyGoogleSignInError(new Error('x')).message.length).toBeGreaterThan(0);
    expect(classifyGoogleSignInError(new Error('Issued at time')).message.length).toBeGreaterThan(0);
  });
});
