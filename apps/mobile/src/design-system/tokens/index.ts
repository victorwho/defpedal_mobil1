/**
 * Design System v1.0 — Token Barrel Export
 *
 * Import everything from here:
 *   import { colors, typography, space, radii, shadows, motion } from '../design-system/tokens';
 */

export * as colors from './colors';
export * as typography from './typography';
export { space, layout } from './spacing';
export { radii } from './radii';
export { shadows, safetyGlows } from './shadows';
export { duration, easing } from './motion';
export { tints, opacity, brandTints, safetyTints, surfaceTints } from './tints';
export { iconSize } from './iconSize';
export { zIndex } from './zIndex';
export { riderTiers, getNextTier, getTierProgress, getXpToNextTier } from './tierColors';
export type { RiderTierKey } from './tierColors';
export { hasTierImage } from './tierImages';
export { HAZARD_ICONS, getHazardIcon } from './hazardIcons';
export { mascotPoses, mascotSizes } from './mascotPoses';
export type { MascotPose, MascotSize, MascotPoseAsset } from './mascotPoses';
export {
  routeFeatureTierColors,
  routeFeatureLabelColor,
  routeFeatureStrokeColor,
  routeFeatureIcons,
  routeFeatureCircleColorExpression,
  routeFeatureLabelExpression,
  routeFeatureMarker,
  getRouteFeatureIcon,
  getRouteFeatureTierColor,
} from './routeFeatureIcons';
export type { RouteFeatureIcon } from './routeFeatureIcons';
