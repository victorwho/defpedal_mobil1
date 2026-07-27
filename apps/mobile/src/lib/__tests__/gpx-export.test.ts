/**
 * gpx-export — Unit Tests
 *
 * Pure string builders — no native mocks needed. Verifies the GPX 1.1
 * structure, the [lon, lat] → lat/lon attribute swap, elevation pairing
 * rules, XML escaping, schema element order, and the legacy trip builder.
 */
import { describe, expect, it } from 'vitest';

import type { TripHistoryItem } from '@defensivepedal/core';
import { encodePolyline } from '@defensivepedal/core';

import { buildGpxString, buildRouteGpx } from '../gpx-export';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const coordinates: ReadonlyArray<readonly [number, number]> = [
  [26.1, 44.43],
  [26.105, 44.435],
  [26.11, 44.44],
];

const baseInput = {
  name: 'Morning commute',
  coordinates,
};

// ---------------------------------------------------------------------------
// buildRouteGpx
// ---------------------------------------------------------------------------

describe('buildRouteGpx — structure', () => {
  it('renders a GPX 1.1 document with creator and metadata name', () => {
    const gpx = buildRouteGpx(baseInput);

    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1" creator="Defensive Pedal"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain('<name>Morning commute</name>');
  });

  it('swaps [lon, lat] input pairs into lat/lon trkpt attributes', () => {
    const gpx = buildRouteGpx(baseInput);

    expect(gpx).toContain('<trkpt lat="44.43" lon="26.1">');
    expect(gpx).toContain('<trkpt lat="44.44" lon="26.11">');
    // Never the reverse pairing.
    expect(gpx).not.toContain('lat="26.1"');
  });

  it('includes metadata <time> only when provided', () => {
    const withTime = buildRouteGpx({
      ...baseInput,
      time: '2026-07-27T08:30:00.000Z',
    });
    const withoutTime = buildRouteGpx(baseInput);

    expect(withTime).toContain('<time>2026-07-27T08:30:00.000Z</time>');
    expect(withoutTime).not.toContain('<time>');
  });

  it('escapes XML special characters in names', () => {
    const gpx = buildRouteGpx({
      ...baseInput,
      name: `Route <A> & "B" 'C'`,
      waypoints: [{ lat: 44.43, lon: 26.1, name: 'Start & <end>' }],
    });

    expect(gpx).toContain(
      '<name>Route &lt;A&gt; &amp; &quot;B&quot; &apos;C&apos;</name>',
    );
    expect(gpx).toContain('<name>Start &amp; &lt;end&gt;</name>');
    expect(gpx).not.toContain('<A>');
  });
});

describe('buildRouteGpx — elevation pairing', () => {
  it('emits one <ele> per trkpt when elevations are 1:1 with coordinates', () => {
    const gpx = buildRouteGpx({
      ...baseInput,
      elevations: [80, 85.25, 90],
    });

    expect(gpx).toContain('<trkpt lat="44.43" lon="26.1"><ele>80</ele></trkpt>');
    // Rounded to one decimal.
    expect(gpx).toContain('<ele>85.3</ele>');
    expect(gpx).toContain('<ele>90</ele>');
  });

  it('omits all <ele> when the elevation array length mismatches', () => {
    const gpx = buildRouteGpx({
      ...baseInput,
      elevations: [80, 85],
    });

    expect(gpx).not.toContain('<ele>');
  });

  it('skips non-finite elevation values without dropping the point', () => {
    const gpx = buildRouteGpx({
      ...baseInput,
      elevations: [80, Number.NaN, 90],
    });

    expect(gpx).toContain('<ele>80</ele>');
    expect(gpx).toContain('<trkpt lat="44.435" lon="26.105"></trkpt>');
    expect(gpx).not.toContain('NaN');
  });
});

describe('buildRouteGpx — waypoints', () => {
  it('renders waypoints as <wpt> elements before the track (GPX 1.1 order)', () => {
    const gpx = buildRouteGpx({
      ...baseInput,
      waypoints: [
        { lat: 44.43, lon: 26.1, name: 'Start' },
        { lat: 44.44, lon: 26.11, name: 'Destination' },
      ],
    });

    expect(gpx).toContain('<wpt lat="44.43" lon="26.1">');
    expect(gpx).toContain('<wpt lat="44.44" lon="26.11">');
    expect(gpx.indexOf('<wpt')).toBeLessThan(gpx.indexOf('<trk>'));
    expect(gpx.indexOf('<wpt')).toBeGreaterThan(gpx.indexOf('</metadata>'));
  });

  it('renders no <wpt> block when waypoints are absent', () => {
    expect(buildRouteGpx(baseInput)).not.toContain('<wpt');
  });
});

// ---------------------------------------------------------------------------
// buildGpxString (completed-trip export)
// ---------------------------------------------------------------------------

describe('buildGpxString — trip export', () => {
  const trip: TripHistoryItem = {
    id: 'row-1',
    tripId: 'abcdef1234567890',
    routingMode: 'safe',
    plannedRoutePolyline6: encodePolyline([
      [26.1, 44.43],
      [26.11, 44.44],
    ]),
    gpsBreadcrumbs: [
      { lat: 44.43, lon: 26.1 },
      { lat: 44.431, lon: 26.101 },
    ],
    endReason: 'completed',
    startedAt: '2026-07-27T08:30:00.000Z',
    endedAt: '2026-07-27T09:00:00.000Z',
  };

  it('renders GPS trail and planned-route tracks', () => {
    const gpx = buildGpxString(trip);

    expect(gpx).toContain('<name>Trip abcdef12 - safe - GPS Trail</name>');
    expect(gpx).toContain('<name>Trip abcdef12 - safe - Planned Route</name>');
    expect(gpx).toContain('<trkpt lat="44.431" lon="26.101">');
    expect(gpx).toContain('<trkpt lat="44.44" lon="26.11">');
  });

  it('omits the planned track when the trip has no planned polyline', () => {
    const gpx = buildGpxString({ ...trip, plannedRoutePolyline6: undefined });

    expect(gpx).toContain('GPS Trail');
    expect(gpx).not.toContain('Planned Route');
  });
});
