import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { areNudgesEnabled, isAnonPushEnabled } from './killSwitch';

describe('areNudgesEnabled', () => {
  const original = process.env.NUDGES_ENABLED;

  beforeEach(() => {
    delete process.env.NUDGES_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NUDGES_ENABLED;
    } else {
      process.env.NUDGES_ENABLED = original;
    }
  });

  it('defaults to enabled when env var is unset', () => {
    expect(areNudgesEnabled()).toBe(true);
  });

  it('returns false when set to "false"', () => {
    process.env.NUDGES_ENABLED = 'false';
    expect(areNudgesEnabled()).toBe(false);
  });

  it('returns false when set to "FALSE" (case-insensitive)', () => {
    process.env.NUDGES_ENABLED = 'FALSE';
    expect(areNudgesEnabled()).toBe(false);
  });

  it('returns false when set to "0"', () => {
    process.env.NUDGES_ENABLED = '0';
    expect(areNudgesEnabled()).toBe(false);
  });

  it('returns false when set to "off"', () => {
    process.env.NUDGES_ENABLED = 'off';
    expect(areNudgesEnabled()).toBe(false);
  });

  it('returns true when set to "true"', () => {
    process.env.NUDGES_ENABLED = 'true';
    expect(areNudgesEnabled()).toBe(true);
  });

  it('returns true for an unrecognised value (fail open)', () => {
    process.env.NUDGES_ENABLED = 'maybe';
    expect(areNudgesEnabled()).toBe(true);
  });

  it('returns true for an empty string', () => {
    process.env.NUDGES_ENABLED = '';
    expect(areNudgesEnabled()).toBe(true);
  });

  it('trims surrounding whitespace before comparing', () => {
    process.env.NUDGES_ENABLED = '  false  ';
    expect(areNudgesEnabled()).toBe(false);
  });
});

describe('isAnonPushEnabled', () => {
  const original = process.env.ANON_PUSH_ENABLED;

  beforeEach(() => {
    delete process.env.ANON_PUSH_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ANON_PUSH_ENABLED;
    } else {
      process.env.ANON_PUSH_ENABLED = original;
    }
  });

  it('defaults to DISABLED when env var is unset (fail closed — opposite of NUDGES_ENABLED)', () => {
    expect(isAnonPushEnabled()).toBe(false);
  });

  it('returns true only for explicit "true"', () => {
    process.env.ANON_PUSH_ENABLED = 'true';
    expect(isAnonPushEnabled()).toBe(true);
  });

  it('accepts "TRUE" (case-insensitive), "1" and "on"', () => {
    process.env.ANON_PUSH_ENABLED = 'TRUE';
    expect(isAnonPushEnabled()).toBe(true);
    process.env.ANON_PUSH_ENABLED = '1';
    expect(isAnonPushEnabled()).toBe(true);
    process.env.ANON_PUSH_ENABLED = 'on';
    expect(isAnonPushEnabled()).toBe(true);
  });

  it('returns false for "false", empty string, and unrecognised values (fail closed)', () => {
    process.env.ANON_PUSH_ENABLED = 'false';
    expect(isAnonPushEnabled()).toBe(false);
    process.env.ANON_PUSH_ENABLED = '';
    expect(isAnonPushEnabled()).toBe(false);
    process.env.ANON_PUSH_ENABLED = 'maybe';
    expect(isAnonPushEnabled()).toBe(false);
  });

  it('trims surrounding whitespace before comparing', () => {
    process.env.ANON_PUSH_ENABLED = '  true  ';
    expect(isAnonPushEnabled()).toBe(true);
  });
});
