import type { SafetyTag } from '@defensivepedal/core';
import type { RouteComposition } from '@defensivepedal/core';

/**
 * Auto-generate safety tags from route composition data.
 * Users can edit the result before sharing.
 */
export const generateSafetyTags = (composition: RouteComposition[]): SafetyTag[] => {
  const tags: SafetyTag[] = [];
  const byLabel = new Map(composition.map((c) => [c.label, c.percentage]));

  const cyclewayPct = byLabel.get('Cycleway') ?? 0;
  const pathPct = byLabel.get('Path') ?? 0;
  const residentialPct = byLabel.get('Residential') ?? 0;
  const mainRoadPct = byLabel.get('Main Road') ?? 0;

  if (cyclewayPct >= 40) {
    tags.push('bike_lane');
  }

  if (pathPct >= 30) {
    tags.push('separated_path');
  }

  if (residentialPct >= 50) {
    tags.push('residential');
  }

  if (mainRoadPct < 15) {
    tags.push('avoid_main_road');
  }

  if (mainRoadPct < 25 && cyclewayPct + pathPct + residentialPct >= 70) {
    tags.push('low_traffic');
  }

  return tags;
};
