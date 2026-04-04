import { describe, expect, it } from 'vitest';

import {
  mapBikeTypeToVehicle,
  getVUser,
  getVCom,
  getMAqi,
  calculatePersonalMicrolives,
  calculateCommunitySeconds,
  formatMicrolivesAsTime,
  formatCommunitySeconds,
} from './microlives';

describe('mapBikeTypeToVehicle', () => {
  it('maps standard bike types to acoustic', () => {
    expect(mapBikeTypeToVehicle('Road bike')).toBe('acoustic');
    expect(mapBikeTypeToVehicle('City bike')).toBe('acoustic');
    expect(mapBikeTypeToVehicle('Mountain bike')).toBe('acoustic');
    expect(mapBikeTypeToVehicle('Recumbent')).toBe('acoustic');
    expect(mapBikeTypeToVehicle('Other')).toBe('acoustic');
  });

  it('maps e-bike variants to ebike', () => {
    expect(mapBikeTypeToVehicle('E-bike')).toBe('ebike');
    expect(mapBikeTypeToVehicle('e-bike')).toBe('ebike');
    expect(mapBikeTypeToVehicle('ebike')).toBe('ebike');
  });

  it('defaults null/undefined to acoustic', () => {
    expect(mapBikeTypeToVehicle(null)).toBe('acoustic');
    expect(mapBikeTypeToVehicle(undefined)).toBe('acoustic');
    expect(mapBikeTypeToVehicle('')).toBe('acoustic');
  });
});

describe('multipliers', () => {
  it('returns correct V_user values', () => {
    expect(getVUser('acoustic')).toBe(1.0);
    expect(getVUser('ebike')).toBe(0.6);
  });

  it('returns correct V_com values', () => {
    expect(getVCom('acoustic')).toBe(1.0);
    expect(getVCom('ebike')).toBe(0.85);
  });

  it('returns correct M_AQI for European AQI brackets', () => {
    expect(getMAqi(null)).toBe(1.0);
    expect(getMAqi(undefined)).toBe(1.0);
    expect(getMAqi(0)).toBe(1.0);
    expect(getMAqi(20)).toBe(1.0);
    expect(getMAqi(40)).toBe(1.0);
    expect(getMAqi(41)).toBe(1.2);
    expect(getMAqi(60)).toBe(1.2);
    expect(getMAqi(61)).toBe(1.5);
    expect(getMAqi(80)).toBe(1.5);
    expect(getMAqi(81)).toBe(1.0);
    expect(getMAqi(100)).toBe(1.0);
    expect(getMAqi(101)).toBe(0);
    expect(getMAqi(300)).toBe(0);
  });
});

describe('calculatePersonalMicrolives', () => {
  it('calculates correctly for 10 km acoustic ride, good air', () => {
    const ml = calculatePersonalMicrolives(10, 'acoustic', 30);
    expect(ml).toBe(4.0); // 0.4 × 10 × 1.0 × 1.0
  });

  it('calculates correctly for 10 km ebike ride, good air', () => {
    const ml = calculatePersonalMicrolives(10, 'ebike', 30);
    expect(ml).toBe(2.4); // 0.4 × 10 × 0.6 × 1.0
  });

  it('applies moderate AQI bonus', () => {
    const ml = calculatePersonalMicrolives(10, 'acoustic', 50);
    expect(ml).toBe(4.8); // 0.4 × 10 × 1.0 × 1.2
  });

  it('applies poor AQI bonus', () => {
    const ml = calculatePersonalMicrolives(10, 'acoustic', 70);
    expect(ml).toBe(6.0); // 0.4 × 10 × 1.0 × 1.5
  });

  it('returns 0 for hazardous AQI', () => {
    expect(calculatePersonalMicrolives(10, 'acoustic', 150)).toBe(0);
  });

  it('returns 0 for zero or negative distance', () => {
    expect(calculatePersonalMicrolives(0, 'acoustic', 30)).toBe(0);
    expect(calculatePersonalMicrolives(-5, 'acoustic', 30)).toBe(0);
  });

  it('handles null AQI as baseline', () => {
    expect(calculatePersonalMicrolives(10, 'acoustic', null)).toBe(4.0);
  });
});

describe('calculateCommunitySeconds', () => {
  it('calculates correctly for 10 km acoustic ride', () => {
    const secs = calculateCommunitySeconds(10, 'acoustic');
    expect(secs).toBe(45); // 4.5 × 10 × 1.0
  });

  it('calculates correctly for 10 km ebike ride', () => {
    const secs = calculateCommunitySeconds(10, 'ebike');
    expect(secs).toBe(38.25); // 4.5 × 10 × 0.85
  });

  it('returns 0 for zero distance', () => {
    expect(calculateCommunitySeconds(0, 'acoustic')).toBe(0);
  });
});

describe('formatMicrolivesAsTime', () => {
  it('formats small values as minutes', () => {
    expect(formatMicrolivesAsTime(0.5)).toBe('15 minutes');
    expect(formatMicrolivesAsTime(1)).toBe('30 minutes');
  });

  it('formats hours correctly', () => {
    expect(formatMicrolivesAsTime(2)).toBe('1 hour');
    expect(formatMicrolivesAsTime(4)).toBe('2 hours');
  });

  it('formats hours and minutes', () => {
    expect(formatMicrolivesAsTime(2.5)).toBe('1 hour, 15 minutes');
  });

  it('formats days', () => {
    expect(formatMicrolivesAsTime(48)).toBe('1 day');
    expect(formatMicrolivesAsTime(336)).toBe('7 days');
  });

  it('returns 0 minutes for zero', () => {
    expect(formatMicrolivesAsTime(0)).toBe('0 minutes');
  });
});

describe('formatCommunitySeconds', () => {
  it('formats seconds', () => {
    expect(formatCommunitySeconds(45)).toBe('45 seconds');
    expect(formatCommunitySeconds(1)).toBe('1 second');
  });

  it('formats minutes and seconds', () => {
    expect(formatCommunitySeconds(90)).toBe('1 minute, 30 seconds');
  });

  it('formats hours', () => {
    expect(formatCommunitySeconds(3600)).toBe('1 hour');
    expect(formatCommunitySeconds(3661)).toBe('1 hour, 1 minute');
  });

  it('returns 0 seconds for zero', () => {
    expect(formatCommunitySeconds(0)).toBe('0 seconds');
  });
});
