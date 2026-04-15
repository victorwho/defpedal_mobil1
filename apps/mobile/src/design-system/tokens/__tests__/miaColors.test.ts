// @vitest-environment happy-dom
/**
 * miaColors Token — Unit Tests
 *
 * Tests color palette structure and type exports.
 */
import { describe, expect, it } from 'vitest';
import { miaLevelColors, type MiaLevelColorKey } from '../miaColors';

describe('miaLevelColors', () => {
  it('exports color objects for levels 2 through 5', () => {
    const keys: MiaLevelColorKey[] = ['level2', 'level3', 'level4', 'level5'];
    for (const key of keys) {
      expect(miaLevelColors[key]).toBeDefined();
    }
  });

  it('each level has primary, secondary, and particle colors', () => {
    for (const level of Object.values(miaLevelColors)) {
      expect(level).toHaveProperty('primary');
      expect(level).toHaveProperty('secondary');
      expect(level).toHaveProperty('particle');
      expect(typeof level.primary).toBe('string');
      expect(typeof level.secondary).toBe('string');
      expect(typeof level.particle).toBe('string');
    }
  });

  it('all colors are valid hex strings', () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const level of Object.values(miaLevelColors)) {
      expect(level.primary).toMatch(hexRegex);
      expect(level.secondary).toMatch(hexRegex);
      expect(level.particle).toMatch(hexRegex);
    }
  });

  it('does not include level1 (level 1 has no celebration)', () => {
    expect((miaLevelColors as any).level1).toBeUndefined();
  });
});
