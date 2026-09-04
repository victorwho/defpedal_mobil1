import { describe, expect, it } from 'vitest';

import { buildRouteGpx } from './gpx-export';
import { parseGpx } from './gpx-parse';

const wrap = (inner: string, attributes = 'version="1.1"'): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx ${attributes} xmlns="http://www.topografix.com/GPX/1/1">${inner}</gpx>`;

const track = (points: string, name?: string): string =>
  `<trk>${name === undefined ? '' : `<name>${name}</name>`}<trkseg>${points}</trkseg></trk>`;

const pt = (lat: number, lon: number, ele?: number): string =>
  `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? '' : `<ele>${ele}</ele>`}</trkpt>`;

/** Points spaced ~11 m apart, enough to be a real line. */
const ladder = (count: number, ele = false): string =>
  Array.from({ length: count }, (_, i) =>
    pt(44.4268 + i * 0.0001, 26.1025, ele ? 80 + i : undefined),
  ).join('');

describe('parseGpx — rejection', () => {
  it('rejects non-GPX text', () => {
    expect(parseGpx('hello world')).toEqual({ ok: false, reason: 'not_gpx' });
    expect(parseGpx('<html><body/></html>')).toEqual({
      ok: false,
      reason: 'not_gpx',
    });
  });

  it('rejects a non-string input without throwing', () => {
    expect(parseGpx(undefined as unknown as string)).toEqual({
      ok: false,
      reason: 'not_gpx',
    });
  });

  it('reports no_track for a waypoint-only file', () => {
    const xml = wrap('<wpt lat="44.4" lon="26.1"><name>Home</name></wpt>');
    expect(parseGpx(xml)).toEqual({ ok: false, reason: 'no_track' });
  });

  it('reports too_few_points for a single-point track', () => {
    expect(parseGpx(wrap(track(pt(44.4, 26.1))))).toEqual({
      ok: false,
      reason: 'too_few_points',
    });
  });

  it('reports no_track for an empty trkseg', () => {
    expect(parseGpx(wrap(track('')))).toEqual({ ok: false, reason: 'no_track' });
  });
});

describe('parseGpx — geometry', () => {
  it('returns [lon, lat] pairs, not [lat, lon]', () => {
    const result = parseGpx(wrap(track(pt(44.4268, 26.1025) + pt(44.4368, 26.1125))));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Bucharest: lon ~26, lat ~44. A swap here puts the course in Somalia.
    expect(result.course.coordinates[0]).toEqual([26.1025, 44.4268]);
    expect(result.course.coordinates[1]).toEqual([26.1125, 44.4368]);
  });

  it('handles GPX 1.0 (different namespace)', () => {
    const xml = `<?xml version="1.0"?><gpx version="1.0" xmlns="http://www.topografix.com/GPX/1/0">${track(ladder(5))}</gpx>`;
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.coordinates).toHaveLength(5);
  });

  it('handles namespace-prefixed tags', () => {
    const xml =
      '<gpx:gpx version="1.1"><gpx:trk><gpx:trkseg>' +
      '<gpx:trkpt lat="44.4268" lon="26.1025"><gpx:ele>80</gpx:ele></gpx:trkpt>' +
      '<gpx:trkpt lat="44.4368" lon="26.1125"><gpx:ele>90</gpx:ele></gpx:trkpt>' +
      '</gpx:trkseg></gpx:trk></gpx:gpx>';
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.coordinates).toHaveLength(2);
      expect(result.course.elevations).toEqual([80, 90]);
    }
  });

  it('accepts either attribute order and single quotes', () => {
    const xml = wrap(
      "<trk><trkseg><trkpt lon='26.1025' lat='44.4268'/><trkpt lat=\"44.4368\" lon=\"26.1125\"/></trkseg></trk>",
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.coordinates).toEqual([
        [26.1025, 44.4268],
        [26.1125, 44.4368],
      ]);
    }
  });

  it('accepts self-closing point elements', () => {
    const xml = wrap('<trk><trkseg><trkpt lat="44.4" lon="26.1"/><trkpt lat="44.5" lon="26.2"/></trkseg></trk>');
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.coordinates).toHaveLength(2);
  });

  it('concatenates multiple trkseg — a segment break is a pause, not a split', () => {
    const xml = wrap(
      `<trk><trkseg>${pt(44.40, 26.10)}${pt(44.41, 26.10)}</trkseg><trkseg>${pt(44.42, 26.10)}${pt(44.43, 26.10)}</trkseg></trk>`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.coordinates).toHaveLength(4);
  });

  it('falls back to <rte>/<rtept> when there is no track', () => {
    const xml = wrap(
      '<rte><name>Club ride</name><rtept lat="44.4268" lon="26.1025"/><rtept lat="44.4368" lon="26.1125"/></rte>',
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.sourceElement).toBe('route');
      expect(result.course.coordinates).toHaveLength(2);
      expect(result.course.name).toBe('Club ride');
    }
  });

  it('prefers <trk> over <rte> when a file carries both', () => {
    const xml = wrap(
      `${track(ladder(6))}<rte><rtept lat="44.4" lon="26.1"/><rtept lat="44.5" lon="26.2"/></rte>`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.sourceElement).toBe('track');
      expect(result.course.coordinates).toHaveLength(6);
    }
  });

  it('drops exact consecutive duplicate fixes', () => {
    const xml = wrap(track(pt(44.4, 26.1) + pt(44.4, 26.1) + pt(44.5, 26.2)));
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.coordinates).toHaveLength(2);
  });

  it('skips corrupt points and counts them', () => {
    const xml = wrap(
      `<trk><trkseg>${pt(44.4, 26.1)}<trkpt lat="999" lon="26.1"/><trkpt lon="26.1"/>${pt(44.5, 26.2)}</trkseg></trk>`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.coordinates).toHaveLength(2);
      expect(result.course.droppedPoints).toBe(2);
    }
  });
});

describe('parseGpx — multiple tracks', () => {
  it('picks the longest track by distance, not by point count', () => {
    // A dense little warm-up loop vs a sparse long route. Point count would
    // pick the wrong one.
    const dense = Array.from({ length: 50 }, (_, i) =>
      pt(44.4 + i * 0.00001, 26.1),
    ).join('');
    const sparse = pt(44.4, 26.1) + pt(45.4, 26.1); // ~111 km

    const xml = wrap(`${track(dense, 'Warm-up')}${track(sparse, 'Main route')}`);
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.coordinates).toHaveLength(2);
      expect(result.course.candidateCount).toBe(2);
    }
  });

  it('reports candidateCount 1 for a single-track file', () => {
    const result = parseGpx(wrap(track(ladder(5))));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.candidateCount).toBe(1);
  });
});

describe('parseGpx — elevations', () => {
  it('keeps elevations when every point has one', () => {
    const result = parseGpx(wrap(track(ladder(4, true))));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.elevations).toEqual([80, 81, 82, 83]);
  });

  it('drops the whole array when elevations are partial', () => {
    // Pairing 2 elevations with 3 points would assign them to the wrong
    // coordinates — the same 1:1 invariant buildRouteGpx enforces on export.
    const xml = wrap(track(pt(44.4, 26.1, 80) + pt(44.5, 26.2) + pt(44.6, 26.3, 90)));
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.elevations).toBeUndefined();
  });

  it('drops the array when no point has an elevation', () => {
    const result = parseGpx(wrap(track(ladder(4))));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.elevations).toBeUndefined();
  });

  it('reads negative elevations (below sea level)', () => {
    const xml = wrap(track(pt(51.9, 4.4, -6.7) + pt(51.91, 4.41, -5.2)));
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.elevations).toEqual([-6.7, -5.2]);
  });
});

describe('parseGpx — naming', () => {
  it('prefers the metadata name', () => {
    const xml = wrap(
      `<metadata><name>Sunday loop</name></metadata>${track(ladder(3), 'Track 1')}`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Sunday loop');
  });

  it('falls back to the track name', () => {
    const result = parseGpx(wrap(track(ladder(3), 'Track 1')));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Track 1');
  });

  it('returns null when the file carries no name', () => {
    const result = parseGpx(wrap(track(ladder(3))));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBeNull();
  });

  it('decodes XML entities in the name', () => {
    const xml = wrap(
      `<metadata><name>Ride &amp; coffee &lt;fast&gt;</name></metadata>${track(ladder(3))}`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Ride & coffee <fast>');
  });

  it('decodes numeric character references', () => {
    const xml = wrap(
      `<metadata><name>Cal&#537;a &#x21; ride</name></metadata>${track(ladder(3))}`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Calșa ! ride');
  });

  it('does not mistake a waypoint name for the course name', () => {
    const xml = wrap(
      `<wpt lat="44.4" lon="26.1"><name>Home</name></wpt>${track(ladder(3), 'Real course')}`,
    );
    const result = parseGpx(xml);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Real course');
  });
});

describe('parseGpx — round trip with our own exporter', () => {
  it('reads back a course written by buildRouteGpx', () => {
    const coordinates: [number, number][] = [
      [26.1025, 44.4268],
      [26.1125, 44.4368],
      [26.1225, 44.4468],
    ];
    const elevations = [80, 85, 92];

    const gpx = buildRouteGpx({
      name: 'Defensive Pedal route',
      coordinates,
      elevations,
      waypoints: [{ lat: 44.4268, lon: 26.1025, name: 'Start' }],
      time: '2026-09-04T08:00:00.000Z',
    });

    const result = parseGpx(gpx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.course.coordinates).toEqual(coordinates);
    expect(result.course.elevations).toEqual(elevations);
    expect(result.course.name).toBe('Defensive Pedal route');
    // The <wpt> must not leak into the geometry.
    expect(result.course.coordinates).toHaveLength(3);
  });

  it('survives a name that needed escaping on export', () => {
    const gpx = buildRouteGpx({
      name: 'Tour & "chill" <easy>',
      coordinates: [
        [26.1, 44.4],
        [26.2, 44.5],
      ],
    });

    const result = parseGpx(gpx);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.name).toBe('Tour & "chill" <easy>');
  });
});
