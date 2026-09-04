/**
 * gpx-parse — read a GPX file into a course we can route-follow.
 *
 * The mirror of `gpx-export.ts`, and deliberately its opposite in temperament.
 * Our exporter emits one strict, well-formed shape; an importer meets whatever
 * Komoot, Strava, RideWithGPS, Garmin, Wahoo or a decade-old club website
 * happened to write. So this is permissive by design:
 *
 *   - GPX 1.0 *and* 1.1 (the namespace differs, so we never match on it)
 *   - `<trk>` tracks and `<rte>` routes (we export `<trk>`; plenty of tools
 *     only emit `<rte>`, and refusing those would reject real files)
 *   - namespace-prefixed tags (`<gpx:trkpt>`), single- or double-quoted
 *     attributes, either attribute order, self-closing point elements
 *   - multiple `<trkseg>` per track (segments are pauses — concatenate)
 *   - multiple `<trk>` per file (take the longest, and say so)
 *
 * Pure string in, discriminated result out. No DOM (React Native has none),
 * no XML dependency, no native modules — so it unit-tests in Vitest with
 * nothing mocked, exactly like `gpx-export.ts`.
 */
import { courseDistanceMeters } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCourse {
  /** Course name from the file, or `null` when it carried none. */
  readonly name: string | null;
  /** Geometry as [lon, lat] pairs — GeoJSON order, matching `decodePolyline`. */
  readonly coordinates: readonly [number, number][];
  /**
   * Per-coordinate elevations in meters, or `undefined`.
   *
   * Present only when the file supplied a usable elevation for EVERY point.
   * A partially-elevated track would otherwise pair elevations with the wrong
   * coordinates — the same 1:1 invariant `buildRouteGpx` enforces on the way
   * out.
   */
  readonly elevations: readonly number[] | undefined;
  /** Whether the geometry came from `<trk>` or `<rte>`. */
  readonly sourceElement: 'track' | 'route';
  /** How many tracks/routes the file held. >1 means we picked the longest. */
  readonly candidateCount: number;
  /** Points rejected as corrupt (non-finite or out of range). */
  readonly droppedPoints: number;
}

export type GpxParseFailure =
  /** Doesn't look like GPX at all. */
  | 'not_gpx'
  /** Valid GPX, but no `<trk>` or `<rte>` geometry — e.g. waypoints only. */
  | 'no_track'
  /** Geometry found, but fewer than two usable points. */
  | 'too_few_points';

export type GpxParseResult =
  | { readonly ok: true; readonly course: ParsedCourse }
  | { readonly ok: false; readonly reason: GpxParseFailure };

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

/** Matches an opening tag name with an optional namespace prefix. */
const tagged = (name: string): string => `<(?:[\\w.-]+:)?${name}\\b`;

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const decodeXmlText = (raw: string): string =>
  raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    // Named entities last: decoding &amp;lt; must yield "&lt;", not "<".
    .replace(/&(amp|lt|gt|quot|apos);/g, (match, entity: string) =>
      XML_ENTITIES[entity] ?? match,
    )
    .trim();

/** All `<tag …>…</tag>` bodies at any depth, in document order. */
const blocksOf = (xml: string, name: string): string[] => {
  const pattern = new RegExp(
    `${tagged(name)}[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,
    'gi',
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    blocks.push(match[1] ?? '');
  }

  return blocks;
};

/** Text of the first direct `<name>` element inside a block. */
const nameIn = (xml: string): string | null => {
  const match = new RegExp(
    `${tagged('name')}[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?name>`,
    'i',
  ).exec(xml);

  if (match === null) return null;
  const decoded = decodeXmlText(match[1] ?? '');
  return decoded.length > 0 ? decoded : null;
};

const attribute = (attributes: string, name: string): number | null => {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(
    attributes,
  );
  if (match === null) return null;
  const value = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(value) ? value : null;
};

interface ScannedPoints {
  readonly coordinates: [number, number][];
  readonly elevations: number[];
  readonly elevationCount: number;
  readonly droppedPoints: number;
}

/**
 * Pull every point out of a track/route block.
 *
 * Scanning the whole block in one pass rather than descending into `<trkseg>`
 * is what concatenates multi-segment tracks for free — a segment break is a
 * recording pause, not a route discontinuity.
 */
const scanPoints = (block: string, pointTag: string): ScannedPoints => {
  const pattern = new RegExp(
    `${tagged(pointTag)}([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${pointTag}>)`,
    'gi',
  );

  const coordinates: [number, number][] = [];
  const elevations: number[] = [];
  let elevationCount = 0;
  let droppedPoints = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(block)) !== null) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';

    const lat = attribute(attributes, 'lat');
    const lon = attribute(attributes, 'lon');

    if (
      lat === null ||
      lon === null ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      droppedPoints += 1;
      continue;
    }

    // Drop exact consecutive repeats — a stationary pause writes the same
    // fix many times, which adds nothing to the line.
    const previous = coordinates[coordinates.length - 1];
    if (previous !== undefined && previous[0] === lon && previous[1] === lat) {
      continue;
    }

    coordinates.push([lon, lat]);

    const elevationMatch = new RegExp(
      `${tagged('ele')}[^>]*>([^<]*)<`,
      'i',
    ).exec(body);
    const elevation =
      elevationMatch === null
        ? Number.NaN
        : Number.parseFloat(elevationMatch[1] ?? '');

    if (Number.isFinite(elevation)) {
      elevationCount += 1;
      elevations.push(elevation);
    } else {
      // Placeholder keeps the array index-aligned; the whole array is
      // discarded below unless every point contributed a real value.
      elevations.push(0);
    }
  }

  return { coordinates, elevations, elevationCount, droppedPoints };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse GPX text into a course.
 *
 * Never throws — every failure is a `reason` the UI can turn into copy.
 * When a file holds several tracks the longest one wins (by real distance,
 * not point count: a sparse 40 km route beats a dense 2 km warm-up loop).
 */
export const parseGpx = (xml: string): GpxParseResult => {
  if (typeof xml !== 'string' || !new RegExp(`${tagged('gpx')}`, 'i').test(xml)) {
    return { ok: false, reason: 'not_gpx' };
  }

  const trackBlocks = blocksOf(xml, 'trk');
  const routeBlocks = blocksOf(xml, 'rte');

  const sourceElement: 'track' | 'route' =
    trackBlocks.length > 0 ? 'track' : 'route';
  const blocks = trackBlocks.length > 0 ? trackBlocks : routeBlocks;
  const pointTag = sourceElement === 'track' ? 'trkpt' : 'rtept';

  if (blocks.length === 0) {
    return { ok: false, reason: 'no_track' };
  }

  const scanned = blocks.map((block) => scanPoints(block, pointTag));
  const usable = scanned.filter((entry) => entry.coordinates.length >= 2);

  if (usable.length === 0) {
    // Distinguish "no geometry at all" (waypoint-only file) from "geometry
    // present but unusable" — they need different copy.
    const anyPoints = scanned.some((entry) => entry.coordinates.length > 0);
    return { ok: false, reason: anyPoints ? 'too_few_points' : 'no_track' };
  }

  let best = usable[0]!;
  let bestDistance = courseDistanceMeters(best.coordinates);

  for (const entry of usable.slice(1)) {
    const distance = courseDistanceMeters(entry.coordinates);
    if (distance > bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }

  const bestIndex = scanned.indexOf(best);
  const metadata = blocksOf(xml, 'metadata')[0];
  const name =
    (metadata === undefined ? null : nameIn(metadata)) ??
    nameIn(blocks[bestIndex] ?? '') ??
    null;

  return {
    ok: true,
    course: {
      name,
      coordinates: best.coordinates,
      elevations:
        best.elevationCount === best.coordinates.length
          ? best.elevations
          : undefined,
      sourceElement,
      candidateCount: usable.length,
      droppedPoints: best.droppedPoints,
    },
  };
};
