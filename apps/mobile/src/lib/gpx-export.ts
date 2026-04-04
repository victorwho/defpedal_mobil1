import type { TripHistoryItem } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
