import type { Route } from './types';

export interface RouteComposition {
  label: string;
  distance: number;
  color: string;
  percentage: number;
}

export interface RouteAnalysis {
  elevationGain: number;
  elevationLoss: number;
  composition: RouteComposition[];
  riskScore: number;
  distance: number;
  numberOfClimbs: number;
  adjustedDuration: number;
}

const HILL_START_PENALTY_SEC = 10;
const ELEVATION_TIME_FACTOR = 0.75;
const CLIMB_THRESHOLD_M = 2;

export const getAdjustedDuration = (
  flatDuration: number,
  elevationProfile: number[] | null,
): {
  adjustedDuration: number;
  numberOfClimbs: number;
  elevationGain: number;
} => {
  let elevationGain = 0;
  let numberOfClimbs = 0;
  let currentClimbGain = 0;

  if (elevationProfile && elevationProfile.length > 1) {
    for (let index = 1; index < elevationProfile.length; index += 1) {
      const diff = elevationProfile[index] - elevationProfile[index - 1];

      if (diff > 0) {
        elevationGain += diff;
        currentClimbGain += diff;
      } else if (diff < 0) {
        if (currentClimbGain > CLIMB_THRESHOLD_M) {
          numberOfClimbs += 1;
        }
        currentClimbGain = 0;
      }
    }

    if (currentClimbGain > CLIMB_THRESHOLD_M) {
      numberOfClimbs += 1;
    }
  }

  const adjustedDuration =
    flatDuration +
    elevationGain * ELEVATION_TIME_FACTOR +
    numberOfClimbs * HILL_START_PENALTY_SEC;

  return {
    adjustedDuration,
    numberOfClimbs,
    elevationGain,
  };
};

const classifyHighway = (tag: string): { label: string; color: string } => {
  const normalizedTag = tag.toLowerCase().trim();

  if (normalizedTag.includes('cycleway') || normalizedTag === 'bicycle') {
    return { label: 'Cycleway', color: '#3b82f6' };
  }

  if (
    ['path', 'footway', 'pedestrian', 'steps', 'corridor', 'bridleway'].includes(
      normalizedTag,
    )
  ) {
    return { label: 'Path', color: '#10b981' };
  }

  if (['residential', 'living_street', 'service', 'road'].includes(normalizedTag)) {
    return { label: 'Residential', color: '#9ca3af' };
  }

  if (['track', 'dirt', 'unpaved'].includes(normalizedTag)) {
    return { label: 'Track', color: '#d97706' };
  }

  if (
    [
      'tertiary',
      'tertiary_link',
      'secondary',
      'secondary_link',
      'primary',
      'primary_link',
      'trunk',
      'trunk_link',
      'motorway',
      'motorway_link',
    ].includes(normalizedTag)
  ) {
    return { label: 'Main Road', color: '#f59e0b' };
  }

  if (normalizedTag === 'ferry') {
    return { label: 'Ferry', color: '#0ea5e9' };
  }

  if (normalizedTag === 'train') {
    return { label: 'Train', color: '#a855f7' };
  }

  if (normalizedTag === 'pushing bike' || normalizedTag === 'pushing') {
    return { label: 'Pushing', color: '#ef4444' };
  }

  return { label: 'Road', color: '#6b7280' };
};

export const analyzeRoute = (
  route: Route,
  elevationProfile: number[] | null,
): RouteAnalysis => {
  const { adjustedDuration, numberOfClimbs, elevationGain } = getAdjustedDuration(
    route.duration,
    elevationProfile,
  );

  let elevationLoss = 0;

  if (elevationProfile && elevationProfile.length > 1) {
    for (let index = 1; index < elevationProfile.length; index += 1) {
      const diff = elevationProfile[index] - elevationProfile[index - 1];

      if (diff < 0) {
        elevationLoss += Math.abs(diff);
      }
    }
  }

  const categoryMap = new Map<string, { distance: number; color: string }>();
  const totalDistance = route.distance;
  const annotation = route.legs[0]?.annotation;
  const hasClasses = Boolean(annotation?.classes && annotation.classes.length > 0);

  if (hasClasses && annotation?.distance) {
    const classes = annotation.classes ?? [];
    const distances = annotation.distance;

    for (let index = 0; index < Math.min(classes.length, distances.length); index += 1) {
      const rawTag = classes[index] || 'unclassified';
      const { label, color } = classifyHighway(rawTag);
      const current = categoryMap.get(label) || { distance: 0, color };

      categoryMap.set(label, {
        distance: current.distance + distances[index],
        color,
      });
    }
  } else {
    route.legs.forEach((leg) => {
      leg.steps.forEach((step) => {
        let rawTag = 'unclassified';
        const mode = step.mode.toLowerCase();
        const name = step.name.toLowerCase();

        if (mode === 'cycling') {
          if (
            name.includes('path') ||
            name.includes('trail') ||
            name.includes('ravel') ||
            name.includes('greenway')
          ) {
            rawTag = 'path';
          } else if (name.includes('cycle') || name.includes('pista')) {
            rawTag = 'cycleway';
          } else {
            rawTag = 'residential';
          }
        } else if (mode === 'pushing bike') {
          rawTag = 'pushing';
        } else if (mode === 'ferry') {
          rawTag = 'ferry';
        } else if (mode === 'train') {
          rawTag = 'train';
        } else if (mode === 'driving') {
          rawTag = 'primary';
        }

        const { label, color } = classifyHighway(rawTag);
        const current = categoryMap.get(label) || { distance: 0, color };

        categoryMap.set(label, {
          distance: current.distance + step.distance,
          color,
        });
      });
    });
  }

  const composition: RouteComposition[] = [];

  categoryMap.forEach((value, label) => {
    if (value.distance > 0) {
      composition.push({
        label,
        distance: value.distance,
        percentage: totalDistance > 0 ? (value.distance / totalDistance) * 100 : 0,
        color: value.color,
      });
    }
  });

  composition.sort((left, right) => right.distance - left.distance);

  return {
    elevationGain,
    elevationLoss,
    composition,
    riskScore: route.weight || 0,
    distance: route.distance,
    numberOfClimbs,
    adjustedDuration,
  };
};
