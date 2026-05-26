/**
 * Holographic Tier Medallions
 *
 * Static require() map keyed by RiderTierKey for the 10 holographic
 * tier medallion PNGs at apps/mobile/assets/holo_tiers/. Each PNG is
 * 480×480 RGBA with the medallion centered on a transparent backdrop;
 * frame (outer iridescent ring + accent metal band + gem chips +
 * engraved tier name + character + drop shadow) is baked in at design
 * time, no runtime compositing.
 *
 * Used by `HoloMedallion` atom which adds gyro tilt + halo + 3D
 * rotation + slow continuous shimmer at render time.
 *
 * Sister manifest to `holoBadges.ts` — same pattern, smaller set,
 * tier-shape (coin) instead of badge-shape (die-cut sticker).
 */

import type { ImageSourcePropType } from 'react-native';

import type { RiderTierKey } from './tierColors';

export const holoTierAssets: Record<RiderTierKey, ImageSourcePropType> = {
  kickstand: require('../../../assets/holo_tiers/kickstand.png'),
  spoke: require('../../../assets/holo_tiers/spoke.png'),
  pedaler: require('../../../assets/holo_tiers/pedaler.png'),
  street_smart: require('../../../assets/holo_tiers/street_smart.png'),
  road_regular: require('../../../assets/holo_tiers/road_regular.png'),
  iron_cyclist: require('../../../assets/holo_tiers/iron_cyclist.png'),
  trail_blazer: require('../../../assets/holo_tiers/trail_blazer.png'),
  road_captain: require('../../../assets/holo_tiers/road_captain.png'),
  city_guardian: require('../../../assets/holo_tiers/city_guardian.png'),
  legend: require('../../../assets/holo_tiers/legend.png'),
};

export function getHoloTierAsset(tier: RiderTierKey): ImageSourcePropType {
  return holoTierAssets[tier];
}
