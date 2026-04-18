import { describe, it, expect } from 'vitest';
import {
  InvalidShareCodeError,
  SHARE_HOST,
  SHARE_PATH_PREFIX,
  buildShareDeepLinks,
} from './shareDeepLinkBuilder';

describe('buildShareDeepLinks', () => {
  it('returns appUrl === webUrl (single universal link surface)', () => {
    const { appUrl, webUrl } = buildShareDeepLinks('abcd1234');
    expect(appUrl).toBe(webUrl);
  });

  it('builds the default https://routes.defensivepedal.com/r/<code> URL', () => {
    const { appUrl } = buildShareDeepLinks('abcd1234');
    expect(appUrl).toBe(`https://${SHARE_HOST}${SHARE_PATH_PREFIX}abcd1234`);
  });

  it('uses https (not http) scheme', () => {
    const { appUrl } = buildShareDeepLinks('abcd1234');
    expect(appUrl.startsWith('https://')).toBe(true);
  });

  it('includes the exact code (case-sensitive) in the path', () => {
    const { appUrl } = buildShareDeepLinks('AbCdEfGh');
    expect(appUrl).toContain('/r/AbCdEfGh');
  });

  it('accepts a custom host override for staging/preview envs', () => {
    const { appUrl, webUrl } = buildShareDeepLinks('abcd1234', {
      host: 'staging.routes.defensivepedal.com',
    });
    expect(appUrl).toBe(
      'https://staging.routes.defensivepedal.com/r/abcd1234',
    );
    expect(webUrl).toBe(appUrl);
  });

  it('throws InvalidShareCodeError for malformed codes', () => {
    expect(() => buildShareDeepLinks('too-short')).toThrow(
      InvalidShareCodeError,
    );
    expect(() => buildShareDeepLinks('')).toThrow(InvalidShareCodeError);
    expect(() => buildShareDeepLinks('has space')).toThrow(
      InvalidShareCodeError,
    );
    expect(() => buildShareDeepLinks('9characts')).toThrow(
      InvalidShareCodeError,
    );
  });

  it('InvalidShareCodeError carries the offending code', () => {
    try {
      buildShareDeepLinks('bad');
      throw new Error('Expected InvalidShareCodeError');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidShareCodeError);
      expect((err as InvalidShareCodeError).code).toBe('bad');
    }
  });
});
