import type { NearbyHazard } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import {
  NEARBY_HAZARDS_ROW_CAP,
  countHazardsFromBatches,
  countHazardsOnRoute,
  hazardQueryCentres,
} from './routeHazards';

// Straight east-west line along latitude 44.43; 0.01° of longitude ≈ 795 m here.
const line = (km: number): [number, number][] => {
  const steps = Math.ceil(km / 0.5);
  return Array.from({ length: steps + 1 }, (_, i) => [26 + (i * 0.5 * 0.01) / 0.795, 44.43] as [number, number]);
};

const hazard = (id: string, lon: number, lat: number): NearbyHazard =>
  ({ id, lat, lon }) as unknown as NearbyHazard;

describe('hazardQueryCentres', () => {
  it('uses a single centre for a short route', () => {
    expect(hazardQueryCentres(line(5))).toHaveLength(1);
  });

  it('spreads centres along a longer route', () => {
    const centres = hazardQueryCentres(line(20))!;
    expect(centres).toHaveLength(3);
    expect(centres[0].lon).toBeLessThan(centres[1].lon);
    expect(centres[1].lon).toBeLessThan(centres[2].lon);
  });

  it('refuses a route too long to cover, so no count is claimed', () => {
    expect(hazardQueryCentres(line(40))).toBeNull();
  });
});

describe('countHazardsOnRoute', () => {
  const route = line(5);

  it('counts reports on the line and ignores those a street away', () => {
    const onLine = hazard('a', 26.02, 44.43);
    const nearby = hazard('b', 26.02, 44.4302); // ~22 m north
    const streetAway = hazard('c', 26.02, 44.432); // ~220 m north
    expect(countHazardsOnRoute([onLine, nearby, streetAway], route)).toBe(2);
  });

  it('counts a report returned by two overlapping queries once', () => {
    const h = hazard('a', 26.02, 44.43);
    expect(countHazardsOnRoute([h, h], route)).toBe(1);
  });
});

describe('countHazardsFromBatches', () => {
  const route = line(5);

  it('counts normally when every read came back complete', () => {
    expect(countHazardsFromBatches([[hazard('a', 26.02, 44.43)], []], route)).toBe(1);
  });

  it('claims nothing when a read hit the row cap (dense city, older reports cut off)', () => {
    const full = Array.from({ length: NEARBY_HAZARDS_ROW_CAP }, (_, i) => hazard(`h${i}`, 27, 45));
    expect(countHazardsFromBatches([full], route)).toBeNull();
  });
});
