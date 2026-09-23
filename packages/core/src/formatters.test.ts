import { describe, expect, it } from 'vitest';

import type { Step } from './types';
import {
  formatDistance,
  formatDistanceParts,
  formatElevation,
  formatElevationParts,
  formatDuration,
  formatDurationShort,
  formatInstruction,
  formatManeuver,
  formatSpeed,
  formatSpeedKmh,
  formatSpeedKmhParts,
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
    expect(formatDistance(500, 'metric')).toBe('500 m');
  });

  it('rounds sub-kilometre distances to the nearest metre', () => {
    expect(formatDistance(999.6, 'metric')).toBe('1000 m');
    expect(formatDistance(999.4, 'metric')).toBe('999 m');
  });

  it('formats distances of exactly 1000m as "1.0 km"', () => {
    expect(formatDistance(1000, 'metric')).toBe('1.0 km');
  });

  it('formats distances above 1000m in kilometres with one decimal', () => {
    expect(formatDistance(1500, 'metric')).toBe('1.5 km');
    expect(formatDistance(12345, 'metric')).toBe('12.3 km');
  });

  it('formats 0 metres as "0 m"', () => {
    expect(formatDistance(0, 'metric')).toBe('0 m');
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
    expect(formatSpeed(null, 'metric')).toBeNull();
  });

  it('returns null for speeds below 0.5 m/s (effectively stationary)', () => {
    expect(formatSpeed(0, 'metric')).toBeNull();
    expect(formatSpeed(0.4, 'metric')).toBeNull();
  });

  it('returns null at exactly 0.5 m/s (boundary — < 0.5 is null)', () => {
    // 0.5 m/s is NOT < 0.5, so it should return a value
    expect(formatSpeed(0.5, 'metric')).not.toBeNull();
  });

  it('converts m/s to km/h correctly', () => {
    // 5 m/s = 18 km/h
    expect(formatSpeed(5, 'metric')).toBe('18 km/h');
  });

  it('rounds to the nearest km/h', () => {
    // 4.167 m/s ≈ 15 km/h
    expect(formatSpeed(4.167, 'metric')).toBe('15 km/h');
  });

  it('formats typical cycling speeds', () => {
    // 4.17 m/s ≈ 15 km/h
    expect(formatSpeed(4.17, 'metric')).toBe('15 km/h');
    // 8.33 m/s ≈ 30 km/h
    expect(formatSpeed(8.33, 'metric')).toBe('30 km/h');
  });
});

// ---------------------------------------------------------------------------
// formatDistanceParts — split value/unit for the navigation HUD, where the
// number is rendered ~3x the size of its unit on a separate line.
// ---------------------------------------------------------------------------

describe('formatDistanceParts', () => {
  it('splits sub-kilometre distances into a rounded metre value and "m"', () => {
    expect(formatDistanceParts(102, 'metric')).toEqual({ value: '102', unit: 'm' });
    expect(formatDistanceParts(35.4, 'metric')).toEqual({ value: '35', unit: 'm' });
  });

  it('splits kilometre distances into a one-decimal value and "km"', () => {
    expect(formatDistanceParts(13_700, 'metric')).toEqual({ value: '13.7', unit: 'km' });
    expect(formatDistanceParts(1000, 'metric')).toEqual({ value: '1.0', unit: 'km' });
  });

  it('switches unit at exactly 1000 m, matching formatDistance', () => {
    expect(formatDistanceParts(999, 'metric')).toEqual({ value: '999', unit: 'm' });
    expect(formatDistanceParts(1000, 'metric').unit).toBe('km');
  });

  it('clamps negatives to zero rather than rendering "-5 m"', () => {
    expect(formatDistanceParts(-5, 'metric')).toEqual({ value: '0', unit: 'm' });
  });

  it('stays consistent with formatDistance for the same input', () => {
    // The HUD and every other surface must never disagree about a distance.
    for (const meters of [0, 35, 102, 999, 1000, 13_700, 42_195]) {
      const { value, unit } = formatDistanceParts(meters, 'metric');
      expect(`${value} ${unit}`).toBe(formatDistance(meters, 'metric'));
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


// ---------------------------------------------------------------------------
// Imperial — distance in miles, short distance and climb in feet, speed in
// mph. Default for UK riders since 2026-09-23, and a toggle for everyone.
// ---------------------------------------------------------------------------

describe('formatDistance — imperial', () => {
  it('renders short distances in feet, rounded to the nearest ten', () => {
    // A rider cannot place a single foot at speed; 10 ft is the useful grain.
    expect(formatDistance(80, 'imperial')).toBe('260 ft');
    expect(formatDistance(30.5, 'imperial')).toBe('100 ft');
    expect(formatDistance(0, 'imperial')).toBe('0 ft');
  });

  it('switches to miles at a tenth of a mile', () => {
    expect(formatDistance(160, 'imperial')).toBe('520 ft');
    expect(formatDistance(161, 'imperial')).toBe('0.1 mi');
  });

  it('renders long distances in miles with one decimal', () => {
    expect(formatDistance(1609.344, 'imperial')).toBe('1.0 mi');
    expect(formatDistance(13_500, 'imperial')).toBe('8.4 mi');
    expect(formatDistance(42_195, 'imperial')).toBe('26.2 mi'); // a marathon
  });

  it('never reports the same ride as a bigger number than metric does', () => {
    for (const meters of [500, 1000, 5000, 13_500, 42_195]) {
      const mi = Number.parseFloat(formatDistance(meters, 'imperial'));
      const km = Number.parseFloat(formatDistance(meters, 'metric'));
      expect(mi).toBeLessThan(km);
    }
  });
});

describe('formatElevation', () => {
  it('renders climbs in metres on metric and feet on imperial', () => {
    expect(formatElevation(195, 'metric')).toBe('195 m');
    expect(formatElevation(195, 'imperial')).toBe('640 ft');
  });

  it('stays in feet however big the climb — elevation never becomes miles', () => {
    expect(formatElevation(8849, 'imperial')).toBe('29032 ft'); // Everest
    expect(formatElevation(8849, 'metric')).toBe('8849 m');
  });

  it('rounds to whole units and handles zero and descent', () => {
    expect(formatElevation(0, 'imperial')).toBe('0 ft');
    expect(formatElevation(-30.48, 'imperial')).toBe('-100 ft');
    expect(formatElevation(12.4, 'metric')).toBe('12 m');
  });

  it('splits into value and unit for surfaces that size them apart', () => {
    expect(formatElevationParts(195, 'imperial')).toEqual({ value: '640', unit: 'ft' });
    expect(formatElevationParts(195, 'metric')).toEqual({ value: '195', unit: 'm' });
  });
});

describe('formatSpeed / formatSpeedKmh — imperial', () => {
  it('renders mph from metres per second', () => {
    expect(formatSpeed(5, 'imperial')).toBe('11 mph'); // 18 km/h
    expect(formatSpeed(5, 'metric')).toBe('18 km/h');
  });

  it('keeps the sub-walking-pace null guard on both systems', () => {
    expect(formatSpeed(0.4, 'imperial')).toBeNull();
    expect(formatSpeed(null, 'imperial')).toBeNull();
  });

  it('converts a km/h reading — the shape the weather API and HUD hold', () => {
    expect(formatSpeedKmh(20, 'imperial')).toBe('12 mph');
    expect(formatSpeedKmh(20, 'metric')).toBe('20 km/h');
    expect(formatSpeedKmhParts(20, 'imperial')).toEqual({ value: '12', unit: 'mph' });
  });
});

describe('formatDistanceParts — imperial', () => {
  it('splits feet and miles the same way the joined form does', () => {
    expect(formatDistanceParts(80, 'imperial')).toEqual({ value: '260', unit: 'ft' });
    expect(formatDistanceParts(13_500, 'imperial')).toEqual({ value: '8.4', unit: 'mi' });
  });

  it('stays consistent with formatDistance on both systems', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (const meters of [0, 35, 102, 161, 999, 1000, 13_700, 42_195]) {
        const { value, unit } = formatDistanceParts(meters, units);
        expect(`${value} ${unit}`).toBe(formatDistance(meters, units));
      }
    }
  });

  it('clamps negatives to zero on imperial too', () => {
    expect(formatDistanceParts(-5, 'imperial')).toEqual({ value: '0', unit: 'ft' });
  });
});
