import { describe, expect, it } from 'vitest';

import type { NavigationStep } from './contracts';
import { applyWalkCues, findWalkSections, totalWalkMeters, WALK_MODE } from './walkSections';

/**
 * Hand-built steps in the shape `mapbox-routing.ts` produces. The routing
 * graph does not serve "pushing bike" yet (OSRM_Server ef105ca, awaiting the
 * next rebuild), so there is no live response to capture; replace one of these
 * with a captured fixture once the probes in the plan return walk steps.
 */
let lon = 26.1;
const step = (
  mode: 'cycling' | typeof WALK_MODE,
  distanceMeters: number,
  type = 'turn',
): NavigationStep => {
  const start: [number, number] = [lon, 44.4];
  lon += distanceMeters / 100_000;
  const end: [number, number] = [lon, 44.4];
  return {
    id: `s-${start[0].toFixed(5)}`,
    instruction: type,
    streetName: '',
    distanceMeters,
    durationSeconds: distanceMeters / (mode === WALK_MODE ? 1.4 : 4),
    maneuver: { type, location: start, bearing_before: 0, bearing_after: 0 } as NavigationStep['maneuver'],
    geometry: { type: 'LineString', coordinates: distanceMeters > 0 ? [start, end] : [start] },
    mode,
  };
};

const sum = (steps: NavigationStep[]) => steps.reduce((m, s) => m + s.distanceMeters, 0);

describe('findWalkSections', () => {
  it('merges consecutive walk steps and ignores the zero-length arrive', () => {
    const steps = [
      step('cycling', 500, 'depart'),
      step(WALK_MODE, 13, 'notification'),
      step(WALK_MODE, 83),
      step(WALK_MODE, 154),
      step(WALK_MODE, 0, 'arrive'),
    ];
    const sections = findWalkSections(steps);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ start: 1, end: 3, distanceMeters: 250 });
    // Shared boundary points are not duplicated: 3 steps × 2 points − 2 shared.
    expect(sections[0].coordinates).toHaveLength(4);
    expect(totalWalkMeters(sections)).toBe(250);
  });

  it('finds nothing on a route served before the graph marked walking', () => {
    expect(findWalkSections([step('cycling', 500, 'depart'), step('cycling', 0, 'arrive')])).toEqual([]);
  });
});

describe('applyWalkCues', () => {
  it('cues a long section at its start and where riding resumes, folding the notification steps', () => {
    const steps = [
      step('cycling', 400, 'depart'),
      step(WALK_MODE, 60, 'turn'),
      step(WALK_MODE, 50, 'notification'),
      step('cycling', 300, 'notification'),
      step('cycling', 200, 'turn'),
      step('cycling', 0, 'arrive'),
    ];
    const out = applyWalkCues(steps);

    expect(out.map((s) => s.maneuver.type)).toEqual(['depart', 'turn', 'notification', 'turn', 'arrive']);
    expect(out[1]).toMatchObject({ walkCue: 'dismount', walkMeters: 110, distanceMeters: 110 });
    // The ride-again step is kept even though it is a notification: it marks the spot.
    expect(out[2].walkCue).toBe('ride_again');
    expect(sum(out)).toBe(sum(steps));
  });

  it('folds a short crossing silently and cues the maneuver the rider approaches it under', () => {
    const steps = [
      step('cycling', 400, 'depart'),
      step(WALK_MODE, 14, 'notification'),
      step('cycling', 300, 'notification'),
      step('cycling', 200, 'turn'),
      step('cycling', 0, 'arrive'),
    ];
    const out = applyWalkCues(steps);

    expect(out.map((s) => s.maneuver.type)).toEqual(['depart', 'turn', 'arrive']);
    expect(out[0].distanceMeters).toBe(714);
    expect(out[1].walkCue).toBe('cross_on_foot');
    expect(out.filter((s) => s.walkCue === 'dismount' || s.walkCue === 'ride_again')).toHaveLength(0);
    expect(sum(out)).toBe(sum(steps));
  });

  it('stays calm with many crossings: one cue per maneuver, totals unchanged', () => {
    const steps: NavigationStep[] = [step('cycling', 300, 'depart')];
    for (let i = 0; i < 20; i += 1) {
      steps.push(step(WALK_MODE, 12, 'notification'), step('cycling', 200, 'notification'));
    }
    steps.push(step('cycling', 100, 'turn'), step('cycling', 0, 'arrive'));
    const out = applyWalkCues(steps);

    expect(out).toHaveLength(3);
    expect(out.filter((s) => s.walkCue).length).toBe(1);
    expect(sum(out)).toBe(sum(steps));
  });

  it('cues the departure when the route starts on foot', () => {
    const out = applyWalkCues([
      step(WALK_MODE, 120, 'depart'),
      step('cycling', 500, 'turn'),
      step('cycling', 0, 'arrive'),
    ]);
    expect(out[0]).toMatchObject({ walkCue: 'dismount', walkMeters: 120 });
    expect(out[1].walkCue).toBe('ride_again');
  });

  it('does not tell the rider to ride again when the walk runs to the destination', () => {
    const out = applyWalkCues([
      step('cycling', 500, 'depart'),
      step(WALK_MODE, 200, 'turn'),
      step(WALK_MODE, 0, 'arrive'),
    ]);
    expect(out[1].walkCue).toBe('dismount');
    expect(out[2].walkCue).toBeUndefined();
  });

  it('leaves a route with no walking untouched', () => {
    const steps = [step('cycling', 500, 'depart'), step('cycling', 0, 'arrive')];
    expect(applyWalkCues(steps)).toEqual(steps);
  });
});
