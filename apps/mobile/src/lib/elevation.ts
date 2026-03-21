/**
 * Lightweight elevation service for React Native.
 * Uses Open-Meteo API (simple GET, no browser APIs required).
 */

const OPEN_METEO_API_URL = 'https://api.open-meteo.com/v1/elevation';
const MAX_POINTS_PER_REQUEST = 50;
const REQUEST_TIMEOUT_MS = 10_000;
const TARGET_SAMPLE_POINTS = 200;

/**
 * Fetches elevation values for a set of coordinates using Open-Meteo.
 * Downsamples long routes for performance, then computes elevation gain
 * from the sampled profile (which is accurate for cumulative metrics).
 *
 * @param coordinates Array of [longitude, latitude] pairs (GeoJSON order).
 * @returns Elevation gain in meters, or null if the fetch fails entirely.
 */
export const getElevationGain = async (
  coordinates: [number, number][],
): Promise<{ elevationGain: number; elevationLoss: number } | null> => {
  if (coordinates.length < 2) return null;

  // Downsample to TARGET_SAMPLE_POINTS for performance
  const sampled =
    coordinates.length <= TARGET_SAMPLE_POINTS
      ? coordinates
      : downsample(coordinates, TARGET_SAMPLE_POINTS);

  try {
    const elevations = await fetchElevationProfile(sampled);
    return computeGainLoss(elevations);
  } catch {
    return null;
  }
};

const downsample = (
  coords: [number, number][],
  targetCount: number,
): [number, number][] => {
  const step = Math.ceil(coords.length / targetCount);
  const result = coords.filter((_, i) => i % step === 0);

  // Always include the last point
  const lastCoord = coords[coords.length - 1];
  if (result[result.length - 1] !== lastCoord) {
    result.push(lastCoord);
  }

  return result;
};

const computeGainLoss = (
  elevations: number[],
): { elevationGain: number; elevationLoss: number } => {
  let elevationGain = 0;
  let elevationLoss = 0;

  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) {
      elevationGain += diff;
    } else if (diff < 0) {
      elevationLoss += Math.abs(diff);
    }
  }

  return { elevationGain, elevationLoss };
};

const fetchElevationProfile = async (
  coordinates: [number, number][],
): Promise<number[]> => {
  const allElevations: number[] = [];

  for (let i = 0; i < coordinates.length; i += MAX_POINTS_PER_REQUEST) {
    const chunk = coordinates.slice(i, i + MAX_POINTS_PER_REQUEST);
    const lats = chunk.map(([, lat]) => lat).join(',');
    const lons = chunk.map(([lon]) => lon).join(',');
    const url = `${OPEN_METEO_API_URL}?latitude=${lats}&longitude=${lons}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.elevation || !Array.isArray(data.elevation)) {
        throw new Error('Invalid Open-Meteo response format');
      }

      allElevations.push(...data.elevation);
    } finally {
      clearTimeout(timeout);
    }
  }

  return allElevations;
};
