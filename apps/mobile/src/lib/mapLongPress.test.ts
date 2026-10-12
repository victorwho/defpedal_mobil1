import { describe, expect, it } from 'vitest';

import { mapLongPressTarget } from './mapLongPress';

const base = { hazardPlacementMode: false, suggestionPlacementMode: false, activeField: null };

describe('mapLongPressTarget', () => {
  it('drops the destination by default, as it always has', () => {
    expect(mapLongPressTarget(base)).toBe('destination');
    expect(mapLongPressTarget({ ...base, activeField: 'destination' })).toBe('destination');
  });

  it('sets the start while the start field is being edited', () => {
    expect(mapLongPressTarget({ ...base, activeField: 'startOverride' })).toBe('start');
  });

  it('keeps the placement modes in charge', () => {
    expect(mapLongPressTarget({ ...base, hazardPlacementMode: true, activeField: 'startOverride' })).toBe('hazard');
    expect(mapLongPressTarget({ ...base, suggestionPlacementMode: true, activeField: 'startOverride' })).toBe('none');
  });
});
