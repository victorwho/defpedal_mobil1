import type { NavigationLocationSample, OfflineRegion } from '@defensivepedal/core';
import { haversineDistance } from '@defensivepedal/core';

const roundToNearestMeter = (value: number) => Math.round(value);

export type BackgroundMovementSummary = {
  sampleCount: number;
  totalDistanceMeters: number;
  straightLineDistanceMeters: number;
  durationSeconds: number;
  movementDetected: boolean;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
};

export const summarizeBackgroundMovement = (
  samples: NavigationLocationSample[],
): BackgroundMovementSummary => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      totalDistanceMeters: 0,
      straightLineDistanceMeters: 0,
      durationSeconds: 0,
      movementDetected: false,
      firstTimestamp: null,
      lastTimestamp: null,
    };
  }

  const totalDistanceMeters = samples.slice(1).reduce((total, sample, index) => {
    const previousSample = samples[index];

    return (
      total +
      haversineDistance(
        [previousSample.coordinate.lat, previousSample.coordinate.lon],
        [sample.coordinate.lat, sample.coordinate.lon],
      )
    );
  }, 0);

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const straightLineDistanceMeters =
    samples.length > 1
      ? haversineDistance(
          [firstSample.coordinate.lat, firstSample.coordinate.lon],
          [lastSample.coordinate.lat, lastSample.coordinate.lon],
        )
      : 0;

  return {
    sampleCount: samples.length,
    totalDistanceMeters: roundToNearestMeter(totalDistanceMeters),
    straightLineDistanceMeters: roundToNearestMeter(straightLineDistanceMeters),
    durationSeconds:
      samples.length > 1
        ? Math.max(0, Math.round((lastSample.timestamp - firstSample.timestamp) / 1000))
        : 0,
    movementDetected: totalDistanceMeters >= 20 || straightLineDistanceMeters >= 15,
    firstTimestamp: firstSample.timestamp,
    lastTimestamp: lastSample.timestamp,
  };
};

export type SelectedRouteOfflineSummary = {
  selectedRouteId: string | null;
  matchingRegionCount: number;
  readyRegionCount: number;
  isSelectedRouteReady: boolean;
  latestReadyAt: string | null;
};

export const summarizeSelectedRouteOfflineReadiness = (
  selectedRouteId: string | null,
  offlineRegions: OfflineRegion[],
): SelectedRouteOfflineSummary => {
  if (!selectedRouteId) {
    return {
      selectedRouteId: null,
      matchingRegionCount: 0,
      readyRegionCount: 0,
      isSelectedRouteReady: false,
      latestReadyAt: null,
    };
  }

  const matchingRegions = offlineRegions.filter((region) => region.routeId === selectedRouteId);
  const readyRegions = matchingRegions.filter((region) => region.status === 'ready');
  const latestReadyAt =
    readyRegions
      .map((region) => region.updatedAt ?? null)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    selectedRouteId,
    matchingRegionCount: matchingRegions.length,
    readyRegionCount: readyRegions.length,
    isSelectedRouteReady: readyRegions.length > 0,
    latestReadyAt,
  };
};
