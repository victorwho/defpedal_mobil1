
import type { RouteResponse } from '../types';

const OSRM_API_BASE = 'https://osrm.defensivepedal.com/route/v1/bicycle';
const MAPBOX_API_BASE = 'https://api.mapbox.com/directions/v5/mapbox/cycling';
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

export const getRoute = async (
  start: [number, number], // [lon, lat]
  end: [number, number],   // [lon, lat]
  mode: 'safe' | 'fast' = 'safe',
  avoidUnpaved: boolean = false
): Promise<RouteResponse> => {
  const coords = `${start.join(',')};${end.join(',')}`;
  
  let url: string;

  if (mode === 'fast') {
      const params = new URLSearchParams({
          alternatives: 'true',
          geometries: 'geojson',
          steps: 'true',
          overview: 'full',
          access_token: MAPBOX_ACCESS_TOKEN
      });
      url = `${MAPBOX_API_BASE}/${coords}?${params.toString()}`;
  } else {
      // Safe mode uses the custom OSRM server. Added annotations=true.
      url = `${OSRM_API_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true&annotations=true`;
      if (avoidUnpaved) {
          url += '&exclude=unpaved';
      }

  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch route');
  }

  const data: RouteResponse = await response.json();
  return data;
};