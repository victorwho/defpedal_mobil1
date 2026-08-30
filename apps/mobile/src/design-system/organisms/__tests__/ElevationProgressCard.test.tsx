/**
 * The navigation elevation chart must show the WHOLE route with a marker for
 * where the rider is — not a shrinking view of what is left.
 *
 * Both properties failed in practice, so both are pinned here as pure
 * geometry (the render harness is irrelevant to what actually broke):
 *
 *   - the profile path is a function of the elevation array ALONE, never of
 *     progress, so the chart cannot change shape as the rider moves;
 *   - the marker is never clipped at 0% or 100%, which is what made it look
 *     absent right after starting a ride or landing a reroute.
 *
 * The third leg of the fix lives in app/navigation.tsx: the profile is
 * snapshotted per route id, so a reroute replacing `selectedRoute` with a
 * shorter current-position-to-destination route cannot collapse the chart
 * mid-ride. It updates only when the route genuinely changes.
 */
import { describe, expect, it } from 'vitest';

import { buildPath, CHART_WIDTH, computeMarkerX } from '../ElevationProgressCard';

const PROFILE = [100, 120, 140, 130, 160, 150, 180, 170, 190, 200];
const HEIGHT = 50;

describe('buildPath — whole-route profile', () => {
  it('depends only on the elevation array, never on progress', () => {
    // The regression: the chart represented only the remaining route, so it
    // visibly shrank as the rider progressed. buildPath takes no progress
    // argument at all — this test exists to keep it that way.
    expect(buildPath.length).toBe(3); // (profile, width, height)
    const a = buildPath(PROFILE, CHART_WIDTH, HEIGHT);
    const b = buildPath(PROFILE, CHART_WIDTH, HEIGHT);
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('spans the full chart width', () => {
    const d = buildPath(PROFILE, CHART_WIDTH, HEIGHT);
    expect(d.startsWith('M0,')).toBe(true);
    expect(d).toContain(`L${CHART_WIDTH},`);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('plots every sample in the profile', () => {
    const d = buildPath(PROFILE, CHART_WIDTH, HEIGHT);
    // One vertex per sample, plus the two closing corners.
    expect(d.split('L').length - 1).toBe(PROFILE.length + 1);
  });

  it('returns empty for a profile too short to draw', () => {
    expect(buildPath([], CHART_WIDTH, HEIGHT)).toBe('');
    expect(buildPath([100], CHART_WIDTH, HEIGHT)).toBe('');
  });

  it('survives a completely flat profile without dividing by zero', () => {
    const flat = buildPath([50, 50, 50, 50], CHART_WIDTH, HEIGHT);
    expect(flat).not.toBe('');
    expect(flat).not.toContain('NaN');
  });
});

describe('computeMarkerX — position marker', () => {
  it('advances left to right with progress', () => {
    const start = computeMarkerX(0);
    const mid = computeMarkerX(0.5);
    const end = computeMarkerX(1);
    expect(mid).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(mid);
    expect(mid).toBeCloseTo(CHART_WIDTH / 2, 5);
  });

  it('stays fully visible at 0% — the case that looked like no marker at all', () => {
    // Unclamped this was exactly 0, so half the stroke fell outside the
    // viewBox and read as a chart border.
    expect(computeMarkerX(0)).toBeGreaterThan(0);
  });

  it('stays fully visible at 100%', () => {
    expect(computeMarkerX(1)).toBeLessThan(CHART_WIDTH);
  });

  it('clamps out-of-range and non-finite ratios instead of drawing off-chart', () => {
    // remainingDistanceMeters can exceed the snapshot total right after a
    // reroute, and totalDistanceMeters can momentarily be 0.
    for (const bad of [-5, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const x = computeMarkerX(bad);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(CHART_WIDTH);
    }
  });
});
