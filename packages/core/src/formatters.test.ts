import { describe, expect, it } from 'vitest';

import type { Step } from './types';
import {
  formatDistance,
  formatDistanceParts,
  formatDuration,
  formatDurationShort,
  formatInstruction,
  formatManeuver,
  formatSpeed,
} from './formatters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeStep = (
  type: string,
  modifier?: string,
  name = '',
  distance = 100,
): Step => ({
  intersections: [],
  maneuver: {
    bearing_after: 0,
    bearing_before: 0,
    location: [0, 0],
    type,
    modifier,
  },
  name,
  duration: 30,
  distance,
  driving_side: 'right',
  weight: 30,
  mode: 'cycling',
  geometry: { type: 'LineString', coordinates: [] },
});

// ---------------------------------------------------------------------------
// formatManeuver
// ---------------------------------------------------------------------------

describe('formatManeuver', () => {
  it('returns the capitalised type when no modifier is present', () => {
    expect(formatManeuver(makeStep('depart'))).toBe('Depart');
  });

  it('replaces underscores in type with spaces', () => {
    expect(formatManeuver(makeStep('new_name'))).toBe('New name');
  });

  it('uses the modifier when one is present', () => {
    expect(formatManeuver(makeStep('turn', 'left'))).toBe('Left');
  });

  it('capitalises the first letter of the modifier', () => {
    expect(formatManeuver(makeStep('turn', 'sharp right'))).toBe('Sharp right');
  });

  it('replaces underscores in modifier with spaces', () => {
    expect(formatManeuver(makeStep('turn', 'slight_left'))).toBe('Slight left');
  });
});

// ---------------------------------------------------------------------------
// formatInstruction
// ---------------------------------------------------------------------------

describe('formatInstruction', () => {
  it('appends "onto <name>" when a step name is present', () => {
    const result = formatInstruction(makeStep('turn', 'left', 'Main Street'));
    expect(result).toBe('Left onto Main Street');
  });

  it('returns just the maneuver when name is empty', () => {
    const result = formatInstruction(makeStep('depart', undefined, ''));
    expect(result).toBe('Depart');
  });

  it('returns just the maneuver when name is only whitespace', () => {
    const result = formatInstruction(makeStep('depart', undefined, '   '));
    expect(result).toBe('Depart');
  });
});

// ---------------------------------------------------------------------------
// formatDistance
// ---------------------------------------------------------------------------

describe('formatDistance', () => {
  it('formats distances under 1000m in metres', () => {
    expect(formatDistance(500)).toBe('500 m');
  });

  it('rounds sub-kilometre distances to the nearest metre', () => {
    expect(formatDistance(999.6)).toBe('1000 m');
    expect(formatDistance(999.4)).toBe('999 m');
  });

  it('formats distances of exactly 1000m as "1.0 km"', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
  });

  it('formats distances above 1000m in kilometres with one decimal', () => {
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(12345)).toBe('12.3 km');
  });

  it('formats 0 metres as "0 m"', () => {
    expect(formatDistance(0)).toBe('0 m');
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('returns "< 1 min" for durations under 60 seconds', () => {
    expect(formatDuration(0)).toBe('< 1 min');
    expect(formatDuration(59)).toBe('< 1 min');
  });

  it('returns minutes only for durations under one hour', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3540)).toBe('59 min');
  });

  it('returns whole hours with no remainder', () => {
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(7200)).toBe('2 hr');
  });

  it('returns hours and minutes when there is a remainder', () => {
    expect(formatDuration(3660)).toBe('1 hr 1 min');
    expect(formatDuration(5400)).toBe('1 hr 30 min');
  });

  it('rounds to nearest minute', () => {
    // 90 seconds → 2 min (rounds up)
    expect(formatDuration(90)).toBe('2 min');
    // 89 seconds → 1 min (rounds down, still ≥60)
    expect(formatDuration(89)).toBe('1 min');
  });
});

// ---------------------------------------------------------------------------
// formatSpeed
// ---------------------------------------------------------------------------

describe('formatSpeed', () => {
  it('returns null for null input', () => {
    expect(formatSpeed(null)).toBeNull();
  });

  it('returns null for speeds below 0.5 m/s (effectively stationary)', () => {
    expect(formatSpeed(0)).toBeNull();
    expect(formatSpeed(0.4)).toBeNull();
  });

  it('returns null at exactly 0.5 m/s (boundary — < 0.5 is null)', () => {
    // 0.5 m/s is NOT < 0.5, so it should return a value
    expect(formatSpeed(0.5)).not.toBeNull();
  });

  it('converts m/s to km/h correctly', () => {
    // 5 m/s = 18 km/h
    expect(formatSpeed(5)).toBe('18 km/h');
  });

  it('rounds to the nearest km/h', () => {
    // 4.167 m/s ≈ 15 km/h
    expect(formatSpeed(4.167)).toBe('15 km/h');
  });

  it('formats typical cycling speeds', () => {
    // 4.17 m/s ≈ 15 km/h
    expect(formatSpeed(4.17)).toBe('15 km/h');
    // 8.33 m/s ≈ 30 km/h
    expect(formatSpeed(8.33)).toBe('30 km/h');
  });
});

// ---------------------------------------------------------------------------
// formatDistanceParts — split value/unit for the navigation HUD, where the
// number is rendered ~3x the size of its unit on a separate line.
// ---------------------------------------------------------------------------

describe('formatDistanceParts', () => {
  it('splits sub-kilometre distances into a rounded metre value and "m"', () => {
    expect(formatDistanceParts(102)).toEqual({ value: '102', unit: 'm' });
    expect(formatDistanceParts(35.4)).toEqual({ value: '35', unit: 'm' });
  });

  it('splits kilometre distances into a one-decimal value and "km"', () => {
    expect(formatDistanceParts(13_700)).toEqual({ value: '13.7', unit: 'km' });
    expect(formatDistanceParts(1000)).toEqual({ value: '1.0', unit: 'km' });
  });

  it('switches unit at exactly 1000 m, matching formatDistance', () => {
    expect(formatDistanceParts(999)).toEqual({ value: '999', unit: 'm' });
    expect(formatDistanceParts(1000).unit).toBe('km');
  });

  it('clamps negatives to zero rather than rendering "-5 m"', () => {
    expect(formatDistanceParts(-5)).toEqual({ value: '0', unit: 'm' });
  });

  it('stays consistent with formatDistance for the same input', () => {
    // The HUD and every other surface must never disagree about a distance.
    for (const meters of [0, 35, 102, 999, 1000, 13_700, 42_195]) {
      const { value, unit } = formatDistanceParts(meters);
      expect(`${value} ${unit}`).toBe(formatDistance(meters));
    }
  });
});

// ---------------------------------------------------------------------------
// formatDurationShort — hero remaining-time in the HUD footer. Deliberately
// avoids a bare "1:20" because it sits next to a wall-clock ETA ("14:44").
// ---------------------------------------------------------------------------

describe('formatDurationShort', () => {
  it('renders whole minutes under an hour', () => {
    expect(formatDurationShort(14 * 60)).toEqual({ value: '14', unit: 'min' });
    expect(formatDurationShort(59 * 60)).toEqual({ value: '59', unit: 'min' });
  });

  it('rounds seconds to the nearest minute', () => {
    expect(formatDurationShort(14 * 60 + 29).value).toBe('14');
    expect(formatDurationShort(14 * 60 + 31).value).toBe('15');
  });

  it('shows "<1 min" rather than "0 min" for a nearly-finished ride', () => {
    expect(formatDurationShort(20)).toEqual({ value: '<1', unit: 'min' });
    expect(formatDurationShort(0)).toEqual({ value: '<1', unit: 'min' });
  });

  it('carries an hour marker past 60 min so it cannot read as a clock time', () => {
    expect(formatDurationShort(80 * 60)).toEqual({ value: '1h 20', unit: 'min' });
    expect(formatDurationShort(95 * 60)).toEqual({ value: '1h 35', unit: 'min' });
  });

  it('drops the minute part on a whole hour', () => {
    expect(formatDurationShort(60 * 60)).toEqual({ value: '1', unit: 'h' });
    expect(formatDurationShort(2 * 60 * 60)).toEqual({ value: '2', unit: 'h' });
  });

  it('treats negative remaining time as under a minute', () => {
    expect(formatDurationShort(-120)).toEqual({ value: '<1', unit: 'min' });
  });
});
