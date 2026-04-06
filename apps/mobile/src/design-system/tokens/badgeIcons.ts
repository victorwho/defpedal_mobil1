/**
 * Badge Icon Paths — SVG path data for every badge icon.
 *
 * All paths fit a 24x24 viewBox. Render with:
 *   stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none"
 *
 * Tiered badge families share one icon across all tiers.
 * One-time badges each have a unique icon.
 *
 * Convention: icon keys match badge_key or tier_family from badge_definitions.
 */

export interface BadgeIconDef {
  /** SVG path data (d attribute). Array = multiple paths. */
  readonly paths: readonly string[];
  /** Optional filled circle/shape (for badges that need a small fill accent) */
  readonly fills?: readonly string[];
}

// ---------------------------------------------------------------------------
// Helper: shorthand for single-path icons
// ---------------------------------------------------------------------------
const icon = (path: string): BadgeIconDef => ({ paths: [path] });
const multi = (...paths: string[]): BadgeIconDef => ({ paths });
const withFill = (paths: string[], fills: string[]): BadgeIconDef => ({ paths, fills });

// ---------------------------------------------------------------------------
// FIRSTS — one-time discovery badges
// ---------------------------------------------------------------------------

const firsts = {
  /** First Pedal — single pedal crank */
  first_ride: multi(
    'M12 5 L12 19',                              // crank arm
    'M12 19 A3 3 0 1 0 12 13',                   // pedal circle
    'M8 5 L16 5',                                // top bar
    'M12 5 A5 5 0 0 1 17 10',                    // chainring arc
  ),
  /** Safety First — shield + checkmark */
  first_safe_route: multi(
    'M12 3 L4 7 L4 13 C4 18 12 21 12 21 C12 21 20 18 20 13 L20 7 Z', // shield
    'M9 12 L11 14 L15 10',                                             // checkmark
  ),
  /** Watchful Eye — eye + exclamation */
  first_hazard: multi(
    'M2 12 C2 12 6 6 12 6 C18 6 22 12 22 12 C22 12 18 18 12 18 C6 18 2 12 2 12 Z', // eye outer
    'M12 14 L12 10',   // exclamation line
    'M12 16 L12 16.5', // exclamation dot
  ),
  /** Open Road — paper airplane */
  first_share: icon('M22 2 L15 22 L11 13 L2 9 Z M22 2 L11 13'),
  /** Pit Stop Chat — speech bubble */
  first_comment: multi(
    'M21 11.5 A8.38 8.38 0 0 1 19 16.5 L12 21 L12 16.5 A8.5 8.5 0 1 1 21 11.5 Z',
  ),
  /** Thumbs Up — heart */
  first_like: icon(
    'M20.84 4.61 A5.5 5.5 0 0 0 12 4 A5.5 5.5 0 0 0 3.16 4.61 A5.5 5.5 0 0 0 3.16 12.95 L12 21 L20.84 12.95 A5.5 5.5 0 0 0 20.84 4.61 Z',
  ),
  /** Second Opinion — double checkmarks */
  first_validation: multi(
    'M2 12 L6 16 L14 8', // first check
    'M8 12 L12 16 L22 6', // second check offset
  ),
  /** Quick Study — lightbulb */
  first_quiz: multi(
    'M12 2 A6 6 0 0 0 9 16 L9 19 L15 19 L15 16 A6 6 0 0 0 12 2 Z', // bulb
    'M9 21 L15 21', // base line 1
    'M10 23 L14 23', // base line 2
  ),
  /** Waypoint Wanderer — connected dots */
  first_multi_stop: withFill(
    ['M4 8 L12 4 L20 8 L16 16 L8 16 Z'], // connecting path
    ['M12 4 A1.5 1.5 0 1 0 12 7 A1.5 1.5 0 1 0 12 4 Z',   // dot 1
     'M4 8 A1.5 1.5 0 1 0 4 11 A1.5 1.5 0 1 0 4 8 Z',     // dot 2
     'M20 8 A1.5 1.5 0 1 0 20 11 A1.5 1.5 0 1 0 20 8 Z'], // dot 3
  ),
  /** After Dark — moon + stars */
  first_night_ride: multi(
    'M21 12.79 A9 9 0 1 1 11.21 3 A7 7 0 0 0 21 12.79 Z', // crescent moon
    'M17 4 L17.5 5 L18.5 5 L17.75 5.65 L18 6.7 L17 6.1 L16 6.7 L16.25 5.65 L15.5 5 L16.5 5 Z', // star
  ),
  /** Rain Check Declined — cloud + drops */
  first_rain_ride: multi(
    'M6 16 A4 4 0 0 1 6 8 A6 6 0 0 1 18 8 A4 4 0 0 1 18 16 Z', // cloud
    'M8 19 L7 22',  // drop 1
    'M12 19 L11 22', // drop 2
    'M16 19 L15 22', // drop 3
  ),
  /** Double Digits — odometer "10" */
  first_10km: multi(
    'M3 6 L3 18',                 // "1" stroke
    'M7 6 L7 18',                 // "1" base
    'M11 6 A5 5 0 0 1 11 18 A5 5 0 0 1 11 6 Z', // "0" left
    'M14 6 L22 6 L22 18 L14 18 Z', // "0" box
  ),
  /** Seven Strong — calendar with checks */
  first_week_streak: multi(
    'M4 4 L20 4 L20 20 L4 20 Z', // calendar frame
    'M4 9 L20 9',                 // header line
    'M8 4 L8 2',                  // tab left
    'M16 4 L16 2',                // tab right
    'M7 13 L9 15 L11 12',         // check 1
    'M13 13 L15 15 L17 12',       // check 2
  ),
} as const;

// ---------------------------------------------------------------------------
// RIDING — tiered families (distance, time, rides)
// ---------------------------------------------------------------------------

const riding = {
  /** Road Warrior — road vanishing to horizon */
  road_warrior: multi(
    'M2 20 L10 4 L14 4 L22 20', // road trapezoid
    'M12 8 L12 20',              // center line
  ),
  /** Iron Legs — flexed leg/calf */
  iron_legs: multi(
    'M8 4 L8 10 L12 14 L12 20', // leg line
    'M8 10 C10 10 12 12 12 14', // calf curve
    'M10 20 L14 20',             // foot
  ),
  /** Saddle Time — clock */
  saddle_time: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // clock circle
    'M12 6 L12 12 L16 14',                             // hands
  ),
  /** Pedal Counter — tally marks */
  pedal_counter: multi(
    'M5 6 L5 18',  // tally 1
    'M9 6 L9 18',  // tally 2
    'M13 6 L13 18', // tally 3
    'M17 6 L17 18', // tally 4
    'M3 14 L19 8',  // cross slash
  ),
} as const;

// ---------------------------------------------------------------------------
// CONSISTENCY — streaks, patterns
// ---------------------------------------------------------------------------

const consistency = {
  /** Iron Streak — flame */
  iron_streak: icon(
    'M12 2 C8 6 4 10 4 14 A8 8 0 0 0 20 14 C20 10 16 6 12 2 Z M12 22 A4 4 0 0 1 8 18 C8 14 12 12 12 12 C12 12 16 14 16 18 A4 4 0 0 1 12 22 Z',
  ),
  /** Weekend Warrior — Sat/Sun calendar badge */
  weekend_warrior: multi(
    'M4 4 L20 4 L20 20 L4 20 Z', // frame
    'M4 9 L20 9',                 // header
    'M8 4 L8 2',                  // tab
    'M16 4 L16 2',                // tab
    'M7 14 L10 14',               // "Sa"
    'M14 14 L17 14',              // "Su"
  ),
  /** Early Bird — sunrise */
  early_bird: multi(
    'M2 18 L22 18',                        // horizon
    'M12 14 A4 4 0 0 1 4 18',             // sun arc left
    'M12 14 A4 4 0 0 0 20 18',            // sun arc right
    'M12 8 L12 6',                         // ray top
    'M7.5 9.5 L6 8',                       // ray left
    'M16.5 9.5 L18 8',                     // ray right
  ),
  /** Night Owl — owl face */
  night_owl: multi(
    'M5 8 A4 4 0 0 1 12 6 A4 4 0 0 1 19 8 L19 16 A2 2 0 0 1 17 18 L7 18 A2 2 0 0 1 5 16 Z', // head
    'M8 11 A2 2 0 1 0 8 15 A2 2 0 1 0 8 11 Z',   // left eye
    'M16 11 A2 2 0 1 0 16 15 A2 2 0 1 0 16 11 Z', // right eye
    'M11 15 L12 17 L13 15',                         // beak
  ),
  /** Monthly Regular — calendar with star */
  monthly_regular: multi(
    'M4 4 L20 4 L20 20 L4 20 Z',
    'M4 9 L20 9',
    'M12 12 L13 14.5 L15.5 14.5 L13.75 16 L14.5 18.5 L12 17 L9.5 18.5 L10.25 16 L8.5 14.5 L11 14.5 Z', // star
  ),
} as const;

// ---------------------------------------------------------------------------
// IMPACT — CO2, money, microlives, community
// ---------------------------------------------------------------------------

const impact = {
  /** Green Machine — leaf */
  green_machine: icon(
    'M17 3 C12 3 3 7 3 15 L3 21 C9 21 14 17 17 12 C14 14 10 15 7 15 C7 12 8 8 12 5 C14 5 16 5 17 3 Z',
  ),
  /** Penny Wise — coin / euro sign */
  penny_wise: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // coin circle
    'M15 8 C14 7 13 6.5 12 6.5 A3.5 3.5 0 0 0 12 17.5 C13 17.5 14 17 15 16', // euro curve
    'M9 11 L15 11',  // euro line 1
    'M9 13 L15 13',  // euro line 2
  ),
} as const;

// ---------------------------------------------------------------------------
// SAFETY — hazards, validation, quiz
// ---------------------------------------------------------------------------

const safety = {
  /** Road Guardian — shield with eye */
  road_guardian: multi(
    'M12 3 L4 7 L4 13 C4 18 12 21 12 21 C12 21 20 18 20 13 L20 7 Z', // shield
    'M8 12 C8 12 10 9 12 9 C14 9 16 12 16 12 C16 12 14 15 12 15 C10 15 8 12 8 12 Z', // eye
  ),
  /** Validator — verified double-check */
  validator: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // circle
    'M8 12 L11 15 L16 9',                             // check inside
  ),
  /** Crater Hunter — road with hole */
  hazard_pothole: multi(
    'M2 16 L8 16 C9 12 15 12 16 16 L22 16', // road with dip
    'M12 14 A3 2 0 1 0 12 10',               // pothole oval
    'M2 20 L22 20',                           // road bottom
  ),
  /** Lane Defender — car in bike lane */
  hazard_parking: multi(
    'M3 8 L3 16 L21 16 L21 8 Z', // car body
    'M6 16 A2 2 0 1 0 6 20',     // wheel left
    'M18 16 A2 2 0 1 0 18 20',   // wheel right
    'M2 6 L22 6',                 // bike lane line
    'M12 2 L12 6',                // lane divider
  ),
  /** Hard Hat Spotter — construction cone */
  hazard_construction: multi(
    'M12 3 L7 20 L17 20 Z', // cone triangle
    'M8.5 11 L15.5 11',     // stripe 1
    'M7.5 16 L16.5 16',     // stripe 2
  ),
  /** Junction Watcher — intersection cross */
  hazard_intersection: multi(
    'M8 2 L16 2 L16 8 L22 8 L22 16 L16 16 L16 22 L8 22 L8 16 L2 16 L2 8 L8 8 Z', // + shape
    'M12 2 L12 22',  // vert center
    'M2 12 L22 12',  // horiz center
  ),
  /** Hazard Encyclopedia — book with hazard symbol */
  hazard_all_types: multi(
    'M4 3 L4 19 C4 21 6 21 8 21 L20 21 L20 3 L8 3 C6 3 4 3 4 5',  // book
    'M8 3 L8 21',                                                     // spine
    'M12 8 L10 14 L14 14 Z',                                         // triangle
    'M12 10 L12 12',                                                   // excl line
  ),
  /** Quiz Master — brain / graduation cap */
  quiz_master: multi(
    'M2 10 L12 4 L22 10 L12 16 Z',  // cap top
    'M6 12 L6 17 L12 20 L18 17 L18 12', // cap sides
    'M22 10 L22 16',                 // tassel
  ),
  /** Sharp Mind — lightning in head */
  quiz_perfect: multi(
    'M13 2 L8 12 L12 12 L10 22 L18 10 L14 10 L16 2 Z', // lightning bolt
  ),
} as const;

// ---------------------------------------------------------------------------
// COMMUNITY — shares, likes, comments, protection
// ---------------------------------------------------------------------------

const community = {
  /** Social Cyclist — megaphone */
  social_cyclist: multi(
    'M18 4 L8 8 L8 16 L18 20 Z', // horn
    'M4 8 L8 8 L8 16 L4 16 Z',   // handle
    'M8 16 L6 22',                 // stand
  ),
  /** Cheerleader — party popper / clap */
  cheerleader: multi(
    'M2 22 L8 8',    // stick
    'M8 8 L10 4',    // burst 1
    'M8 8 L14 6',    // burst 2
    'M8 8 L12 10',   // burst 3
    'M14 14 L16 18', // confetti 1
    'M18 8 L20 12',  // confetti 2
    'M16 4 L18 2',   // confetti 3
  ),
  /** Commentator — quote marks */
  commentator: multi(
    'M4 10 C4 6 8 4 10 4 L10 8 C8 8 6 10 6 12 L4 12 Z',       // left quote
    'M14 10 C14 6 18 4 20 4 L20 8 C18 8 16 10 16 12 L14 12 Z', // right quote
    'M6 16 L18 16', // underline 1
    'M6 19 L14 19', // underline 2
  ),
  /** Shield Bearer — shield with person */
  shield_bearer: multi(
    'M12 3 L4 7 L4 13 C4 18 12 21 12 21 C12 21 20 18 20 13 L20 7 Z', // shield
    'M12 10 A2 2 0 1 0 12 6 A2 2 0 1 0 12 10 Z',                      // head
    'M8 18 C8 14 16 14 16 18',                                          // body
  ),
} as const;

// ---------------------------------------------------------------------------
// EXPLORE — climbing, weather, athletic
// ---------------------------------------------------------------------------

const explore = {
  /** Mountain Goat — mountain peak */
  mountain_goat: multi(
    'M2 20 L8 8 L12 14 L16 6 L22 20 Z', // double peak
  ),
  /** Skyward — arrow pointing up through clouds */
  skyward: multi(
    'M12 20 L12 4',     // shaft
    'M7 9 L12 4 L17 9', // arrowhead
    'M4 16 L8 16',      // cloud left
    'M16 16 L20 16',    // cloud right
  ),
  /** Hill Demon — steep incline */
  sprint_500m_climb: multi(
    'M2 20 L12 4 L22 20', // steep triangle
    'M7 12 L17 12',       // gradient line
    'M5 16 L19 16',       // gradient line 2
  ),
  /** Endurance — infinity / long road */
  endurance: multi(
    'M8 12 C8 8 4 8 4 12 C4 16 8 16 12 12 C16 8 20 8 20 12 C20 16 16 16 12 12 Z', // infinity
  ),
  /** Boomerang — return arc */
  round_trip: multi(
    'M12 4 C20 4 22 12 22 16 C22 20 18 22 14 20 L12 18 L10 20 C6 22 2 20 2 16 C2 12 4 4 12 4 Z', // boomerang
  ),
  /** Triple Tap — 3 map pins */
  multi_3stops: withFill(
    ['M5 10 L12 5 L19 10'], // connecting line
    [
      'M5 10 A2.5 2.5 0 1 0 5 15 L5 18 L5 15 A2.5 2.5 0 1 0 5 10 Z',  // pin 1
      'M12 5 A2.5 2.5 0 1 0 12 10 L12 13 L12 10 A2.5 2.5 0 1 0 12 5 Z', // pin 2
      'M19 10 A2.5 2.5 0 1 0 19 15 L19 18 L19 15 A2.5 2.5 0 1 0 19 10 Z', // pin 3
    ],
  ),
  /** Drizzle Drifter — rain cloud */
  drizzle_drifter: multi(
    'M6 14 A4 4 0 0 1 6 6 A6 6 0 0 1 18 6 A4 4 0 0 1 18 14 Z', // cloud
    'M9 17 L8 20',
    'M13 17 L12 20',
    'M17 17 L16 20',
  ),
  /** Storm Chaser — lightning cloud */
  storm_chaser: multi(
    'M6 12 A4 4 0 0 1 6 4 A6 6 0 0 1 18 4 A4 4 0 0 1 18 12 Z', // cloud
    'M13 12 L10 17 L14 17 L11 22',                                 // lightning
  ),
  /** Headwind Hero — wind lines */
  headwind_hero: multi(
    'M3 8 L14 8 C18 8 18 4 14 4',     // wind curve 1
    'M3 12 L18 12 C22 12 22 16 18 16', // wind curve 2
    'M3 16 L10 16 C14 16 14 20 10 20', // wind curve 3
  ),
  /** Frost Rider — snowflake */
  frost_rider: multi(
    'M12 2 L12 22',   // vert
    'M2 12 L22 12',   // horiz
    'M5 5 L19 19',    // diag 1
    'M19 5 L5 19',    // diag 2
    'M12 6 L10 4',    // branch
    'M12 6 L14 4',
    'M18 12 L20 10',
    'M18 12 L20 14',
  ),
  /** Heatwave Hauler — sun with heat lines */
  heatwave_hauler: multi(
    'M12 6 A6 6 0 1 0 12 18 A6 6 0 1 0 12 6 Z', // sun
    'M12 2 L12 4',   // ray
    'M12 20 L12 22',
    'M4 12 L2 12',
    'M22 12 L20 12',
    'M6 6 L4.5 4.5',
    'M18 6 L19.5 4.5',
    'M6 18 L4.5 19.5',
    'M18 18 L19.5 19.5',
  ),
  /** All-Weather Rider — sun + cloud + rain combined */
  all_weather: multi(
    'M6 10 A4 4 0 0 1 6 4 A5 5 0 0 1 16 5 A3 3 0 0 1 18 10 Z', // cloud
    'M20 5 A4 4 0 1 0 16 5',                                       // sun peek
    'M8 13 L7 16',
    'M12 13 L11 16',
    'M16 13 L15 16',
    'M18 2 L18 3',   // sun ray
    'M22 6 L21 6',
  ),
  /** Clean Air Chaser — lungs / breeze */
  good_air: multi(
    'M12 4 L12 14',                                            // trachea
    'M12 8 C8 8 4 10 4 14 C4 18 8 20 12 14',                 // left lung
    'M12 8 C16 8 20 10 20 14 C20 18 16 20 12 14',            // right lung
  ),
  /** Air Aware — AQI meter */
  aqi_aware: multi(
    'M4 18 A10 10 0 0 1 20 18', // gauge arc
    'M12 18 L14 10',             // needle
    'M10 18 L14 18',             // base
  ),
} as const;

// ---------------------------------------------------------------------------
// EVENTS — seasonal, calendar, holidays
// ---------------------------------------------------------------------------

const events = {
  /** Fresh Start — sunrise with "1" */
  new_year: multi(
    'M2 18 L22 18',       // horizon
    'M12 12 A6 6 0 0 1 6 18', // sun arc
    'M12 12 A6 6 0 0 0 18 18',
    'M12 4 L12 8',         // ray
    'M8 6 L10 8',
    'M16 6 L14 8',
  ),
  /** Love Cyclist — bike wheel + heart */
  valentine: multi(
    'M12 7 C12 5 10 3 8 5 C6 7 8 10 12 14 C16 10 18 7 16 5 C14 3 12 5 12 7 Z', // heart
    'M4 18 A4 4 0 1 0 4 22',  // wheel hint
    'M20 18 A4 4 0 1 0 20 22',
  ),
  /** Earth Rider — globe */
  earth_day: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // circle
    'M2 12 L22 12',   // equator
    'M12 2 C8 6 8 18 12 22', // meridian left
    'M12 2 C16 6 16 18 12 22', // meridian right
  ),
  /** World Bike Day — bicycle */
  bike_day: multi(
    'M5 16 A3 3 0 1 0 5 10 A3 3 0 1 0 5 16 Z',    // rear wheel
    'M19 16 A3 3 0 1 0 19 10 A3 3 0 1 0 19 16 Z',  // front wheel
    'M5 13 L10 8 L14 13 L19 13',                     // frame
    'M10 8 L12 4',                                    // handlebars
  ),
  /** Longest Ride Day — sun at zenith */
  summer_solstice: multi(
    'M12 4 A4 4 0 1 0 12 12 A4 4 0 1 0 12 4 Z', // sun
    'M12 2 L12 0',
    'M18 4 L20 2',
    'M20 10 L22 10',
    'M4 10 L2 10',
    'M6 4 L4 2',
    'M2 16 L22 16',   // horizon
    'M4 19 L6 19',     // ground
    'M10 19 L14 19',
    'M18 19 L20 19',
  ),
  /** Ghost Rider — ghost */
  halloween: multi(
    'M6 22 L6 10 A6 6 0 0 1 18 10 L18 22 L16 19 L14 22 L12 19 L10 22 L8 19 Z', // ghost body
    'M9 11 L9 13',   // eye left
    'M15 11 L15 13', // eye right
  ),
  /** Santa's Shortcut — gift box */
  christmas: multi(
    'M3 10 L21 10 L21 21 L3 21 Z', // box
    'M3 7 L21 7 L21 10 L3 10 Z',   // lid
    'M12 7 L12 21',                  // ribbon vert
    'M3 14 L21 14',                  // ribbon horiz
    'M9 7 C9 4 12 3 12 7',          // bow left
    'M15 7 C15 4 12 3 12 7',        // bow right
  ),
  /** Darkest Day Rider — moon over horizon */
  winter_solstice: multi(
    'M2 18 L22 18',                                              // horizon
    'M16 12 A6 6 0 1 1 8 8 A4 4 0 0 0 16 12 Z',               // crescent
    'M6 20 L8 20', 'M11 20 L13 20', 'M16 20 L18 20',           // ground
  ),
  /** Spring Bloom — flower */
  spring_bloom: multi(
    'M12 22 L12 12',                                   // stem
    'M12 12 A3 3 0 0 1 12 6 A3 3 0 0 1 18 12 A3 3 0 0 1 12 18 A3 3 0 0 1 6 12 A3 3 0 0 1 12 6', // petals
    'M9 16 L6 20',  // leaf left
    'M15 16 L18 20', // leaf right
  ),
  /** Summer Blaze — flames / heat */
  summer_blaze: multi(
    'M12 2 C8 6 6 12 6 16 A6 6 0 0 0 18 16 C18 12 16 6 12 2 Z', // outer flame
    'M12 8 C10 10 9 14 9 16 A3 3 0 0 0 15 16 C15 14 14 10 12 8 Z', // inner
  ),
  /** Autumn Leaf — maple leaf */
  autumn_leaf: icon(
    'M12 2 L14 7 L20 7 L16 11 L18 17 L12 14 L6 17 L8 11 L4 7 L10 7 Z M12 14 L12 22',
  ),
  /** Winter Steel — snowflake + steel */
  winter_steel: multi(
    'M12 2 L12 22',
    'M4 7 L20 17',
    'M20 7 L4 17',
    'M12 6 L10 4', 'M12 6 L14 4',
    'M12 18 L10 20', 'M12 18 L14 20',
    'M8 9 L6 7', 'M16 9 L18 7',
    'M8 15 L6 17', 'M16 15 L18 17',
  ),
  /** Four Seasons — quartered circle */
  four_seasons: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // circle
    'M12 2 L12 22',  // vert divide
    'M2 12 L22 12',  // horiz divide
    'M8 7 L8 8',     // spring dot
    'M16 7 L17 6',   // summer ray
    'M16 16 L17 17', // autumn leaf hint
    'M7 16 L8 15',   // winter flake hint
  ),
} as const;

// ---------------------------------------------------------------------------
// SECRET — hidden badges
// ---------------------------------------------------------------------------

const secret = {
  /** Mirror Ride — mirrored digits */
  mirror_distance: multi(
    'M4 4 L4 20',        // mirror left
    'M20 4 L20 20',      // mirror right
    'M9 8 L9 16',        // digit left
    'M15 8 L15 16',      // digit right
    'M4 12 L20 12',      // reflection line
  ),
  /** Lunatic — full moon */
  full_moon: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // full circle
    'M10 8 A2 2 0 1 0 10 10',                          // crater 1
    'M15 12 A1.5 1.5 0 1 0 15 15',                     // crater 2
    'M8 16 A1 1 0 1 0 8 18',                            // crater 3
  ),
  /** Cinderella — clock at midnight */
  midnight: multi(
    'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z', // clock
    'M12 6 L12 12',                                     // minute hand (12)
    'M12 12 L12 8',                                     // hour hand (12)
    'M12 4 L12 3',                                      // 12 marker
  ),
  /** Lucky Rider — four-leaf clover */
  friday_13: multi(
    'M12 12 C12 8 8 4 12 4 C16 4 12 8 12 12', // top
    'M12 12 C16 12 20 8 20 12 C20 16 16 12 12 12', // right
    'M12 12 C12 16 16 20 12 20 C8 20 12 16 12 12', // bottom
    'M12 12 C8 12 4 16 4 12 C4 8 8 12 12 12',     // left
    'M12 12 L12 22', // stem
  ),
  /** Leap Rider — frog jumping */
  leap_day: multi(
    'M4 18 C4 12 8 8 12 8 C16 8 20 12 20 18', // body arc
    'M8 12 L6 8',   // front leg
    'M16 12 L18 8', // front leg
    'M8 18 L4 22',  // back leg
    'M16 18 L20 22', // back leg
    'M9 11 L9 10',   // eye left
    'M15 11 L15 10', // eye right
  ),
  /** Irrational Rider — pi symbol */
  pi_day: multi(
    'M4 8 L20 8',           // top bar
    'M8 8 L8 20',           // left leg
    'M16 8 C16 14 14 20 12 20', // right leg (curved)
  ),
  /** Creature of Habit — loop / repeat */
  same_origin_dest_7: multi(
    'M17 2 L21 6 L17 10',     // arrow right
    'M21 6 L8 6 A5 5 0 0 0 3 11', // top arc
    'M7 22 L3 18 L7 14',       // arrow left
    'M3 18 L16 18 A5 5 0 0 0 21 13', // bottom arc
  ),
  /** Ghost Rider (zero risk) — stealth / invisible */
  zero_risk: multi(
    'M12 3 L4 7 L4 13 C4 18 12 21 12 21 C12 21 20 18 20 13 L20 7 Z', // shield outline
    'M8 11 L16 11',  // dash 1
    'M8 14 L16 14',  // dash 2 (empty = safe)
  ),
  /** Numberphile — hash / number sign */
  round_number: multi(
    'M4 9 L20 9',    // horiz 1
    'M4 15 L20 15',  // horiz 2
    'M10 4 L8 20',   // vert 1 (slanted)
    'M16 4 L14 20',  // vert 2 (slanted)
  ),
  /** Before the World Wakes — alarm clock */
  five_am: multi(
    'M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 Z', // clock face
    'M12 8 L12 12 L15 14',                         // hands
    'M4 6 L7 3',                                    // bell left
    'M20 6 L17 3',                                  // bell right
    'M12 2 L12 3',                                  // top button
  ),
  /** Festive Pedals — party flag / banner */
  holiday_rider: multi(
    'M4 2 L4 22',                       // pole
    'M4 4 L20 4 L16 9 L20 14 L4 14',  // flag
    'M8 7 L8 11',                       // stripe 1
    'M12 7 L12 11',                     // stripe 2
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
