import type { Coordinate } from '@defensivepedal/core';
import { PNG } from 'pngjs';

import { config } from '../config';

const OPEN_METEO_API_URL = 'https://api.open-meteo.com/v1/elevation';
const MAX_POINTS_PER_REQUEST = 50;
const TARGET_POINTS_FOR_PROFILE = 400;
const MAPBOX_TERRAIN_ZOOM = 14;

const interpolate = (source: number[], newLength: number): number[] => {
  if (source.length === 0) {
    return new Array(newLength).fill(0);
  }

  if (source.length === 1) {
    return new Array(newLength).fill(source[0]);
  }

  if (source.length === newLength) {
    return source;
  }

  const result = new Array(newLength);
  const ratio = (source.length - 1) / (newLength - 1);

  for (let index = 0; index < newLength; index += 1) {
    const sourceIndex = index * ratio;
    const lowIndex = Math.floor(sourceIndex);
    const highIndex = Math.ceil(sourceIndex);

    if (highIndex >= source.length) {
      result[index] = source[source.length - 1];
      continue;
    }

    if (lowIndex === highIndex) {
      result[index] = source[lowIndex];
      continue;
    }

    const weight = sourceIndex - lowIndex;
    result[index] = source[lowIndex] * (1 - weight) + source[highIndex] * weight;
  }

  return result;
};

const lon2tile = (lon: number, zoom: number) =>
  Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));

const lat2tile = (lat: number, zoom: number) =>
  Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom),
  );

const lon2pixel = (lon: number, zoom: number, tileX: number) =>
  Math.floor((((lon + 180) / 360) * Math.pow(2, zoom) - tileX) * 256);

const lat2pixel = (lat: number, zoom: number, tileY: number) =>
  Math.floor(
    (((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom) -
      tileY) *
      256,
  );

const fetchTerrainRgbElevations = async (
  coordinates: Coordinate[],
): Promise<number[]> => {
  if (!config.mapboxAccessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN is not configured.');
  }

  const tilesToFetch = new Map<string, { x: number; y: number; z: number }>();

  coordinates.forEach((coordinate) => {
    const x = lon2tile(coordinate.lon, MAPBOX_TERRAIN_ZOOM);
    const y = lat2tile(coordinate.lat, MAPBOX_TERRAIN_ZOOM);
    const key = `${MAPBOX_TERRAIN_ZOOM}/${x}/${y}`;
    if (!tilesToFetch.has(key)) {
      tilesToFetch.set(key, {
        x,
        y,
        z: MAPBOX_TERRAIN_ZOOM,
      });
    }
  });

  const tileImages = new Map<string, PNG>();

  await Promise.all(
    Array.from(tilesToFetch.entries()).map(async ([key, tile]) => {
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile.z}/${tile.x}/${tile.y}.pngraw?access_token=${config.mapboxAccessToken}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Mapbox Terrain-RGB request failed with ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      tileImages.set(key, PNG.sync.read(buffer));
    }),
  );

  return coordinates.map((coordinate) => {
    const x = lon2tile(coordinate.lon, MAPBOX_TERRAIN_ZOOM);
    const y = lat2tile(coordinate.lat, MAPBOX_TERRAIN_ZOOM);
    const key = `${MAPBOX_TERRAIN_ZOOM}/${x}/${y}`;
    const image = tileImages.get(key);

    if (!image) {
      return 0;
    }

    const pixelX = Math.max(0, Math.min(255, lon2pixel(coordinate.lon, MAPBOX_TERRAIN_ZOOM, x)));
    const pixelY = Math.max(0, Math.min(255, lat2pixel(coordinate.lat, MAPBOX_TERRAIN_ZOOM, y)));
    const index = (pixelY * image.width + pixelX) * 4;
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];

    return -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
  });
};

const fetchOpenMeteoElevations = async (
  coordinates: Coordinate[],
): Promise<number[]> => {
  const latitudes = coordinates.map((coordinate) => coordinate.lat).join(',');
  const longitudes = coordinates.map((coordinate) => coordinate.lon).join(',');
  const url = `${OPEN_METEO_API_URL}?latitude=${latitudes}&longitude=${longitudes}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    elevation?: number[];
  };

  if (!Array.isArray(data.elevation)) {
    throw new Error('Open-Meteo response did not include elevation data.');
  }

  return data.elevation;
};

const fetchCoordinateChunkElevations = async (
  coordinates: Coordinate[],
): Promise<number[]> => {
  try {
    return await fetchTerrainRgbElevations(coordinates);
  } catch {
    return fetchOpenMeteoElevations(coordinates);
  }
};

export const getElevationProfile = async (
  coordinates: [number, number][],
): Promise<number[]> => {
  const originalLength = coordinates.length;

  if (originalLength === 0) {
    return [];
  }

  let coordinatesToFetch = coordinates;
  const needsInterpolation = originalLength > TARGET_POINTS_FOR_PROFILE;

  if (needsInterpolation) {
    const step = Math.ceil(originalLength / TARGET_POINTS_FOR_PROFILE);
    coordinatesToFetch = coordinates.filter((_, index) => index % step === 0);

    if ((originalLength - 1) % step !== 0) {
      coordinatesToFetch.push(coordinates[originalLength - 1]);
    }
  }

  const elevations: number[] = [];

  for (let index = 0; index < coordinatesToFetch.length; index += MAX_POINTS_PER_REQUEST) {
    const chunk = coordinatesToFetch.slice(index, index + MAX_POINTS_PER_REQUEST);
    const chunkCoordinates = chunk.map(([lon, lat]) => ({ lat, lon }));
    const chunkElevations = await fetchCoordinateChunkElevations(chunkCoordinates);

    elevations.push(...chunkElevations);
  }

  return needsInterpolation ? interpolate(elevations, originalLength) : elevations;
};
