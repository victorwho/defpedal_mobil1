/**
 * Route-share code generator.
 *
 * Produces short, URL-safe 8-character codes from the base62 alphabet
 * (0-9, A-Z, a-z). 62^8 ≈ 2.18 × 10^14 possibilities — collision vanishingly
 * rare, but the caller injects an async `isCodeUnique` checker and we retry
 * up to `maxAttempts` times if the code is already taken.
 *
 * Pure module — `randomSource` is injected so tests can be deterministic.
 */

export const SHARE_CODE_LENGTH = 8;
export const SHARE_CODE_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHARE_CODE_DEFAULT_MAX_ATTEMPTS = 8;

/** Regex that matches a syntactically valid share code. */
export const SHARE_CODE_REGEX = /^[0-9A-Za-z]{8}$/;

export type ShareCodeRandomSource = () => number;

export interface GenerateUniqueShareCodeOptions {
  /** Async predicate that returns true if the code is NOT already in the DB. */
  isCodeUnique: (code: string) => Promise<boolean>;
  /** Deterministic random source for tests. Defaults to Math.random. */
  randomSource?: ShareCodeRandomSource;
  /** How many collision retries before throwing. Default 8. */
  maxAttempts?: number;
}

export class ShareCodeCollisionError extends Error {
  readonly attempts: number;
  readonly lastCandidate: string;

  constructor(attempts: number, lastCandidate: string) {
    super(
      `Failed to generate a unique share code after ${attempts} attempts (last candidate: ${lastCandidate}).`,
    );
    this.name = 'ShareCodeCollisionError';
    this.attempts = attempts;
    this.lastCandidate = lastCandidate;
  }
}

/**
 * Synchronously generate a single 8-char base62 share code.
 *
 * Exported for testability (charset / length properties) and for the web
 * viewer, which only needs to validate syntactic form.
 */
export function generateShareCode(
  randomSource: ShareCodeRandomSource = Math.random,
): string {
  const chars: string[] = [];
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    const idx = Math.floor(randomSource() * SHARE_CODE_ALPHABET.length);
    chars.push(SHARE_CODE_ALPHABET[idx]);
  }
  return chars.join('');
}

/** True iff `code` matches the canonical 8-char base62 form. */
export function isValidShareCode(code: string): boolean {
  return SHARE_CODE_REGEX.test(code);
}

/**
 * Generate a unique share code, retrying on collisions.
 *
 * Throws `ShareCodeCollisionError` after `maxAttempts` (default 8) — at
 * that point the caller should surface a server error; something is wrong
 * with the random source or the keyspace is saturated.
 */
export async function generateUniqueShareCode(
  options: GenerateUniqueShareCodeOptions,
): Promise<string> {
  const {
    isCodeUnique,
    randomSource = Math.random,
    maxAttempts = SHARE_CODE_DEFAULT_MAX_ATTEMPTS,
  } = options;

  let lastCandidate = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = generateShareCode(randomSource);
    lastCandidate = candidate;
    const unique = await isCodeUnique(candidate);
    if (unique) {
      return candidate;
    }
  }

  throw new ShareCodeCollisionError(maxAttempts, lastCandidate);
}
