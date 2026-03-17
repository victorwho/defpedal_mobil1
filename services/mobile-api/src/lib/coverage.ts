import type {
  Coordinate,
  CoverageRegion,
  CoverageResponse,
} from '@defensivepedal/core';

import { config } from '../config';

const EUROPE_BOUNDS = {
  north: 72,
  south: 34,
  east: 32,
  west: -25,
};

const isInEuropeBounds = (coordinate: Coordinate): boolean =>
  coordinate.lat <= EUROPE_BOUNDS.north &&
  coordinate.lat >= EUROPE_BOUNDS.south &&
  coordinate.lon <= EUROPE_BOUNDS.east &&
  coordinate.lon >= EUROPE_BOUNDS.west;

export const resolveCoverage = (
  coordinate: Coordinate,
  countryHint?: string,
): CoverageRegion => {
  const countryCode = (countryHint ?? 'UNSPECIFIED').toUpperCase();
  const safeRouting = config.supportedSafeCountries.includes(countryCode);

  if (safeRouting) {
    return {
      countryCode,
      status: 'supported',
      safeRouting: true,
      fastRouting: true,
    };
  }

  if (isInEuropeBounds(coordinate)) {
    return {
      countryCode,
      status: 'partial',
      safeRouting: false,
      fastRouting: true,
      message:
        'Fast routing is available here, but safe-routing coverage has not been enabled yet.',
    };
  }

  return {
    countryCode,
    status: 'unsupported',
    safeRouting: false,
    fastRouting: false,
    message: 'This region is currently outside the supported service area.',
  };
};

export const buildCoverageResponse = (
  coordinate: Coordinate,
  countryHint?: string,
): CoverageResponse => {
  const matched = resolveCoverage(coordinate, countryHint);

  return {
    regions: [matched],
    matched,
    generatedAt: new Date().toISOString(),
  };
};
