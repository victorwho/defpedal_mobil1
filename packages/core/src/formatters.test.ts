import { describe, expect, it } from 'vitest';

import type { Step } from './types';
import {
  formatDistance,
  formatDuration,
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
