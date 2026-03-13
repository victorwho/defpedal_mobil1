import type { GeolocationCoordinates } from '../types';

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const MAPBOX_API_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<string | null> => {
  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    limit: '1',
    types: 'address,poi,place,locality,neighborhood',
    // We keep country restriction to prioritize local format if relevant, though reverse geocoding is point-based
    country: 'ro', 
    language: 'ro',
  });

  const url = `${MAPBOX_API_BASE}/${lon},${lat}.json?${params.toString()}`;

  try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.features || data.features.length === 0) return null;
      
      return data.features[0].place_name;
  } catch (e) {
      console.error("Reverse geocode failed", e);
      return null;
  }
};