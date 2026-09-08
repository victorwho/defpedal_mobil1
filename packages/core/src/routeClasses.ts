/**
 * Road classes along a route — `unpaved`, `tunnel`, `bridge`.
 *
 * OSRM puts these on `steps[].intersections[].classes`. It does NOT put them
 * on `leg.annotation`, which carries exactly
 * `[datasources, distance, duration, metadata, nodes, speed, weight]`.
 *
 * Three separate readers assumed `leg.annotation.classes` and therefore read
 * `undefined` on every route ever computed: the loop surface split reported
 * 100% paved for every ride, the tunnel and bridge map markers never once
 * appeared, and the surface breakdown was permanently empty. The data was
 * there the whole time, at a different address — measured on a Rasnov route,
 * 20 of 65 intersections carry `unpaved`.
 *
 * Everything here rides on `steps=true` + `annotations=true`, which every
 * routing request already sends. No extra call.
 */
import { haversineDistance } from './distance';

/** One intersection along a step. `classes` is the field that matters. */
export interface ClassifiedIntersection {
  readonly location?: readonly [number, number];
  readonly classes?: readonly string[];
}

export interface ClassifiedStep {
  readonly distance?: number;
  readonly intersections?: readonly ClassifiedIntersection[];
  readonly geometry?: { readonly coordinates?: readonly (readonly number[])[] };
}

export interface ClassifiedLeg {
  readonly steps?: readonly ClassifiedStep[];
}

/** Metres attributed to each class, and the metres we could classify at all. */
export interface ClassMeters {
  readonly byClass: ReadonlyMap<string, number>;
  /** Route length covered by steps that carried intersection data. */
  readonly classifiedMeters: number;
  readonly totalMeters: number;
}

/**
 * Split one step into the sub-segments its intersections describe.
 *
 * An intersection is a point, and the classes on it describe the road LEAVING
 * it — so intersection `i` owns the stretch from itself to intersection `i+1`,
 * and the last one owns the stretch to the end of the step.
 *
 * Sub-segment lengths come from the step geometry where it is available and
 * are then SCALED to `step.distance`, so the parts always sum to the whole the
 * router reported. Where geometry is missing the step is divided evenly, which
 * is coarse but never invents or loses distance.
 */
const segmentMeters = (step: ClassifiedStep): number[] => {
  const intersections = step.intersections ?? [];
  const stepMeters = Number.isFinite(step.distance) ? (step.distance ?? 0) : 0;
  const count = intersections.length;
  if (count === 0 || stepMeters <= 0) return [];
  if (count === 1) return [stepMeters];

  const end = step.geometry?.coordinates?.[
    (step.geometry.coordinates.length ?? 1) - 1
  ];
  const points: (readonly number[])[] = [];
  for (const intersection of intersections) {
    if (intersection.location) points.push(intersection.location);
  }
  // One location missing makes the whole positional split untrustworthy, so
  // fall back rather than mixing measured and guessed spacing.
  if (points.length !== count) {
    return new Array<number>(count).fill(stepMeters / count);
  }
  if (end && end.length >= 2) points.push(end);

  const raw: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = points[i]!;
    const to = points[i + 1];
    raw.push(to ? haversineDistance([from[1]!, from[0]!], [to[1]!, to[0]!]) : 0);
  }

  // Without a step end point the final intersection has nothing to measure
  // against. Give it the average of the others rather than zero — a class on
  // the last intersection of a step is real, and dropping it would understate
  // exactly the thing being measured.
  if (raw[count - 1] === 0 && count > 1) {
    const measured = raw.slice(0, count - 1);
    const mean =
      measured.reduce((total, value) => total + value, 0) / measured.length;
    raw[count - 1] = mean;
  }

  const sum = raw.reduce((total, value) => total + value, 0);
  if (sum <= 0) return new Array<number>(count).fill(stepMeters / count);
  // Scale so the parts sum to the distance the router reported.
  return raw.map((value) => (value / sum) * stepMeters);
};

/** Metres per class across a route's steps. */
export const classMeters = (legs: readonly ClassifiedLeg[]): ClassMeters => {
  const byClass = new Map<string, number>();
  let classifiedMeters = 0;
  let totalMeters = 0;

  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const stepMeters = Number.isFinite(step.distance) ? (step.distance ?? 0) : 0;
      totalMeters += stepMeters;

      const intersections = step.intersections ?? [];
      if (intersections.length === 0) continue;
      classifiedMeters += stepMeters;

      const segments = segmentMeters(step);
      for (let i = 0; i < intersections.length; i += 1) {
        const meters = segments[i] ?? 0;
        if (meters <= 0) continue;
        for (const name of intersections[i]!.classes ?? []) {
          if (!name) continue;
          byClass.set(name, (byClass.get(name) ?? 0) + meters);
        }
      }
    }
  }

  return { byClass, classifiedMeters, totalMeters };
};

/** A contiguous stretch of route carrying one class. */
export interface ClassRun {
  /** Metres from the route start to where the run begins. */
  readonly startMeters: number;
  readonly lengthMeters: number;
}

/**
 * Contiguous runs of one class, in ride order.
 *
 * Used for tunnels and bridges, which are zones a rider passes through rather
 * than a share of the ride. Adjacent classified segments collapse into one
 * run, so a tunnel is announced once rather than once per intersection.
 */
export const classRuns = (
  legs: readonly ClassifiedLeg[],
  className: string,
): ClassRun[] => {
  const runs: ClassRun[] = [];
  let cumulative = 0;
  let open: { start: number; length: number } | null = null;

  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const intersections = step.intersections ?? [];
      const stepMeters = Number.isFinite(step.distance) ? (step.distance ?? 0) : 0;

      if (intersections.length === 0) {
        if (open) {
          runs.push({ startMeters: open.start, lengthMeters: open.length });
          open = null;
        }
        cumulative += stepMeters;
        continue;
      }

      const segments = segmentMeters(step);
      for (let i = 0; i < intersections.length; i += 1) {
        const meters = segments[i] ?? 0;
        const has = (intersections[i]!.classes ?? []).includes(className);
        if (has) {
          if (open) open.length += meters;
          else open = { start: cumulative, length: meters };
        } else if (open) {
          runs.push({ startMeters: open.start, lengthMeters: open.length });
          open = null;
        }
        cumulative += meters;
      }
    }
  }

  if (open) runs.push({ startMeters: open.start, lengthMeters: open.length });
  return runs;
};
