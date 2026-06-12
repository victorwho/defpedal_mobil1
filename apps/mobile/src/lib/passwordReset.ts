/**
 * Forgot-password flow (review 2026-06-12, P1: email users who forgot their
 * password had zero recovery path — no resetPasswordForEmail call existed
 * anywhere, and lockout meant losing the account's rides/XP/badges).
 *
 * Flow:
 *   1. auth.tsx "Forgot password?" → requestPasswordReset(email). Supabase
 *      sends a recovery email whose link routes through the same HTTPS
 *      email-confirm edge function used by signup confirmation (it forwards
 *      every query param), landing on ${appScheme}://auth/callback.
 *   2. AuthSessionProvider's existing deep-link handler exchanges the PKCE
 *      code (same-device) or verifies the OTP token_hash (type=recovery,
 *      cross-device) — the user now holds a recovery session.
 *   3. Recovery detection: the PKCE redirect carries no type discriminator
 *      (and we deliberately keep redirectTo byte-identical to the signup one
 *      so the Supabase redirect allow-list cannot reject it), so step 1
 *      persists a timestamp via keyValueStorage. When an auth/callback link
 *      succeeds while that flag is fresh — or when type=recovery is explicit
 *      — the provider routes to /reset-password.
 *   4. /reset-password calls updatePassword (supabase.auth.updateUser).
 *
 * The flag is persisted (not in-memory) because the app is usually killed
 * while the user reads their email.
 */
import { keyValueStorage } from './storage';

const PENDING_RESET_KEY = 'defensivepedal.passwordResetRequestedAt';

/** Recovery links expire server-side; treat our local flag the same way. */
const PENDING_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export const markPasswordResetRequested = async (): Promise<void> => {
  await keyValueStorage.setString(PENDING_RESET_KEY, new Date().toISOString());
};

/**
 * Returns true (and clears the flag) when a password reset was requested
 * within the TTL. Consuming guarantees a later unrelated auth/callback link
 * can't be misread as a recovery.
 */
export const consumePendingPasswordReset = async (): Promise<boolean> => {
  const raw = await keyValueStorage.getString(PENDING_RESET_KEY);
  if (!raw) return false;
  await keyValueStorage.delete(PENDING_RESET_KEY);
  const requestedAt = Date.parse(raw);
  if (!Number.isFinite(requestedAt)) return false;
  return Date.now() - requestedAt < PENDING_RESET_TTL_MS;
};
