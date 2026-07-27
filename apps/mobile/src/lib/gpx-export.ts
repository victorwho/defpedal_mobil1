/**
 * gpx-export — pure GPX 1.1 string builders.
 *
 * Two entry points:
 *   - `buildRouteGpx` renders a PLANNED route (decoded polyline + optional
 *     per-point elevations + origin/destination waypoints) as a single
 *     `<trk>`. A track — not `<rte>` — is the de-facto course-import
 *     format: Garmin Connect, Strava and Komoot all convert an imported
 *     track into a course, while `<rte>` support is patchier.
 *   - `buildGpxString` renders a COMPLETED trip (GPS breadcrumbs + the
 *     planned polyline) — the original TripCard export, kept working.
 *
 * Pure string builders with zero native dependencies so both stay
 * unit-testable without mocking Expo modules.
 */
import type { TripHistoryItem } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// ---------------------------------------------------------------------------
// Planned-route GPX (Garmin course import)
// ---------------------------------------------------------------------------

export interface GpxWaypoint {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
}

export interface RouteGpxInput {
  /** Course name shown by Garmin/Strava/Komoot after import. */
  readonly name: string;
  /**
   * Route geometry as [lon, lat] pairs — GeoJSON order, exactly what
   * `decodePolyline` returns. Swapped to lat/lon attributes on render.
   */
  readonly coordinates: ReadonlyArray<readonly [number, number]>;
  /**
   * Optional per-coordinate elevations in meters. Emitted as `<ele>` only
   * when exactly 1:1 with `coordinates` — a mismatched array means the
   * profile was sampled over different geometry, and pairing it up would
   * assign elevations to the wrong points.
   */
  readonly elevations?: readonly number[];
  /** Origin/via/destination markers, rendered as `<wpt>` elements. */
  readonly waypoints?: readonly GpxWaypoint[];
  /** ISO-8601 timestamp for `<metadata><time>`. */
  readonly time?: string;
}

const renderTrackPoint = (lat: number, lon: number, elevation?: number): string => {
  const ele =
    elevation !== undefined && Number.isFinite(elevation)
      ? `<ele>${Math.round(elevation * 10) / 10}</ele>`
      : '';
  return `      <trkpt lat="${lat}" lon="${lon}">${ele}</trkpt>`;
};

export const buildRouteGpx = (input: RouteGpxInput): string => {
  const name = escapeXml(input.name);
  const time = input.time ? `\n    <time>${escapeXml(input.time)}</time>` : '';

  const withElevations =
    input.elevations !== undefined &&
    input.elevations.length === input.coordinates.length;

  const trackPoints = input.coordinates
    .map(([lon, lat], index) =>
      renderTrackPoint(lat, lon, withElevations ? input.elevations![index] : undefined),
    )
    .join('\n');

  // GPX 1.1 XSD requires element order metadata → wpt* → trk*.
  const waypoints = (input.waypoints ?? [])
    .map(
      (wpt) =>
        `  <wpt lat="${wpt.lat}" lon="${wpt.lon}">\n    <name>${escapeXml(wpt.name)}</name>\n  </wpt>`,
    )
    .join('\n');
  const waypointBlock = waypoints ? `\n${waypoints}` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Defensive Pedal"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>${time}
  </metadata>${waypointBlock}
  <trk>
    <name>${name}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
};

// ---------------------------------------------------------------------------
// Completed-trip GPX (GPS trail + planned track)
// ---------------------------------------------------------------------------

export const buildGpxString = (trip: TripHistoryItem): string => {
  const name = `Trip ${trip.tripId.slice(0, 8)} - ${trip.routingMode}`;
  const time = trip.startedAt;

  const gpsTrackPoints = trip.gpsBreadcrumbs
    .map(
      (pt) =>
        `      <trkpt lat="${pt.lat}" lon="${pt.lon}"><time>${time}</time></trkpt>`,
    )
    .join('\n');

  let plannedTrack = '';
  if (trip.plannedRoutePolyline6) {
    // decodePolyline returns [lon, lat] pairs — swap for GPX which expects lat/lon attributes
    const decoded = decodePolyline(trip.plannedRoutePolyline6);
    const plannedPoints = decoded
      .map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`)
      .join('\n');
    plannedTrack = `
  <trk>
    <name>${escapeXml(name)} - Planned Route</name>
    <trkseg>
${plannedPoints}
    </trkseg>
  </trk>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Defensive Pedal"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${time}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)} - GPS Trail</name>
    <trkseg>
${gpsTrackPoints}
    </trkseg>
  </trk>${plannedTrack}
</gpx>`;
};
