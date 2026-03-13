import { describe, it, expect } from 'vitest';
import { getAdjustedDuration } from './routeAnalysis';

describe('routeAnalysis', () => {
    describe('getAdjustedDuration', () => {
        it('should return flat duration when there is no elevation profile', () => {
            const result = getAdjustedDuration(1000, null);
            expect(result.adjustedDuration).toBe(1000);
            expect(result.elevationGain).toBe(0);
            expect(result.numberOfClimbs).toBe(0);
        });

        it('should return flat duration when elevation profile is flat', () => {
            const result = getAdjustedDuration(1000, [10, 10, 10, 10]);
            expect(result.adjustedDuration).toBe(1000);
            expect(result.elevationGain).toBe(0);
            expect(result.numberOfClimbs).toBe(0);
        });

        it('should calculate elevation gain and adjust duration', () => {
            // Profile goes from 10 to 20 (gain 10), then down to 10 (loss 10)
            // Gain = 10m
            // Climb threshold is 2m, so this counts as 1 climb
            // Adjusted = 1000 + (10 * 0.75) + (1 * 10) = 1000 + 7.5 + 10 = 1017.5
            const result = getAdjustedDuration(1000, [10, 15, 20, 15, 10]);
            expect(result.elevationGain).toBe(10);
            expect(result.numberOfClimbs).toBe(1);
            expect(result.adjustedDuration).toBe(1017.5);
        });

        it('should count multiple climbs correctly', () => {
            // 10 -> 15 (gain 5, climb 1)
            // 15 -> 10 (loss 5)
            // 10 -> 15 (gain 5, climb 2)
            // 15 -> 10 (loss 5)
            const result = getAdjustedDuration(1000, [10, 15, 10, 15, 10]);
            expect(result.elevationGain).toBe(10);
            expect(result.numberOfClimbs).toBe(2);
            // Adjusted = 1000 + (10 * 0.75) + (2 * 10) = 1000 + 7.5 + 20 = 1027.5
            expect(result.adjustedDuration).toBe(1027.5);
        });

        it('should ignore climbs below the threshold', () => {
            // 10 -> 11 (gain 1, below threshold of 2)
            // 11 -> 10 (loss 1)
            const result = getAdjustedDuration(1000, [10, 11, 10]);
            expect(result.elevationGain).toBe(1);
            expect(result.numberOfClimbs).toBe(0);
            // Adjusted = 1000 + (1 * 0.75) + (0 * 10) = 1000.75
            expect(result.adjustedDuration).toBe(1000.75);
        });
    });
});
