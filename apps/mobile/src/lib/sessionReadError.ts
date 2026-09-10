import { isAuthError } from '@supabase/supabase-js';

/**
 * What a THROW from `getCurrentSession()` means.
 *
 * supabase-js does not throw for an expired or revoked refresh token: it
 * returns `{ session: null, error }` (and removes the stored session itself).
 * The only things that reach a `catch` around the session read are failures
 * of the read: the secure-store adapter rejecting, the keystore refusing,
 * a malformed payload. Those say nothing about whether the rider is signed
 * in. The session is still on disk; we just could not open it right now.
 *
 * Treating such a failure as "expired" and clearing the local session is how
 * preview v0.2.155 signed every rider out (error-log #116): R8 broke the
 * secure-store argument conversion, the read threw, the provider signed out.
 * A transient keystore error on any build would do the same.
 */
export type SessionReadFailure = 'invalid_session' | 'read_failure';

export const classifySessionReadError = (error: unknown): SessionReadFailure =>
  isAuthError(error) ? 'invalid_session' : 'read_failure';

/** Short, user-safe description for diagnostics and the auth error banner. */
export const describeSessionReadError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message.slice(0, 160);
  if (typeof error === 'string' && error) return error.slice(0, 160);
  return 'unknown error';
};
