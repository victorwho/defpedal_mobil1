import { describe, expect, it } from 'vitest';

import { matchSavedPlaceKeyword } from './savedPlaceKeywords';

describe('matchSavedPlaceKeyword', () => {
  it('matches English home/work', () => {
    expect(matchSavedPlaceKeyword('home')).toBe('home');
    expect(matchSavedPlaceKeyword('work')).toBe('work');
  });

  it('matches Romanian synonyms (diacritic-insensitive)', () => {
    expect(matchSavedPlaceKeyword('acasă')).toBe('home');
    expect(matchSavedPlaceKeyword('acasa')).toBe('home');
    expect(matchSavedPlaceKeyword('birou')).toBe('work');
    expect(matchSavedPlaceKeyword('serviciu')).toBe('work');
  });

  it('matches Spanish synonyms', () => {
    expect(matchSavedPlaceKeyword('casa')).toBe('home');
    expect(matchSavedPlaceKeyword('trabajo')).toBe('work');
    expect(matchSavedPlaceKeyword('oficina')).toBe('work');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(matchSavedPlaceKeyword('  HOME ')).toBe('home');
    expect(matchSavedPlaceKeyword('Work')).toBe('work');
  });

  it('returns null for non-keywords and empty input', () => {
    expect(matchSavedPlaceKeyword('gym')).toBeNull();
    expect(matchSavedPlaceKeyword('homely')).toBeNull();
    expect(matchSavedPlaceKeyword('')).toBeNull();
    expect(matchSavedPlaceKeyword('   ')).toBeNull();
  });
});
