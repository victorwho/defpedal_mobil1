/**
 * Give a promise a deadline.
 *
 * For work that improves a response but must never delay it. The mobile app
 * has the same helper for its canopy lookup (mapbox-routing.ts,
 * CANOPY_WAIT_DEADLINE_MS) and the reasoning carries over: failing open has to
 * mean unaffected in TIME as well as in content, or the fallback is not a
 * fallback.
 */

/**
 * Resolve `promise`, or `undefined` if it has not settled within `ms`.
 *
 * The loser of the race is abandoned, not cancelled — it keeps running and may
 * still reject. Unlike the mobile version, whose promise cannot reject, this
 * one wraps callers that do network I/O, so the rejection is swallowed here.
 * Without that, an upstream failing *after* the deadline would surface as an
 * unhandled rejection and take down the process under Node's default policy.
 *
 * Pass an already-started promise: the deadline covers the wait, not the setup.
 */
export const resolveWithinDeadline = async <T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> => {
  // Attached before the race so there is no window in which the promise is
  // unobserved. `.catch()` returns a new promise; the original is what races.
  promise.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } catch {
    // A rejection before the deadline is the same outcome as missing it: the
    // caller wanted this value only if it was cheap and available.
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
