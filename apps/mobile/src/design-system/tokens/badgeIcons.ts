/**
 * Badge Icon Paths — SVG path data for every badge icon.
 *
 * All paths fit a 24x24 viewBox.
 *
 * DUOTONE CONVENTION:
 *   fills  = primary visual mass (solid shapes, rendered first at full opacity)
 *   paths  = accent detail strokes (rendered on top, thinner, reduced opacity)
 *
 * Tiered badge families share one icon across all tiers.
 * One-time badges each have a unique icon.
 *
 * Convention: icon keys match badge_key or tier_family from badge_definitions.
 */

export interface BadgeIconDef {
  /** SVG path data for stroked accent details (d attribute). */
  readonly paths: readonly string[];
  /** SVG path data for filled primary shapes. */
  readonly fills?: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const filled = (fills: string[], paths: string[] = []): BadgeIconDef => ({ paths, fills });
const icon = (path: string): BadgeIconDef => ({ paths: [path] });
const multi = (...paths: string[]): BadgeIconDef => ({ paths });
const withFill = (paths: string[], fills: string[]): BadgeIconDef => ({ paths, fills });

// ---------------------------------------------------------------------------
// FIRSTS — one-time discovery badges
// ---------------------------------------------------------------------------

const firsts = {
  /** First Pedal — bicycle silhouette */
  first_ride: filled(
    [
      'M6 14 A4 4 0 1 0 6 22 A4 4 0 1 0 6 14 Z M6 16 A2 2 0 1 1 6 20 A2 2 0 1 1 6 16 Z', // rear wheel
      'M18 14 A4 4 0 1 0 18 22 A4 4 0 1 0 18 14 Z M18 16 A2 2 0 1 1 18 20 A2 2 0 1 1 18 16 Z', // front wheel
      'M10 8 L14 8 L15 6 L17 6 Z', // handlebars
    ],
    ['M6 18 L10 10 L14 18 L18 18', 'M10 10 L14 8'], // frame + stem
  ),
  /** Safety First — filled shield + checkmark cutout */
  first_safe_route: filled(
    ['M12 2 L4 6 L4 14 C4 19 12 22 12 22 C12 22 20 19 20 14 L20 6 Z'], // solid shield
    ['M9 12 L11 14 L15 10'], // checkmark accent
  ),
  /** Watchful Eye — filled eye shape */
  first_hazard: filled(
    [
      'M12 6 C6 6 2 12 2 12 C2 12 6 18 12 18 C18 18 22 12 22 12 C22 12 18 6 12 6 Z', // eye
      'M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9 Z', // iris
    ],
    ['M12 11 L12 11.5'], // pupil dot accent
  ),
  /** Open Road — solid paper airplane */
  first_share: filled(
    ['M22 2 L15 22 L11 13 L2 9 Z'],
    ['M22 2 L11 13'],
  ),
  /** Pit Stop Chat — solid speech bubble */
  first_comment: filled(
    ['M4 4 L20 4 Q21 4 21 5 L21 14 Q21 15 20 15 L13 15 L8 20 L8 15 L4 15 Q3 15 3 14 L3 5 Q3 4 4 4 Z'],
  ),
  /** Thumbs Up — solid heart */
  first_like: filled(
    ['M12 21 L3.16 12.95 A5.5 5.5 0 0 1 3.16 4.61 A5.5 5.5 0 0 1 12 4 A5.5 5.5 0 0 1 20.84 4.61 A5.5 5.5 0 0 1 20.84 12.95 Z'],
  ),
  /** Second Opinion — filled circle + check */
  first_validation: filled(
    ['M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z'], // ring
    ['M8 12 L11 15 L16 9'], // check
  ),
  /** Quick Study — solid lightbulb */
  first_quiz: filled(
    [
      'M12 2 A6 6 0 0 0 6 8 C6 12 9 14 9 16 L15 16 C15 14 18 12 18 8 A6 6 0 0 0 12 2 Z', // bulb
      'M9 18 L15 18 L15 20 Q15 22 12 22 Q9 22 9 20 Z', // base
    ],
  ),
  /** Waypoint Wanderer — line connecting 3 dots */
  first_multi_stop: filled(
    [
      'M4 16 A3 3 0 1 0 4 22 A3 3 0 1 0 4 16 Z', // dot 1
      'M12 4 A3 3 0 1 0 12 10 A3 3 0 1 0 12 4 Z', // dot 2
      'M20 14 A3 3 0 1 0 20 20 A3 3 0 1 0 20 14 Z', // dot 3
    ],
    ['M4 19 L12 7', 'M12 7 L20 17'], // connecting lines
  ),
  /** After Dark — solid crescent moon */
  first_night_ride: filled(
    ['M21 12.79 A9 9 0 1 1 11.21 3 A7 7 0 0 0 21 12.79 Z'],
    ['M17 4 L17.5 5 L18.5 5 L17.75 5.65 L18 6.7 L17 6.1 L16 6.7 L16.25 5.65 L15.5 5 L16.5 5 Z'], // star
  ),
  /** Rain Check Declined — solid cloud + drops */
  first_rain_ride: filled(
    ['M6 14 A4 4 0 0 1 6 6 C6 4 8 2 11 2 A6 6 0 0 1 18 6 A4 4 0 0 1 18 14 Z'], // cloud
    ['M8 17 L7 20', 'M12 17 L11 20', 'M16 17 L15 20'], // drops
  ),
  /** Double Digits — bold "10" */
  first_10km: filled(
    [
      'M4 5 L8 5 L8 19 L4 19 Z', // "1"
      'M12 5 Q20 5 20 12 Q20 19 12 19 Q10 19 10 12 Q10 5 12 5 Z M12 8 Q13 8 13 12 Q13 16 12 16 Q11 16 11 12 Q11 8 12 8 Z', // "0" with hole
    ],
  ),
  /** Seven Strong — solid calendar with checks */
  first_week_streak: filled(
    [
      'M4 4 L20 4 L20 20 L4 20 Z', // calendar body
      'M4 4 L20 4 L20 9 L4 9 Z', // header fill
    ],
    ['M8 4 L8 2', 'M16 4 L16 2', 'M7 13 L9 15 L11 12', 'M13 13 L15 15 L17 12'], // tabs + checks
  ),
} as const;

// ---------------------------------------------------------------------------
// RIDING — tiered families (distance, time, rides)
// ---------------------------------------------------------------------------

const riding = {
  /** Road Warrior — solid road perspective with center gap */
  road_warrior: filled(
    [
      'M8.5 3 L11 3 L11 21 L2 21 Z', // left road half
      'M13 3 L15.5 3 L22 21 L13 21 Z', // right road half
    ],
    ['M3 8 L6 10', 'M21 8 L18 10', 'M2.5 13 L5.5 14', 'M21.5 13 L18.5 14'], // speed lines
  ),
  /** Iron Legs — leg silhouette in cycling push */
  iron_legs: filled(
    [
      'M10 2 L14 2 Q16 2 16 4 L16 8 Q16 10 14 10 L13 10 L15 14 Q16 16 16 18 L16 22 L13 22 L13 18 L12 15 L11 18 L11 22 L8 22 L8 18 Q8 16 9 14 L11 10 L10 10 Q8 10 8 8 L8 4 Q8 2 10 2 Z', // leg silhouette
    ],
    ['M9 6 L15 6'], // shorts line accent
  ),
  /** Saddle Time — solid stopwatch */
  saddle_time: filled(
    [
      'M12 6 A8 8 0 1 0 12 22 A8 8 0 1 0 12 6 Z M12 9 A5 5 0 1 1 12 19 A5 5 0 1 1 12 9 Z', // watch ring
      'M10.5 2 L13.5 2 L13 5.5 L11 5.5 Z', // top button
      'M12 12 A1.2 1.2 0 1 0 12 14.4 A1.2 1.2 0 1 0 12 12 Z', // center hub
    ],
    ['M12 10 L12 12.5', 'M12.5 13 L15 15'], // hands
  ),
  /** Pedal Counter — bold tally bars */
  pedal_counter: filled(
    [
      'M3 5 L6 5 L6 19 L3 19 Z', // bar 1
      'M8 5 L11 5 L11 19 L8 19 Z', // bar 2
      'M13 5 L16 5 L16 19 L13 19 Z', // bar 3
      'M18 5 L21 5 L21 19 L18 19 Z', // bar 4
    ],
    ['M2 17 L22 7'], // cross slash
  ),
} as const;

// ---------------------------------------------------------------------------
// CONSISTENCY — streaks, patterns
// ---------------------------------------------------------------------------

const consistency = {
  /** Iron Streak — solid flame */
  iron_streak: filled(
    [
      'M12 2 C8 6 4 10 4 14 A8 8 0 0 0 20 14 C20 10 16 6 12 2 Z', // outer flame
      'M12 22 A4 4 0 0 1 8 18 C8 14 12 12 12 12 C12 12 16 14 16 18 A4 4 0 0 1 12 22 Z', // inner flame
    ],
  ),
  /** Weekend Warrior — solid calendar badge */
  weekend_warrior: filled(
    [
      'M4 4 L20 4 L20 20 L4 20 Z', // body
      'M4 4 L20 4 L20 9 L4 9 Z', // header
    ],
    ['M8 4 L8 2', 'M16 4 L16 2', 'M7 14 L10 14', 'M14 14 L17 14'], // tabs + day marks
  ),
  /** Early Bird — sunrise over horizon */
  early_bird: filled(
    [
      'M2 16 L22 16 L22 22 L2 22 Z', // ground
      'M12 16 A6 6 0 0 1 6 16 Z', // left half-sun
      'M12 16 A6 6 0 0 0 18 16 Z', // right half-sun
    ],
    ['M12 4 L12 7', 'M6 7 L8 9', 'M18 7 L16 9', 'M3 11 L5.5 12.5', 'M21 11 L18.5 12.5'], // rays
  ),
  /** Night Owl — stars in night sky */
  night_owl: filled(
    [
      // Large star
      'M12 2 L13.5 7.5 L19 7.5 L14.5 11 L16 17 L12 13.5 L8 17 L9.5 11 L5 7.5 L10.5 7.5 Z',
      // Small star top-right
      'M19 2 L19.8 4 L22 4 L20.2 5.3 L20.8 7.5 L19 6.2 L17.2 7.5 L17.8 5.3 L16 4 L18.2 4 Z',
    ],
    ['M4 14 L4.5 15.5 L6 15.5 L5 16.5 L5.5 18 L4 17 L2.5 18 L3 16.5 L2 15.5 L3.5 15.5 Z'], // small star accent
  ),
  /** Monthly Regular — solid calendar + star */
  monthly_regular: filled(
    [
      'M4 4 L20 4 L20 20 L4 20 Z', // body
      'M4 4 L20 4 L20 9 L4 9 Z', // header
      'M12 11.5 L13 14 L15.5 14 L13.75 15.5 L14.5 18 L12 16.5 L9.5 18 L10.25 15.5 L8.5 14 L11 14 Z', // star
    ],
    ['M8 4 L8 2', 'M16 4 L16 2'], // tabs
  ),
} as const;

// ---------------------------------------------------------------------------
// IMPACT — CO2, money, microlives, community
// ---------------------------------------------------------------------------

const impact = {
  /** Green Machine — bold leaf with stem + veins */
  green_machine: filled(
    [
      'M12 2 C6 2 2 8 2 14 C2 18 4 21 8 22 L12 22 L16 22 C20 21 22 18 22 14 C22 8 18 2 12 2 Z', // leaf body
    ],
    ['M12 6 L12 22', 'M12 10 L7 14', 'M12 13 L17 16', 'M12 16 L8 19'], // stem + veins
  ),
  /** Penny Wise — banknote / money */
  penny_wise: filled(
    [
      'M2 6 L22 6 L22 18 L2 18 Z', // banknote rectangle
      'M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9 Z', // center circle
    ],
    ['M5 6 L5 18', 'M19 6 L19 18'], // side borders
  ),
} as const;

// ---------------------------------------------------------------------------
// SAFETY — hazards, validation, quiz
// ---------------------------------------------------------------------------

const safety = {
  /** Road Guardian — solid shield + eye */
  road_guardian: filled(
    ['M12 2 L4 6 L4 14 C4 19 12 22 12 22 C12 22 20 19 20 14 L20 6 Z'], // shield
    ['M8 12 C8 12 10 9 12 9 C14 9 16 12 16 12 C16 12 14 15 12 15 C10 15 8 12 8 12 Z'], // eye
  ),
  /** Validator — solid badge circle + check */
  validator: filled(
    ['M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z'], // ring
    ['M8 12 L11 15 L16 9'], // check
  ),
  /** Crater Hunter — pothole / hole in ground */
  hazard_pothole: filled(
    [
      'M2 12 L22 12 L22 18 L2 18 Z', // ground surface
      'M7 12 C7 8 17 8 17 12 Z', // hole opening (concave dip)
    ],
    ['M9 15 A4 2 0 1 0 15 15', 'M8 15 A5 2.5 0 1 0 16 15'], // depth oval lines
  ),
  /** Lane Defender — solid car silhouette */
  hazard_parking: filled(
    [
      'M3 8 L3 16 L21 16 L21 8 Z', // car body
      'M6 16 A2 2 0 1 0 6 20 A2 2 0 1 0 6 16 Z', // wheel L
      'M18 16 A2 2 0 1 0 18 20 A2 2 0 1 0 18 16 Z', // wheel R
    ],
    ['M2 6 L22 6'], // lane line
  ),
  /** Hard Hat Spotter — car silhouette (parked in lane) */
  hazard_construction: filled(
    [
      'M4 10 L6 6 L18 6 L20 10 L21 10 L21 16 L3 16 L3 10 Z', // car body + windshield
      'M6 16 A2.5 2.5 0 1 0 6 21 A2.5 2.5 0 1 0 6 16 Z', // wheel L
      'M18 16 A2.5 2.5 0 1 0 18 21 A2.5 2.5 0 1 0 18 16 Z', // wheel R
    ],
    ['M8 6 L9 10', 'M16 6 L15 10'], // window dividers
  ),
  /** Junction Watcher — solid intersection cross */
  hazard_intersection: filled(
    ['M8 2 L16 2 L16 8 L22 8 L22 16 L16 16 L16 22 L8 22 L8 16 L2 16 L2 8 L8 8 Z'],
    ['M12 2 L12 22', 'M2 12 L22 12'], // center lines
  ),
  /** Hazard Encyclopedia — solid book + triangle */
  hazard_all_types: filled(
    [
      'M4 3 L20 3 L20 21 L8 21 C6 21 4 21 4 19 Z', // book
      'M8 3 L8 21', // spine (will be covered)
    ],
    ['M12 8 L10 14 L14 14 Z', 'M12 10 L12 12'], // hazard triangle
  ),
  /** Quiz Master — solid graduation cap */
  quiz_master: filled(
    [
      'M2 10 L12 4 L22 10 L12 16 Z', // cap top
      'M6 12 L6 17 L12 20 L18 17 L18 12 Z', // cap body
    ],
    ['M22 10 L22 16'], // tassel
  ),
  /** Sharp Mind — solid lightning bolt */
  quiz_perfect: filled(
    ['M13 2 L8 12 L12 12 L10 22 L18 10 L14 10 L16 2 Z'],
  ),
} as const;

// ---------------------------------------------------------------------------
// COMMUNITY — shares, likes, comments, protection
// ---------------------------------------------------------------------------

const community = {
  /** Social Cyclist — solid megaphone */
  social_cyclist: filled(
    [
      'M18 4 L8 8 L8 16 L18 20 Z', // horn
      'M4 8 L8 8 L8 16 L4 16 Z', // handle
    ],
    ['M8 16 L6 22'], // stand
  ),
  /** Cheerleader — solid party popper */
  cheerleader: filled(
    [
      'M2 22 L5 14 L10 19 Z', // cone base
    ],
    ['M8 8 L10 4', 'M8 8 L14 6', 'M8 8 L12 10', 'M14 14 L16 18', 'M18 8 L20 12', 'M16 4 L18 2'], // burst
  ),
  /** Commentator — message bubble */
  commentator: filled(
    [
      'M4 3 L20 3 Q22 3 22 5 L22 14 Q22 16 20 16 L10 16 L6 21 L6 16 L4 16 Q2 16 2 14 L2 5 Q2 3 4 3 Z', // speech bubble
    ],
    ['M6 7 L18 7', 'M6 10 L18 10', 'M6 13 L14 13'], // text lines
  ),
  /** Shield Bearer — solid shield + person */
  shield_bearer: filled(
    [
      'M12 2 L4 6 L4 14 C4 19 12 22 12 22 C12 22 20 19 20 14 L20 6 Z', // shield
      'M12 10 A2 2 0 1 0 12 6 A2 2 0 1 0 12 10 Z', // head
    ],
    ['M8 18 C8 14 16 14 16 18'], // body arc
  ),
} as const;

// ---------------------------------------------------------------------------
// EXPLORE — climbing, weather, athletic
// ---------------------------------------------------------------------------

const explore = {
  /** Mountain Goat — solid mountain peak */
  mountain_goat: filled(
    ['M2 20 L8 8 L12 14 L16 6 L22 20 Z'],
    ['M4 20 L22 20'], // ground line
  ),
  /** Skyward — solid upward arrow */
  skyward: filled(
    [
      'M7 10 L12 4 L17 10 Z', // arrowhead
      'M10 10 L14 10 L14 20 L10 20 Z', // shaft
    ],
    ['M4 16 L8 16', 'M16 16 L20 16'], // cloud lines
  ),
  /** Hill Demon — solid steep mountain */
  sprint_500m_climb: filled(
    ['M2 20 L12 4 L22 20 Z'],
    ['M7 12 L17 12', 'M5 16 L19 16'], // gradient lines
  ),
  /** Endurance — flexed muscle arm */
  endurance: filled(
    [
      'M6 20 L6 12 Q6 8 10 6 L12 5 Q14 5 15 7 L16 10 Q17 12 20 11 L20 14 Q16 15 14 13 L13 10 Q12 9 11 10 L10 12 L10 20 Z', // flexed arm silhouette
    ],
    ['M12 3 L13 2', 'M15 2 L15 3', 'M17 3 L16 4'], // effort lines above
  ),
  /** Boomerang — solid return arc */
  round_trip: filled(
    ['M12 4 C20 4 22 12 22 16 C22 20 18 22 14 20 L12 18 L10 20 C6 22 2 20 2 16 C2 12 4 4 12 4 Z'],
  ),
  /** Triple Tap — solid 3 map pins */
  multi_3stops: filled(
    [
      'M5 6 A3 3 0 1 1 5 12 L5 16 Z', // pin 1
      'M12 3 A3 3 0 1 1 12 9 L12 13 Z', // pin 2
      'M19 6 A3 3 0 1 1 19 12 L19 16 Z', // pin 3
    ],
    ['M5 13 L12 10', 'M12 10 L19 13'], // connecting lines
  ),
  /** Drizzle Drifter — solid rain cloud */
  drizzle_drifter: filled(
    ['M6 14 A4 4 0 0 1 6 6 C6 4 8 2 11 2 A6 6 0 0 1 18 6 A4 4 0 0 1 18 14 Z'],
    ['M9 17 L8 20', 'M13 17 L12 20', 'M17 17 L16 20'], // drops
  ),
  /** Storm Chaser — solid cloud + lightning */
  storm_chaser: filled(
    [
      'M6 12 A4 4 0 0 1 6 4 C6 2 8 1 11 1 A6 6 0 0 1 18 4 A4 4 0 0 1 18 12 Z', // cloud
      'M13 12 L10 17 L14 17 L11 22 Z', // lightning bolt (filled)
    ],
  ),
  /** Headwind Hero — solid wind lines */
  headwind_hero: filled(
    [
      'M3 6 L14 6 C18 6 18 10 14 10 L3 10 Z', // wind band 1
      'M3 12 L18 12 C22 12 22 16 18 16 L3 16 Z', // wind band 2
    ],
    ['M3 19 L10 19 C14 19 14 22 10 22 L3 22'], // wind 3 accent
  ),
  /** Frost Rider — solid snowflake */
  frost_rider: filled(
    [
      'M10 2 L14 2 L14 10 L22 10 L22 14 L14 14 L14 22 L10 22 L10 14 L2 14 L2 10 L10 10 Z', // cross shape
    ],
    ['M5 5 L10 10', 'M19 5 L14 10', 'M5 19 L10 14', 'M19 19 L14 14'], // diagonal branches
  ),
  /** Heatwave Hauler — solid sun */
  heatwave_hauler: filled(
    ['M12 6 A6 6 0 1 0 12 18 A6 6 0 1 0 12 6 Z'], // sun disc
    ['M12 2 L12 4', 'M12 20 L12 22', 'M4 12 L2 12', 'M22 12 L20 12', 'M6 6 L4.5 4.5', 'M18 6 L19.5 4.5', 'M6 18 L4.5 19.5', 'M18 18 L19.5 19.5'], // rays
  ),
  /** All-Weather Rider — solid cloud + sun peek */
  all_weather: filled(
    [
      'M6 12 A4 4 0 0 1 6 4 C6 2 8 1 11 1 A5 5 0 0 1 16 4 A3 3 0 0 1 18 10 L18 12 Z', // cloud
      'M20 5 A4 4 0 1 0 16 5', // sun arc peek
    ],
    ['M8 15 L7 18', 'M12 15 L11 18', 'M16 15 L15 18'], // drops
  ),
  /** Clean Air Chaser — solid lungs */
  good_air: filled(
    [
      'M12 8 C8 8 4 10 4 14 C4 18 8 20 12 14 Z', // left lung
      'M12 8 C16 8 20 10 20 14 C20 18 16 20 12 14 Z', // right lung
    ],
    ['M12 4 L12 14'], // trachea
  ),
  /** Air Aware — solid AQI gauge */
  aqi_aware: filled(
    [
      'M4 18 A10 10 0 0 1 20 18 L20 20 L4 20 Z', // gauge body
      'M12 18 L14 9 L12.5 9 Z', // needle (filled triangle)
    ],
  ),
} as const;

// ---------------------------------------------------------------------------
// EVENTS — seasonal, calendar, holidays
// ---------------------------------------------------------------------------

const events = {
  /** Fresh Start — solid sunrise */
  new_year: filled(
    [
      'M2 16 L22 16 L22 22 L2 22 Z', // ground
      'M6 16 A6 6 0 0 1 18 16 Z', // sun disc
    ],
    ['M12 4 L12 8', 'M8 6 L10 8', 'M16 6 L14 8'], // rays
  ),
  /** Love Cyclist — half full, half empty heart */
  valentine: filled(
    [
      'M12 6 C12 4 10 2 8 4 C6 6 6 9 12 15 Z', // left half filled
    ],
    ['M12 6 C12 4 14 2 16 4 C18 6 18 9 12 15'], // right half outline only
  ),
  /** Earth Rider — solid globe */
  earth_day: filled(
    ['M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z'], // ring
    ['M5 12 L19 12', 'M12 5 C9 8 9 16 12 19', 'M12 5 C15 8 15 16 12 19'], // meridians
  ),
  /** World Bike Day — solid bicycle */
  bike_day: filled(
    [
      'M5 10 A3 3 0 1 0 5 16 A3 3 0 1 0 5 10 Z', // rear wheel
      'M19 10 A3 3 0 1 0 19 16 A3 3 0 1 0 19 10 Z', // front wheel
    ],
    ['M5 13 L10 8 L14 13 L19 13', 'M10 8 L12 4'], // frame
  ),
  /** Longest Ride Day — solid sun at zenith */
  summer_solstice: filled(
    [
      'M12 4 A4 4 0 1 0 12 12 A4 4 0 1 0 12 4 Z', // sun
      'M2 16 L22 16 L22 20 L2 20 Z', // ground
    ],
    ['M12 2 L12 0', 'M18 4 L20 2', 'M20 10 L22 10', 'M4 10 L2 10', 'M6 4 L4 2'], // rays
  ),
  /** Ghost Rider — solid ghost */
  halloween: filled(
    ['M6 22 L6 10 A6 6 0 0 1 18 10 L18 22 L16 19 L14 22 L12 19 L10 22 L8 19 Z'],
    ['M9 12 L9 14', 'M15 12 L15 14'], // eyes
  ),
  /** Santa's Shortcut — solid gift box */
  christmas: filled(
    [
      'M3 10 L21 10 L21 21 L3 21 Z', // box
      'M3 7 L21 7 L21 10 L3 10 Z', // lid
    ],
    ['M12 7 L12 21', 'M3 14 L21 14', 'M9 7 C9 4 12 3 12 7', 'M15 7 C15 4 12 3 12 7'], // ribbon + bow
  ),
  /** Darkest Day Rider — solid crescent over horizon */
  winter_solstice: filled(
    [
      'M2 18 L22 18 L22 22 L2 22 Z', // ground
      'M16 12 A6 6 0 1 1 8 8 A4 4 0 0 0 16 12 Z', // crescent
    ],
  ),
  /** Spring Bloom — solid flower */
  spring_bloom: filled(
    [
      'M12 8 A3 3 0 0 1 12 2 A3 3 0 0 1 18 8 A3 3 0 0 1 12 14 A3 3 0 0 1 6 8 A3 3 0 0 1 12 8 Z', // petals
    ],
    ['M12 14 L12 22', 'M9 17 L6 20', 'M15 17 L18 20'], // stem + leaves
  ),
  /** Summer Blaze — solid double flame */
  summer_blaze: filled(
    [
      'M12 2 C8 6 6 12 6 16 A6 6 0 0 0 18 16 C18 12 16 6 12 2 Z', // outer
      'M12 8 C10 10 9 14 9 16 A3 3 0 0 0 15 16 C15 14 14 10 12 8 Z', // inner
    ],
  ),
  /** Autumn Leaf — solid maple leaf */
  autumn_leaf: filled(
    ['M12 2 L14 7 L20 7 L16 11 L18 17 L12 14 L6 17 L8 11 L4 7 L10 7 Z'],
    ['M12 14 L12 22'], // stem
  ),
  /** Winter Steel — solid snowflake cross */
  winter_steel: filled(
    ['M10 2 L14 2 L14 10 L22 10 L22 14 L14 14 L14 22 L10 22 L10 14 L2 14 L2 10 L10 10 Z'],
    ['M5 5 L10 10', 'M19 5 L14 10', 'M5 19 L10 14', 'M19 19 L14 14'], // branches
  ),
  /** Four Seasons — solid quartered circle */
  four_seasons: filled(
    ['M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z'], // ring
    ['M12 2 L12 22', 'M2 12 L22 12'], // dividers
  ),
} as const;

// ---------------------------------------------------------------------------
// SECRET — hidden badges
// ---------------------------------------------------------------------------

const secret = {
  /** Mirror Ride — solid mirror frame */
  mirror_distance: filled(
    [
      'M3 3 L21 3 L21 21 L3 21 Z M5 5 L19 5 L19 19 L5 19 Z', // frame
    ],
    ['M12 5 L12 19', 'M5 12 L19 12'], // reflection lines
  ),
  /** Lunatic — solid full moon */
  full_moon: filled(
    ['M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z'],
    ['M10 8 A2 2 0 1 0 10 10', 'M15 12 A1.5 1.5 0 1 0 15 15', 'M8 16 A1 1 0 1 0 8 18'], // craters
  ),
  /** Cinderella — solid clock at midnight */
  midnight: filled(
    [
      'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z', // ring
    ],
    ['M12 7 L12 12', 'M12 12 L12 8', 'M12 4 L12 3'], // hands + 12 marker
  ),
  /** Lucky Rider — solid four-leaf clover */
  friday_13: filled(
    [
      'M12 12 C12 8 8 4 12 4 C16 4 12 8 12 12 Z', // top
      'M12 12 C16 12 20 8 20 12 C20 16 16 12 12 12 Z', // right
      'M12 12 C12 16 16 20 12 20 C8 20 12 16 12 12 Z', // bottom
      'M12 12 C8 12 4 16 4 12 C4 8 8 12 12 12 Z', // left
    ],
    ['M12 12 L12 22'], // stem
  ),
  /** Leap Rider — solid frog silhouette */
  leap_day: filled(
    ['M4 18 C4 12 8 8 12 8 C16 8 20 12 20 18 L16 18 L18 22 L15 18 L9 18 L6 22 L8 18 Z'], // body + legs
    ['M9 11 L9 10', 'M15 11 L15 10'], // eyes
  ),
  /** Irrational Rider — solid pi symbol */
  pi_day: filled(
    [
      'M4 6 L20 6 L20 10 L18 10 L18 10 L18 6 L18 10 Z', // dummy connector
      'M4 6 L20 6 L20 10 L4 10 Z', // top bar
      'M6 10 L10 10 L10 20 L6 20 Z', // left leg
      'M14 10 L18 10 L16 20 L12 20 Z', // right leg
    ],
  ),
  /** Creature of Habit — solid loop arrows */
  same_origin_dest_7: filled(
    [
      'M17 2 L21 6 L17 10 Z', // arrow R
      'M7 14 L3 18 L7 22 Z', // arrow L
    ],
    ['M21 6 L8 6 A5 5 0 0 0 3 11', 'M3 18 L16 18 A5 5 0 0 0 21 13'], // arcs
  ),
  /** Ghost Rider (zero risk) — solid safe shield */
  zero_risk: filled(
    ['M12 2 L4 6 L4 14 C4 19 12 22 12 22 C12 22 20 19 20 14 L20 6 Z'],
    ['M8 11 L16 11', 'M8 14 L16 14'], // dashes
  ),
  /** Numberphile — solid hash sign */
  round_number: filled(
    [
      'M4 8 L20 8 L20 10 L4 10 Z', // horiz 1
      'M4 14 L20 14 L20 16 L4 16 Z', // horiz 2
      'M9 4 L7 20 L9 20 L11 4 Z', // vert 1
      'M15 4 L13 20 L15 20 L17 4 Z', // vert 2
    ],
  ),
  /** Before the World Wakes — solid alarm clock */
  five_am: filled(
    [
      'M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 Z M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8 Z', // clock ring
    ],
    ['M12 10 L12 12 L15 14', 'M4 6 L7 3', 'M20 6 L17 3', 'M12 2 L12 3'], // hands + bells
  ),
  /** Festive Pedals — solid flag */
  holiday_rider: filled(
    [
      'M4 4 L20 4 L16 9 L20 14 L4 14 Z', // flag
      'M4 2 L4 22 L6 22 L6 2 Z', // pole
    ],
    ['M8 7 L8 11', 'M12 7 L12 11'], // stripes
  ),
} as const;

// ---------------------------------------------------------------------------
// Master icon registry
// ---------------------------------------------------------------------------

export const badgeIconPaths: Record<string, BadgeIconDef> = {
  // Firsts
  ...firsts,

  // Riding families
  ...riding,

  // Consistency families
  ...consistency,

  // Impact families
  ...impact,

  // Safety families + specialists
  ...safety,

  // Community families
  ...community,

  // Explore families + weather + athletic
  ...explore,

  // Events
  ...events,

  // Secret
  ...secret,

  // Alias shortcuts — tiered badges share parent family icon
  // (The BadgeIcon component resolves tier_family -> icon key)
} as const;

/**
 * Look up icon data for a badge. Falls back to tier_family if badge_key not found directly.
 * Returns undefined if no icon exists (caller should render a "?" placeholder).
 */
export function getBadgeIcon(
  badgeKey: string,
  tierFamily?: string | null,
): BadgeIconDef | undefined {
  return badgeIconPaths[badgeKey] ?? (tierFamily ? badgeIconPaths[tierFamily] : undefined);
}
