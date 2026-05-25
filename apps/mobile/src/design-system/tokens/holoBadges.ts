/**
 * Holographic Badge Asset Manifest
 *
 * Maps badge_key → require()'d PNG asset for the HoloSticker atom. Static
 * requires (not dynamic) so Metro bundles every asset at build time.
 *
 * Keys match the filenames in apps/mobile/assets/holo_badges/. Badges whose
 * key is NOT present here fall back to the SVG BadgeIcon (the existing
 * shield + duotone icon system). New holographic art added to the assets
 * folder must also be added here.
 *
 * Asset spec: 480×480, RGBA with die-cut alpha (background flood-filled at
 * source). See scripts/process-holo-badges.py for the pipeline.
 */

import type { ImageSourcePropType } from 'react-native';

export const holoBadgeAssets: Record<string, ImageSourcePropType> = {
  all_weather: require('../../../assets/holo_badges/all_weather.png'),
  ambassador: require('../../../assets/holo_badges/ambassador.png'),
  aqi_aware: require('../../../assets/holo_badges/aqi_aware.png'),
  autumn_leaf: require('../../../assets/holo_badges/autumn_leaf.png'),
  bike_day: require('../../../assets/holo_badges/bike_day.png'),
  co2_champion: require('../../../assets/holo_badges/co2_champion.png'),
  co2_weekly_champion: require('../../../assets/holo_badges/co2_champion.png'),
  co2_monthly_champion: require('../../../assets/holo_badges/co2_champion.png'),
  co2_champion_repeat: require('../../../assets/holo_badges/co2_champion.png'),
  cheerleader: require('../../../assets/holo_badges/cheerleader.png'),
  christmas: require('../../../assets/holo_badges/christmas.png'),
  commentator: require('../../../assets/holo_badges/commentator.png'),
  drizzle_drifter: require('../../../assets/holo_badges/drizzle_drifter.png'),
  early_bird: require('../../../assets/holo_badges/early_bird.png'),
  earth_day: require('../../../assets/holo_badges/earth_day.png'),
  endurance: require('../../../assets/holo_badges/endurance.png'),
  first_10km: require('../../../assets/holo_badges/first_10km.png'),
  first_comment: require('../../../assets/holo_badges/first_comment.png'),
  first_hazard: require('../../../assets/holo_badges/first_hazard.png'),
  first_like: require('../../../assets/holo_badges/first_like.png'),
  first_multi_stop: require('../../../assets/holo_badges/first_multi_stop.png'),
  first_night_ride: require('../../../assets/holo_badges/first_night_ride.png'),
  first_quiz: require('../../../assets/holo_badges/first_quiz.png'),
  first_rain_ride: require('../../../assets/holo_badges/first_rain_ride.png'),
  first_ride: require('../../../assets/holo_badges/first_ride.png'),
  first_safe_route: require('../../../assets/holo_badges/first_safe_route.png'),
  first_share: require('../../../assets/holo_badges/first_share.png'),
  first_validation: require('../../../assets/holo_badges/first_validation.png'),
  first_week_streak: require('../../../assets/holo_badges/first_week_streak.png'),
  five_am: require('../../../assets/holo_badges/five_am.png'),
  four_seasons: require('../../../assets/holo_badges/four_seasons.png'),
  friday_13: require('../../../assets/holo_badges/friday_13.png'),
  frost_rider: require('../../../assets/holo_badges/frost_rider.png'),
  full_moon: require('../../../assets/holo_badges/full_moon.png'),
  good_air: require('../../../assets/holo_badges/good_air.png'),
  green_machine: require('../../../assets/holo_badges/green_machine.png'),
  halloween: require('../../../assets/holo_badges/halloween.png'),
  hazard_all_types: require('../../../assets/holo_badges/hazard_all_types.png'),
  hazard_champion: require('../../../assets/holo_badges/hazard_champion.png'),
  hazard_construction: require('../../../assets/holo_badges/hazard_construction.png'),
  hazard_intersection: require('../../../assets/holo_badges/hazard_intersection.png'),
  hazard_parking: require('../../../assets/holo_badges/hazard_parking.png'),
  hazard_pothole: require('../../../assets/holo_badges/hazard_pothole.png'),
  headwind_hero: require('../../../assets/holo_badges/headwind_hero.png'),
  heatwave_hauler: require('../../../assets/holo_badges/heatwave_hauler.png'),
  holiday_rider: require('../../../assets/holo_badges/holiday_rider.png'),
  iron_legs: require('../../../assets/holo_badges/iron_legs.png'),
  iron_streak: require('../../../assets/holo_badges/iron_streak.png'),
  leap_day: require('../../../assets/holo_badges/leap_day.png'),
  mia_confident_cyclist: require('../../../assets/holo_badges/mia_confident_cyclist.png'),
  midnight: require('../../../assets/holo_badges/midnight.png'),
  mirror_distance: require('../../../assets/holo_badges/mirror_distance.png'),
  monthly_regular: require('../../../assets/holo_badges/monthly_regular.png'),
  mountain_goat: require('../../../assets/holo_badges/mountain_goat.png'),
  multi_3stops: require('../../../assets/holo_badges/multi_3stops.png'),
  new_year: require('../../../assets/holo_badges/new_year.png'),
  night_owl: require('../../../assets/holo_badges/night_owl.png'),
  pedal_counter: require('../../../assets/holo_badges/pedal_counter.png'),
  penny_wise: require('../../../assets/holo_badges/penny_wise.png'),
  pi_day: require('../../../assets/holo_badges/pi_day.png'),
  quiz_master: require('../../../assets/holo_badges/quiz_master.png'),
  quiz_perfect: require('../../../assets/holo_badges/quiz_perfect.png'),
  road_guardian: require('../../../assets/holo_badges/road_guardian.png'),
  road_warrior: require('../../../assets/holo_badges/road_warrior.png'),
  round_number: require('../../../assets/holo_badges/round_number.png'),
  round_trip: require('../../../assets/holo_badges/round_trip.png'),
  saddle_time: require('../../../assets/holo_badges/saddle_time.png'),
  same_origin_dest_7: require('../../../assets/holo_badges/same_origin_dest_7.png'),
  shield_bearer: require('../../../assets/holo_badges/shield_bearer.png'),
  skyward: require('../../../assets/holo_badges/skyward.png'),
  social_cyclist: require('../../../assets/holo_badges/social_cyclist.png'),
  spring_bloom: require('../../../assets/holo_badges/spring_bloom.png'),
  sprint_500m_climb: require('../../../assets/holo_badges/sprint_500m_climb.png'),
  storm_chaser: require('../../../assets/holo_badges/storm_chaser.png'),
  summer_blaze: require('../../../assets/holo_badges/summer_blaze.png'),
  summer_solstice: require('../../../assets/holo_badges/summer_solstice.png'),
  valentine: require('../../../assets/holo_badges/valentine.png'),
  validator: require('../../../assets/holo_badges/validator.png'),
  weekend_warrior: require('../../../assets/holo_badges/weekend_warrior.png'),
  winter_solstice: require('../../../assets/holo_badges/winter_solstice.png'),
  winter_steel: require('../../../assets/holo_badges/winter_steel.png'),
  zero_risk: require('../../../assets/holo_badges/zero_risk.png'),

  // ---------------------------------------------------------------------------
  // Aliases — badges whose badge_key differs from the PNG stem but whose
  // icon_key (or fuzzy filename match) points at an existing asset. Listed
  // by `scripts/list-missing-holo-badges.py`. Keep alphabetised within group.
  // ---------------------------------------------------------------------------

  // quiz_perfect family — one PNG covers all three quiz-perfect badges
  quiz_perfect_1: require('../../../assets/holo_badges/quiz_perfect.png'),
  quiz_perfect_5: require('../../../assets/holo_badges/quiz_perfect.png'),
  quiz_perfect_streak_3: require('../../../assets/holo_badges/quiz_perfect.png'),

  // endurance family — both endurance badges share the icon
  endurance_2h: require('../../../assets/holo_badges/endurance.png'),
  endurance_4h: require('../../../assets/holo_badges/endurance.png'),

  // weather + AQI — badge_key references the condition; icon_key matches the
  // mascot illustration name. Map each badge to its existing PNG.
  rain_ride: require('../../../assets/holo_badges/drizzle_drifter.png'),
  rain_ride_10: require('../../../assets/holo_badges/storm_chaser.png'),
  wind_ride: require('../../../assets/holo_badges/headwind_hero.png'),
  cold_ride: require('../../../assets/holo_badges/frost_rider.png'),
  hot_ride: require('../../../assets/holo_badges/heatwave_hauler.png'),
  good_air_20: require('../../../assets/holo_badges/good_air.png'),
  aqi_aware_5: require('../../../assets/holo_badges/aqi_aware.png'),
};

/**
 * Look up the holo PNG for a badge. Falls back to tierFamily if the badgeKey
 * itself isn't a top-level entry. Returns undefined if no holo art exists —
 * caller should render the SVG BadgeIcon instead.
 */
export function getHoloBadgeAsset(
  badgeKey: string,
  tierFamily?: string | null,
): ImageSourcePropType | undefined {
  return (
    holoBadgeAssets[badgeKey] ??
    (tierFamily ? holoBadgeAssets[tierFamily] : undefined)
  );
}

/** Returns true if a holo PNG exists for this badge (used to gate the visual choice). */
export function hasHoloBadgeAsset(
  badgeKey: string,
  tierFamily?: string | null,
): boolean {
  return getHoloBadgeAsset(badgeKey, tierFamily) !== undefined;
}
