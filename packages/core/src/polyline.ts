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
