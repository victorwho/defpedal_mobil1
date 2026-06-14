/**
 * Anonymous → account data-merge handoff (review P1 #10).
 *
 * The signup flow creates a NEW auth user and abandons the anonymous uid, so
 * the anon account's rides/XP/badges/streak would be orphaned. To re-parent
 * them, the server needs the anonymous access token as proof of ownership —
 * but by the time a non-anonymous session appears, the anon session is gone.
 *
 * So we capture the anon access token at sign-in *initiation* (while still
 * anonymous) and persist it here. `AnonMergeManager` reads it once a
 * non-anonymous session is established and calls POST /v1/account/merge-anonymous.
 * Persisting (not in-memory) lets it survive the email-confirm round-trip +
 * app restart. Anon access tokens are short-lived (~1h), so a late email
 * confirmation simply finds an expired token and the merge gives up gracefully.
 */
import { keyValueStorage } from './storage';

const PENDING_KEY = 'defensivepedal.anonMergePending';
const PENDING_TTL_MS = 60 * 60 * 1000; // matches the anon access-token lifetime

type PendingRecord = { anonAccessToken: string; requestedAt: string };

export const markAnonMergePending = async (anonAccessToken: string): Promise<void> => {
  const record: PendingRecord = {
    anonAccessToken,
    requestedAt: new Date().toISOString(),
  };
  await keyValueStorage.setString(PENDING_KEY, JSON.stringify(record));
};

/** Returns the pending anon access token if one was captured within the TTL. */
export const readAnonMergePending = async (): Promise<string | null> => {
  const raw = await keyValueStorage.getString(PENDING_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PendingRecord;
    const requestedAt = Date.parse(record.requestedAt);
    if (
      !record.anonAccessToken ||
      !Number.isFinite(requestedAt) ||
      Date.now() - requestedAt > PENDING_TTL_MS
    ) {
      await keyValueStorage.delete(PENDING_KEY);
      return null;
    }
    return record.anonAccessToken;
  } catch {
    await keyValueStorage.delete(PENDING_KEY);
    return null;
  }
};

export const clearAnonMergePending = async (): Promise<void> => {
  await keyValueStorage.delete(PENDING_KEY);
};
