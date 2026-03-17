import type { OfflineRegion, RouteOption } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';
import Mapbox from '@rnmapbox/maps';

import { mobileEnv } from './env';

const DEFAULT_PADDING_DEGREES = 0.01;

type OfflinePackMetadata = {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  routeId?: string | null;
  styleURL: string;
};

if (mobileEnv.mapboxPublicToken) {
  Mapbox.setAccessToken(mobileEnv.mapboxPublicToken);
}

const toStatus = (
  metadata: OfflinePackMetadata,
  progress?: {
    percentage?: number;
    completedResourceCount?: number;
    requiredResourceCount?: number;
  },
  overrides: Partial<OfflineRegion> = {},
): OfflineRegion => ({
  id: metadata.id,
  name: metadata.name,
  bbox: metadata.bbox,
  minZoom: metadata.minZoom,
  maxZoom: metadata.maxZoom,
  status:
    progress && (progress.percentage ?? 0) >= 100
      ? 'ready'
      : overrides.status ?? 'downloading',
  progressPercentage: progress?.percentage,
  completedResourceCount: progress?.completedResourceCount,
  requiredResourceCount: progress?.requiredResourceCount,
  styleURL: metadata.styleURL,
  routeId: metadata.routeId ?? null,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const getRouteBbox = (
  route: RouteOption,
  paddingDegrees = DEFAULT_PADDING_DEGREES,
): [number, number, number, number] => {
  const coordinates = decodePolyline(route.geometryPolyline6);

  if (coordinates.length === 0) {
    return [26.0925, 44.4168, 26.1125, 44.4468];
  }

  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);

  return [
    Math.min(...longitudes) - paddingDegrees,
    Math.min(...latitudes) - paddingDegrees,
    Math.max(...longitudes) + paddingDegrees,
    Math.max(...latitudes) + paddingDegrees,
  ];
};

const toPackBounds = (
  bbox: [number, number, number, number],
): [[number, number], [number, number]] => [
  [bbox[2], bbox[3]],
  [bbox[0], bbox[1]],
];

const getPackMetadata = (pack: { metadata?: unknown; name?: string }): OfflinePackMetadata | null => {
  const metadata = pack.metadata as Partial<OfflinePackMetadata> | undefined;

  if (!metadata?.id || !metadata?.name || !metadata?.bbox) {
    return null;
  }

  return {
    id: metadata.id,
    name: metadata.name,
    bbox: metadata.bbox,
    minZoom: metadata.minZoom ?? 11,
    maxZoom: metadata.maxZoom ?? 16,
    routeId: metadata.routeId ?? null,
    styleURL: metadata.styleURL ?? Mapbox.StyleURL.Street,
  };
};

export const buildOfflineRegionFromRoute = (
  route: RouteOption,
  options: {
    name?: string;
    minZoom?: number;
    maxZoom?: number;
    styleURL?: string;
  } = {},
): OfflineRegion => {
  const bbox = getRouteBbox(route);
  const metadata: OfflinePackMetadata = {
    id: `route-pack-${route.id}`,
    name: options.name ?? `Offline region for ${route.id}`,
    bbox,
    minZoom: options.minZoom ?? 11,
    maxZoom: options.maxZoom ?? 16,
    routeId: route.id,
    styleURL: options.styleURL ?? Mapbox.StyleURL.Street,
  };

  return toStatus(metadata, undefined, {
    status: 'queued',
  });
};

export const downloadOfflineRegion = async (
  region: OfflineRegion,
  onProgress: (region: OfflineRegion) => void,
) => {
  const metadata: OfflinePackMetadata = {
    id: region.id,
    name: region.name,
    bbox: region.bbox,
    minZoom: region.minZoom,
    maxZoom: region.maxZoom,
    routeId: region.routeId ?? null,
    styleURL: region.styleURL ?? Mapbox.StyleURL.Street,
  };

  const existingPack = await Mapbox.offlineManager.getPack(metadata.id);

  if (existingPack) {
    await Mapbox.offlineManager.deletePack(metadata.id);
  }

  onProgress(
    toStatus(metadata, undefined, {
      status: 'downloading',
    }),
  );

  await Mapbox.offlineManager.createPack(
    {
      name: metadata.id,
      styleURL: metadata.styleURL,
      minZoom: metadata.minZoom,
      maxZoom: metadata.maxZoom,
      bounds: toPackBounds(metadata.bbox),
      metadata,
    },
    (_pack, status) => {
      onProgress(
        toStatus(metadata, {
          percentage: status.percentage,
          completedResourceCount: status.completedResourceCount,
          requiredResourceCount: status.requiredResourceCount,
        }),
      );
    },
    (_pack, error) => {
      onProgress(
        toStatus(metadata, undefined, {
          status: 'failed',
          error: error.message,
        }),
      );
    },
  );
};

export const listOfflineRegions = async (): Promise<OfflineRegion[]> => {
  const packs = await Mapbox.offlineManager.getPacks();

  return Promise.all(
    packs.map(async (pack) => {
      const metadata = getPackMetadata(pack);

      if (!metadata) {
        return null;
      }

      const status = await pack.status();

      return toStatus(metadata, {
        percentage: status.percentage,
        completedResourceCount: status.completedResourceCount,
        requiredResourceCount: status.requiredResourceCount,
      });
    }),
  ).then((regions) => regions.filter((region): region is OfflineRegion => Boolean(region)));
};

export const deleteOfflineRegion = async (regionId: string) => {
  await Mapbox.offlineManager.deletePack(regionId);
};
