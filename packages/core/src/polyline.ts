import { haversineDistance } from './distance';

const DEFAULT_PRECISION = 1e6;

export const encodePolyline = (
  coordinates: [number, number][],
  precision = DEFAULT_PRECISION,
): string => {
  let previousLat = 0;
  let previousLon = 0;
  let encoded = '';

  const encodeValue = (value: number) => {
    let current = value < 0 ? ~(value << 1) : value << 1;

    while (current >= 0x20) {
      encoded += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
      current >>= 5;
    }

    encoded += String.fromCharCode(current + 63);
  };

  for (const [lon, lat] of coordinates) {
    const scaledLat = Math.round(lat * precision);
    const scaledLon = Math.round(lon * precision);

    encodeValue(scaledLat - previousLat);
    encodeValue(scaledLon - previousLon);

    previousLat = scaledLat;
    previousLon = scaledLon;
  }

  return encoded;
};

export const decodePolyline = (
  encoded: string,
  precision = DEFAULT_PRECISION,
): [number, number][] => {
  let index = 0;
  let lat = 0;
  let lon = 0;
  const coordinates: [number, number][] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    lat += latitudeDelta;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    lon += longitudeDelta;

    coordinates.push([lon / precision, lat / precision]);
  }

  return coordinates;
};

/**
 * Trims the first and last `trimMeters` from an encoded polyline.
 * Used for privacy: removes start/end of ride so home/work locations aren't revealed.
 * Returns the original polyline if it's too short to trim (< 2.5x trimMeters).
 */
export const trimPolylineEndpoints = (
  encoded: string,
  trimMeters: number,
): string => {
  const points = decodePolyline(encoded);

  if (points.length < 2) return encoded;

  // Calculate total length
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLength += haversineDistance(
      [points[i][1], points[i][0]],
      [points[i + 1][1], points[i + 1][0]],
    );
  }

  // If route is too short to trim, return as-is
  if (totalLength < trimMeters * 2.5) return encoded;

  // Find start trim index
  let startIndex = 0;
  let accumulated = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = haversineDistance(
      [points[i][1], points[i][0]],
      [points[i + 1][1], points[i + 1][0]],
    );
    accumulated += segLen;
    if (accumulated >= trimMeters) {
      startIndex = i + 1;
      break;
    }
  }

  // Find end trim index
  let endIndex = points.length - 1;
  accumulated = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const segLen = haversineDistance(
      [points[i][1], points[i][0]],
      [points[i - 1][1], points[i - 1][0]],
    );
    accumulated += segLen;
    if (accumulated >= trimMeters) {
      endIndex = i - 1;
      break;
    }
  }

  // Ensure we have at least 2 points
  if (startIndex >= endIndex) return encoded;

  return encodePolyline(points.slice(startIndex, endIndex + 1));
};
