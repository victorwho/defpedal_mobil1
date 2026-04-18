// @vitest-environment node
/**
 * shareDeepLinkParser — Unit Tests
 *
 * Verifies both URL shapes are recognised, query params are tolerated,
 * base62 validation rejects malformed codes, and wrong host / wrong path
 * return null.
 */
import { describe, expect, it, vi } from 'vitest';

// Mock expo-linking with a minimal parser that mimics the fields we use
// (hostname + path). Pure-JS so there's no native-module boot needed.
vi.mock('expo-linking', () => ({
  parse: (url: string) => {
    try {
      // Strip scheme to reuse the URL API for path extraction.
      const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):\/\//i);
      if (!schemeMatch) {
        throw new Error('invalid url');
      }
      const scheme = schemeMatch[1];
      const afterScheme = url.slice(schemeMatch[0].length);
      // Split off query + fragment so path doesn't include them.
      const qIdx = afterScheme.search(/[?#]/);
      const withoutQuery = qIdx >= 0 ? afterScheme.slice(0, qIdx) : afterScheme;
      const slashIdx = withoutQuery.indexOf('/');
      const hostname =
        slashIdx >= 0 ? withoutQuery.slice(0, slashIdx) : withoutQuery;
      const path = slashIdx >= 0 ? withoutQuery.slice(slashIdx) : '';
      return { scheme, hostname, path };
    } catch {
      throw new Error('invalid url');
    }
  },
}));

const { extractRouteShareCode } = await import('../shareDeepLinkParser');

describe('extractRouteShareCode — universal link shape', () => {
  it('extracts code from https://routes.defensivepedal.com/r/<code>', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abcd1234'),
    ).toBe('abcd1234');
  });

  it('accepts trailing slash', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abcd1234/'),
    ).toBe('abcd1234');
  });

  it('preserves code case (base62 is case-sensitive)', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/AbCdEfGh'),
    ).toBe('AbCdEfGh');
  });

  it('tolerates query params after the code', () => {
    expect(
      extractRouteShareCode(
        'https://routes.defensivepedal.com/r/abcd1234?utm_source=sms',
      ),
    ).toBe('abcd1234');
  });

  it('tolerates fragment after the code', () => {
    expect(
      extractRouteShareCode(
        'https://routes.defensivepedal.com/r/abcd1234#fragment',
      ),
    ).toBe('abcd1234');
  });
});

describe('extractRouteShareCode — app-scheme shape', () => {
  it('extracts from defensivepedal-dev://route-share/<code>', () => {
    expect(
      extractRouteShareCode('defensivepedal-dev://route-share/abcd1234'),
    ).toBe('abcd1234');
  });

  it('extracts from defensivepedal-preview://route-share/<code>', () => {
    expect(
      extractRouteShareCode('defensivepedal-preview://route-share/ZZZZZZZZ'),
    ).toBe('ZZZZZZZZ');
  });

  it('extracts from production defensivepedal://route-share/<code>', () => {
    expect(
      extractRouteShareCode('defensivepedal://route-share/00000000'),
    ).toBe('00000000');
  });
});

describe('extractRouteShareCode — rejection matrix', () => {
  it('rejects wrong host', () => {
    expect(
      extractRouteShareCode('https://defensivepedal.com/r/abcd1234'),
    ).toBeNull();
    expect(
      extractRouteShareCode('https://example.com/r/abcd1234'),
    ).toBeNull();
  });

  it('rejects wrong path prefix on universal link', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/x/abcd1234'),
    ).toBeNull();
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/abcd1234'),
    ).toBeNull();
  });

  it('rejects app-scheme with wrong app host', () => {
    expect(
      extractRouteShareCode('defensivepedal://other-feature/abcd1234'),
    ).toBeNull();
  });

  it('rejects codes that are too short', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abc'),
    ).toBeNull();
  });

  it('rejects codes that are too long', () => {
    expect(
      extractRouteShareCode(
        'https://routes.defensivepedal.com/r/abcd12345',
      ),
    ).toBeNull();
  });

  it('rejects non-base62 characters', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abc-1234'),
    ).toBeNull();
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abc_1234'),
    ).toBeNull();
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/abc.1234'),
    ).toBeNull();
  });

  it('returns null for non-URL garbage', () => {
    expect(extractRouteShareCode('')).toBeNull();
    expect(extractRouteShareCode('not a url')).toBeNull();
    expect(extractRouteShareCode('abcd1234')).toBeNull();
  });

  it('returns null for missing code segment', () => {
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r/'),
    ).toBeNull();
    expect(
      extractRouteShareCode('https://routes.defensivepedal.com/r'),
    ).toBeNull();
  });
});
