import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration, formatSpeed, formatManeuver, formatInstruction } from './formatters';
import type { Step } from '../types';

describe('formatters', () => {
    describe('formatDistance', () => {
        it('should format meters correctly', () => {
            expect(formatDistance(500)).toBe('500 m');
            expect(formatDistance(999)).toBe('999 m');
        });

        it('should format kilometers correctly', () => {
            expect(formatDistance(1000)).toBe('1.0 km');
            expect(formatDistance(1500)).toBe('1.5 km');
            expect(formatDistance(2560)).toBe('2.6 km');
        });
    });

    describe('formatDuration', () => {
        it('should format seconds correctly', () => {
            expect(formatDuration(30)).toBe('< 1 min');
            expect(formatDuration(59)).toBe('< 1 min');
        });

        it('should format minutes correctly', () => {
            expect(formatDuration(60)).toBe('1 min');
            expect(formatDuration(150)).toBe('3 min'); // 2.5 mins rounds to 3
            expect(formatDuration(3540)).toBe('59 min');
        });

        it('should format hours and minutes correctly', () => {
            expect(formatDuration(3600)).toBe('1 hr');
            expect(formatDuration(3660)).toBe('1 hr 1 min');
            expect(formatDuration(7500)).toBe('2 hr 5 min');
        });
    });

    describe('formatSpeed', () => {
        it('should return null for null or very slow speeds', () => {
            expect(formatSpeed(null)).toBeNull();
            expect(formatSpeed(0)).toBeNull();
            expect(formatSpeed(0.4)).toBeNull();
        });

        it('should format speed correctly in km/h', () => {
            expect(formatSpeed(1)).toBe('4 km/h'); // 1 m/s = 3.6 km/h -> 4
            expect(formatSpeed(10)).toBe('36 km/h');
            expect(formatSpeed(27.7778)).toBe('100 km/h');
        });
    });

    describe('formatManeuver and formatInstruction', () => {
        const mockStep: Step = {
            distance: 100,
            duration: 60,
            geometry: { coordinates: [], type: 'LineString' },
            maneuver: {
                bearing_after: 0,
                bearing_before: 0,
                location: [0, 0],
                type: 'turn',
                modifier: 'slight_right'
            },
            mode: 'driving',
            name: 'Main St',
            weight: 1
        };

        it('should format maneuver correctly', () => {
            expect(formatManeuver(mockStep)).toBe('Slight right');
        });

        it('should format instruction correctly', () => {
            expect(formatInstruction(mockStep)).toBe('Slight right onto Main St');
        });

        it('should format instruction without name', () => {
            const noNameStep = { ...mockStep, name: '' };
            expect(formatInstruction(noNameStep)).toBe('Slight right');
        });
    });
});
