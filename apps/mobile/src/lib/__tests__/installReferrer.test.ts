// @vitest-environment node
/**
 * installReferrer — Unit Tests
 *
 * Verifies the NativeModules guard (error-log #23), flavor skipping,
 * and share-param parsing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — configured via closure vars so each test can flip them
// ---------------------------------------------------------------------------

let mockPlatform: 'android' | 'ios' = 'android';
let mockAppVariant: string = 'production';
let mockNativeModuleAvailable = true;

// Callback payload the module passes to the consumer
let mockReferrerValue: { installReferrer?: string } | null = {
  installReferrer: 'utm_source=sms&share=abcd1234',
};
let mockReferrerError: string | null = null;

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
  NativeModules: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'PlayInstallReferrer') {
          return mockNativeModuleAvailable
            ? ({ getInstallReferrerInfo: vi.fn() } as Record<string, unknown>)
            : undefined;
        }
        return undefined;
      },
    },
  ),
}));

vi.mock('../env', () => ({
  mobileEnv: {
    get appVariant() {
      return mockAppVariant;
    },
  },
}));

// The community module — top-level import throws on missing native
// bridge in real life, but here we stub a working implementation that
// the loader falls through to when the NativeModules guard passes.
vi.mock('react-native-play-install-referrer', () => ({
  PlayInstallReferrer: {
    getInstallReferrerInfo: (
      cb: (value: unknown, error: string | null) => void,
    ) => {
      cb(mockReferrerValue, mockReferrerError);
    },
  },
}));

const { readInstallReferrer, parseShareCodeFromReferrer } = await import(
  '../installReferrer'
);

// ---------------------------------------------------------------------------
// parseShareCodeFromReferrer — pure unit tests
// ---------------------------------------------------------------------------

describe('parseShareCodeFromReferrer', () => {
  it('extracts share= value', () => {
    expect(
      parseShareCodeFromReferrer('utm_source=sms&share=abcd1234&utm_medium=x'),
    ).toBe('abcd1234');
  });

  it('returns null when share param is missing', () => {
    expect(
      parseShareCodeFromReferrer('utm_source=sms&utm_medium=x'),
    ).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseShareCodeFromReferrer('')).toBeNull();
    expect(parseShareCodeFromReferrer(null)).toBeNull();
    expect(parseShareCodeFromReferrer(undefined)).toBeNull();
  });

  it('returns null for non-base62 share value', () => {
    expect(parseShareCodeFromReferrer('share=bad-code')).toBeNull();
    expect(parseShareCodeFromReferrer('share=too_short')).toBeNull();
  });

  it('returns null for wrong-length code', () => {
    expect(parseShareCodeFromReferrer('share=abc')).toBeNull();
    expect(parseShareCodeFromReferrer('share=abcdefghi')).toBeNull();
  });

  it('preserves code case (base62 is case-sensitive)', () => {
    expect(parseShareCodeFromReferrer('share=AbCdEfGh')).toBe('AbCdEfGh');
  });
});

// ---------------------------------------------------------------------------
// readInstallReferrer — integration tests with mocked native layer
// ---------------------------------------------------------------------------

describe('readInstallReferrer', () => {
  beforeEach(() => {
    mockPlatform = 'android';
    mockAppVariant = 'production';
    mockNativeModuleAvailable = true;
    mockReferrerValue = { installReferrer: 'share=abcd1234' };
    mockReferrerError = null;
  });

  it('returns null on iOS', async () => {
    mockPlatform = 'ios';
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null on development variant (not a Play Store install)', async () => {
    mockAppVariant = 'development';
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null on preview variant', async () => {
    mockAppVariant = 'preview';
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null when the native module is not linked (error-log #23 guard)', async () => {
    mockNativeModuleAvailable = false;
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null when the referrer callback reports an error', async () => {
    mockReferrerValue = null;
    mockReferrerError = 'FEATURE_NOT_SUPPORTED';
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null when installReferrer string is empty', async () => {
    mockReferrerValue = { installReferrer: '' };
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null when the referrer has no share= param', async () => {
    mockReferrerValue = {
      installReferrer: 'utm_source=organic&utm_medium=none',
    };
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns null when share= value fails base62 validation', async () => {
    mockReferrerValue = { installReferrer: 'share=not-a-code' };
    expect(await readInstallReferrer()).toBeNull();
  });

  it('returns the code on a valid production Play Store install', async () => {
    mockReferrerValue = {
      installReferrer:
        'utm_source=share_link&share=abcd1234&utm_medium=sms',
    };
    expect(await readInstallReferrer()).toBe('abcd1234');
  });
});
