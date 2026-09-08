import { describe, expect, it } from 'vitest';

import fixture from './__fixtures__/osrm-classes.json';
import { classMeters, classRuns, type ClassifiedLeg } from './routeClasses';

/**
 * The fixture is a real response from the live safety OSRM, trimmed to the
 * fields these readers use. It exists because the bug this replaces was not a
 * parsing error — the parsing was correct — it was reading the wrong ADDRESS.
 * Every previous test built its own `leg.annotation.classes` fixture and
 * asserted the parse, so all of them passed while the feature returned nothing
 * on every route the app ever computed.
 */
const liveLegs = fixture.legs as unknown as ClassifiedLeg[];

describe('where OSRM actually puts road classes', () => {
  it('REGRESSION: not on leg.annotation — that has no classes key', () => {
    // The exact shape the live server returns. If OSRM ever moves classes onto
    // the annotation this fails and someone re-reads the docs, which is the
    // right outcome either way.
    for (const leg of fixture.legs) {
      expect(leg.annotationKeys).not.toContain('classes');
      expect(leg.annotationKeys).toContain('distance');
      expect(leg.annotationKeys).toContain('nodes');
    }
  });

  it('reads unpaved off a real route that has it', () => {
    const { byClass, classifiedMeters } = classMeters(liveLegs);
    expect(byClass.get('unpaved')).toBeGreaterThan(0);
    expect(classifiedMeters).toBeGreaterThan(0);
  });

  it('reports a share that is neither zero nor everything', () => {
    // The symptom was "100% paved" on routes that plainly are not. A real
    // mixed route must land strictly between the two.
    const { byClass, classifiedMeters } = classMeters(liveLegs);
    const share = (byClass.get('unpaved') ?? 0) / classifiedMeters;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.99);
  });

  it('never attributes more than the route length', () => {
    const { byClass, totalMeters } = classMeters(liveLegs);
    expect(byClass.get('unpaved')!).toBeLessThanOrEqual(totalMeters + 1);
    expect(Math.abs(totalMeters - fixture.distance)).toBeLessThan(1);
  });
});

describe('classMeters', () => {
  const step = (
    distance: number,
    classes: (string[] | undefined)[],
  ): ClassifiedLeg['steps'] extends readonly (infer S)[] ? S : never =>
    ({
      distance,
      intersections: classes.map((c, i) => ({
        location: [26 + i * 0.01, 44] as [number, number],
        ...(c ? { classes: c } : {}),
      })),
    }) as never;

  it('splits a step between its intersections and sums to the whole', () => {
    const legs: ClassifiedLeg[] = [
      { steps: [step(1_000, [['unpaved'], undefined])] },
    ];
    const { byClass, classifiedMeters } = classMeters(legs);
    expect(classifiedMeters).toBe(1_000);
    // Half the step is behind the classed intersection.
    expect(byClass.get('unpaved')).toBeGreaterThan(0);
    expect(byClass.get('unpaved')).toBeLessThan(1_000);
  });

  it('counts a step with no intersections as unclassifiable, not as paved', () => {
    // Reporting a share of a length we could not classify would understate it
    // and look like the preference did nothing — the original bug's shape.
    const legs: ClassifiedLeg[] = [{ steps: [{ distance: 500 }] }];
    const { classifiedMeters, totalMeters, byClass } = classMeters(legs);
    expect(totalMeters).toBe(500);
    expect(classifiedMeters).toBe(0);
    expect(byClass.size).toBe(0);
  });

  it('handles several classes on one intersection', () => {
    const legs: ClassifiedLeg[] = [
      { steps: [step(600, [['unpaved', 'bridge'], ['unpaved']])] },
    ];
    const { byClass } = classMeters(legs);
    expect(byClass.get('unpaved')).toBeGreaterThan(byClass.get('bridge')!);
    expect(byClass.get('bridge')).toBeGreaterThan(0);
  });

  it('survives a route with no steps at all', () => {
    expect(classMeters([]).classifiedMeters).toBe(0);
    expect(classMeters([{ steps: [] }]).totalMeters).toBe(0);
  });
});

describe('classRuns', () => {
  it('collapses adjacent classed segments into one run', () => {
    // A tunnel should be announced once, not once per intersection inside it.
    const legs: ClassifiedLeg[] = [
      {
        steps: [
          {
            distance: 900,
            intersections: [
              { location: [26.0, 44], classes: ['tunnel'] },
              { location: [26.01, 44], classes: ['tunnel'] },
              { location: [26.02, 44] },
            ],
          },
        ],
      },
    ];
    const runs = classRuns(legs, 'tunnel');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.startMeters).toBe(0);
    expect(runs[0]!.lengthMeters).toBeGreaterThan(0);
  });

  it('separates two tunnels with clear road between them', () => {
    const legs: ClassifiedLeg[] = [
      {
        steps: [
          {
            distance: 1_200,
            intersections: [
              { location: [26.0, 44], classes: ['tunnel'] },
              { location: [26.01, 44] },
              { location: [26.02, 44], classes: ['tunnel'] },
              { location: [26.03, 44] },
            ],
          },
        ],
      },
    ];
    const runs = classRuns(legs, 'tunnel');
    expect(runs).toHaveLength(2);
    expect(runs[1]!.startMeters).toBeGreaterThan(runs[0]!.startMeters);
  });

  it('finds nothing for a class the route does not carry', () => {
    expect(classRuns(liveLegs, 'tunnel')).toEqual([]);
    expect(classRuns(liveLegs, 'unpaved').length).toBeGreaterThan(0);
  });
});
