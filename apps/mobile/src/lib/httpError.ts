/**
 * Tiny HTTP-status-bearing error. Lives in its own file (rather than inside
 * api.ts) so pure-logic callers and their unit tests can import it without
 * pulling expo-constants into the test environment.
 *
 * Used by `requestJson` in api.ts to throw on non-ok responses, and by the
 * offline sync manager to classify 4xx (permanent) vs 5xx/timeout/network
 * (transient).
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
