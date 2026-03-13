import { describe, it, expect } from 'vitest';
import { haversineDistance, findClosestPointIndex } from './distance';

describe('haversineDistance', () => {
    it('should calculate distance between two identical points as 0', () => {
        const p: [number, number] = [40.7128, -74.0060];
        expect(haversineDistance(p, p)).toBe(0);
    });

    it('should calculate distance correctly between two known points', () => {
        // New York
        const p1: [number, number] = [40.7128, -74.0060];
        // Los Angeles
        const p2: [number, number] = [34.0522, -118.2437];
        
        const distance = haversineDistance(p1, p2);
        // Approx 3935 km
        expect(distance).toBeGreaterThan(3900000);
        expect(distance).toBeLessThan(4000000);
    });
});

describe('findClosestPointIndex', () => {
    it('should return -1 for empty points array', () => {
        expect(findClosestPointIndex([0, 0], [])).toBe(-1);
    });

    it('should find the exact match', () => {
        const target: [number, number] = [10, 20]; // [lat, lon]
        const points: [number, number][] = [
            [0, 0], // [lon, lat]
            [20, 10], // exact match
            [30, 30]
        ];
        expect(findClosestPointIndex(target, points)).toBe(1);
    });

    it('should find the closest point', () => {
        const target: [number, number] = [10, 20]; // [lat, lon]
        const points: [number, number][] = [
            [0, 0], // [lon, lat]
            [20.1, 10.1], // closest
            [30, 30]
        ];
        expect(findClosestPointIndex(target, points)).toBe(1);
    });
});
