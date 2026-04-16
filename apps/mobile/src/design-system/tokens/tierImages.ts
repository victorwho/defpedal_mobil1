/**
 * Tier Mascot Images
 *
 * Each tier has a mascot illustration (256x256 PNG, transparent bg).
 */

import type { RiderTierKey } from './tierColors';

export const tierImages: Record<RiderTierKey, number> = {
  kickstand:    require('../../../assets/tiers/kickstand.png'),
  spoke:        require('../../../assets/tiers/spoke.png'),
  pedaler:      require('../../../assets/tiers/pedaler.png'),
  street_smart: require('../../../assets/tiers/street_smart.png'),
  road_regular: require('../../../assets/tiers/road_regular.png'),
  trail_blazer: require('../../../assets/tiers/trail_blazer.png'),
  road_captain: require('../../../assets/tiers/road_captain.png'),
  city_guardian: require('../../../assets/tiers/city_guardian.png'),
  iron_cyclist: require('../../../assets/tiers/iron_cyclist.png'),
  legend:       require('../../../assets/tiers/legend.png'),
};

/** Returns true if mascot images are available */
export function hasTierImage(_tier: RiderTierKey): boolean {
  return true;
}
