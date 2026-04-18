import { describe, it, expect } from 'vitest';
import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  SHARE_CODE_REGEX,
  ShareCodeCollisionError,
  generateShareCode,
  generateUniqueShareCode,
  isValidShareCode,
} from './shareCodeGenerator';

/** Build a deterministic random source that cycles through the given values. */
const makeRandomSource = (values: number[]): (() => number) => {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
};

describe('generateShareCode', () => {
  it('produces a code of exactly 8 characters', () => {
    const code = generateShareCode();
    expect(code).toHaveLength(SHARE_CODE_LENGTH);
  });

  it('produces a 500-iteration sample with only base62 characters', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateShareCode();
      expect(code).toMatch(SHARE_CODE_REGEX);
    }
  });

  it('uses the first alphabet char when randomSource returns 0', () => {
    const code = generateShareCode(() => 0);
    expect(code).toBe(SHARE_CODE_ALPHABET[0].repeat(SHARE_CODE_LENGTH));
  });

  it('uses the last alphabet char when randomSource returns just under 1', () => {
    // Math.floor(0.9999 * 62) = 61 → last index
    const code = generateShareCode(() => 0.9999);
    const last = SHARE_CODE_ALPHABET[SHARE_CODE_ALPHABET.length - 1];
    expect(code).toBe(last.repeat(SHARE_CODE_LENGTH));
  });

  it('is deterministic when randomSource is deterministic', () => {
    const rs = makeRandomSource([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    const a = generateShareCode(rs);
    const b = generateShareCode(makeRandomSource([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));
    expect(a).toBe(b);
  });
});

describe('isValidShareCode', () => {
  it('accepts valid 8-char base62 codes', () => {
    expect(isValidShareCode('abcd1234')).toBe(true);
    expect(isValidShareCode('ZZZZZZZZ')).toBe(true);
    expect(isValidShareCode('00000000')).toBe(true);
    expect(isValidShareCode('aB3cD9eF')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidShareCode('abc')).toBe(false);
    expect(isValidShareCode('abcdefghi')).toBe(false);
    expect(isValidShareCode('')).toBe(false);
  });

  it('rejects non-base62 characters', () => {
    expect(isValidShareCode('abcd-234')).toBe(false);
    expect(isValidShareCode('abcd 234')).toBe(false);
    expect(isValidShareCode('abcd+234')).toBe(false);
    expect(isValidShareCode('abcd/234')).toBe(false);
  });
});

describe('generateUniqueShareCode', () => {
  it('returns the first candidate when it is unique', async () => {
    const isCodeUnique = async (): Promise<boolean> => true;
    const code = await generateUniqueShareCode({ isCodeUnique });
    expect(isValidShareCode(code)).toBe(true);
  });

  it('retries when the first candidate collides, then returns', async () => {
    // First two calls return false (collision), third true.
    const answers = [false, false, true];
    let idx = 0;
    const isCodeUnique = async (): Promise<boolean> => {
      const answer = answers[idx];
      idx += 1;
      return answer;
    };

    const code = await generateUniqueShareCode({ isCodeUnique });
    expect(idx).toBe(3); // called exactly 3 times
    expect(isValidShareCode(code)).toBe(true);
  });

  it('throws ShareCodeCollisionError after maxAttempts', async () => {
    const isCodeUnique = async (): Promise<boolean> => false;

    await expect(
      generateUniqueShareCode({ isCodeUnique, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(ShareCodeCollisionError);
  });

  it('ShareCodeCollisionError carries the attempt count and last candidate', async () => {
    const isCodeUnique = async (): Promise<boolean> => false;
    try {
      await generateUniqueShareCode({
        isCodeUnique,
        randomSource: () => 0, // last candidate will be all-zeros
        maxAttempts: 5,
      });
      throw new Error('Expected ShareCodeCollisionError');
    } catch (err) {
      expect(err).toBeInstanceOf(ShareCodeCollisionError);
      const collisionErr = err as ShareCodeCollisionError;
      expect(collisionErr.attempts).toBe(5);
      expect(collisionErr.lastCandidate).toBe('0'.repeat(SHARE_CODE_LENGTH));
    }
  });

  it('uses the injected randomSource so callers can be deterministic in tests', async () => {
    const isCodeUnique = async (): Promise<boolean> => true;
    const code = await generateUniqueShareCode({
      isCodeUnique,
      randomSource: () => 0,
    });
    expect(code).toBe(SHARE_CODE_ALPHABET[0].repeat(SHARE_CODE_LENGTH));
  });

  it('defaults to 8 attempts when maxAttempts not specified', async () => {
    let callCount = 0;
    const isCodeUnique = async (): Promise<boolean> => {
      callCount += 1;
      return false;
    };

    await expect(
      generateUniqueShareCode({ isCodeUnique }),
    ).rejects.toBeInstanceOf(ShareCodeCollisionError);
    expect(callCount).toBe(8);
  });
});
