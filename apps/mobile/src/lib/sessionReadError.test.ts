import { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { classifySessionReadError, describeSessionReadError } from './sessionReadError';

describe('classifySessionReadError', () => {
  it('treats a supabase AuthError as an invalid session', () => {
    expect(
      classifySessionReadError(new AuthError('Invalid Refresh Token: Refresh Token Not Found')),
    ).toBe('invalid_session');
  });

  it('treats a secure-store rejection as a read failure, not a sign-out', () => {
    // The exact error from preview v0.2.155 (Sentry 6c01ee64, error-log #116).
    const err = new Error("Call to function 'ExpoSecureStore.getValueWithKeyAsync' has been rejected.");
    expect(classifySessionReadError(err)).toBe('read_failure');
  });

  it('treats anything that is not an AuthError as a read failure', () => {
    expect(classifySessionReadError(new TypeError('null.useContext'))).toBe('read_failure');
    expect(classifySessionReadError({ code: 'E_SECURESTORE' })).toBe('read_failure');
    expect(classifySessionReadError('keystore locked')).toBe('read_failure');
    expect(classifySessionReadError(undefined)).toBe('read_failure');
  });
});

describe('describeSessionReadError', () => {
  it('uses the message of an Error, a string as-is, and a fallback otherwise', () => {
    expect(describeSessionReadError(new Error('boom'))).toBe('boom');
    expect(describeSessionReadError('keystore locked')).toBe('keystore locked');
    expect(describeSessionReadError({})).toBe('unknown error');
  });

  it('bounds the length so a stack-like message cannot flood the banner', () => {
    expect(describeSessionReadError(new Error('x'.repeat(500)))).toHaveLength(160);
  });
});
