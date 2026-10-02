import { describe, expect, it } from 'vitest';

import type { AutocompleteSuggestion } from '@defensivepedal/core';

import { mergeRecentsWithResults } from './search-merge';

const recent = (label: string): AutocompleteSuggestion => ({
  id: `recent-${label}`,
  label,
  primaryText: label,
  coordinates: { lat: 44.4, lon: 26.1 },
});

// Live results carry no coordinates: they come from /suggest alone.
const result = (label: string, id = `mb-${label}`): AutocompleteSuggestion => ({
  id,
  label,
  primaryText: label,
});

describe('mergeRecentsWithResults', () => {
  it('puts recents that match the query first', () => {
    const merged = mergeRecentsWithResults(
      [recent('Piata Unirii, Bucuresti'), recent('Gara de Nord')],
      [result('Piata Romana, Bucuresti')],
      'piata',
    );
    expect(merged.map((s) => s.label)).toEqual([
      'Piata Unirii, Bucuresti',
      'Piata Romana, Bucuresti',
    ]);
  });

  it('hides a search result that is the same place as a matching recent', () => {
    const merged = mergeRecentsWithResults(
      [recent('Piata Unirii, Bucuresti')],
      [result('piata unirii, bucuresti'), result('Piata Romana, Bucuresti')],
      'piata',
    );
    expect(merged.map((s) => s.id)).toEqual(['recent-Piata Unirii, Bucuresti', 'mb-Piata Romana, Bucuresti']);
  });

  it('returns results untouched for a query under two characters', () => {
    const results = [result('Piata Romana')];
    expect(mergeRecentsWithResults([recent('Piata Unirii')], results, 'p')).toBe(results);
  });
});
