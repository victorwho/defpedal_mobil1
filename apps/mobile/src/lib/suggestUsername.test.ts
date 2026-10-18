import { describe, expect, it } from 'vitest';

import { suggestUsername } from './suggestUsername';

const VALID = /^[a-zA-Z0-9_]{3,30}$/;

describe('suggestUsername', () => {
  it('builds from the display name, folding accents and spaces', () => {
    expect(suggestUsername('Ștefan Ionescu', null)).toBe('stefan_ionescu');
  });

  it('falls back to the email local part', () => {
    expect(suggestUsername(null, 'ana.maria+bike@example.com')).toBe('ana_maria_bike');
  });

  it('falls back to rider_NNNN when nothing usable exists', () => {
    expect(suggestUsername('', 'x@y.z', () => 0.0421)).toBe('rider_0421');
  });

  it('always satisfies the username rule, including very long names', () => {
    for (const name of ['A'.repeat(80), '  --  ', 'Jo', 'Zoë O’Brien-Smith', '张伟']) {
      expect(suggestUsername(name, null, () => 0.5)).toMatch(VALID);
    }
  });
});
