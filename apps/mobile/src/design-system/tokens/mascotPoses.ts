/**
 * Pedal — mascot pose tokens.
 *
 * Single source of truth mapping pose name → asset + recommended aspect ratio.
 * Add a new pose by:
 *   1. dropping the PNG in apps/mobile/assets/mascot/
 *   2. adding it to MascotPose union and the mascotPoses record below.
 *
 * All assets ship as PNG-24 RGBA at 1080×1350 (or 1755×2194 for a few not yet
 * resized). aspectRatio is width/height so the layout reserves the right
 * footprint before the image decodes.
 */

export type MascotPose =
  // Core 9
  | 'stand'
  | 'wave'
  | 'point'
  | 'map'
  | 'binoculars'
  | 'trapeze'
  | 'sticker'
  | 'ride'
  | 'ride-point'
  // Wishlist additions (2026-05-11)
  | 'sleep'
  | 'sad'
  | 'trophy'
  | 'rain'
  | 'lock'
  | 'climb'
  | 'phone'
  | 'study'
  | 'cheer'
  | 'excited'
  | 'high-five';

export interface MascotPoseAsset {
  /** require()'d PNG */
  source: number;
  /** width / height — used to reserve layout space before image loads */
  aspectRatio: number;
}

// Every pose currently ships at 4:5 portrait (1080×1350 or 1755×2194 — same ratio).
const PORTRAIT = 0.80;

export const mascotPoses: Record<MascotPose, MascotPoseAsset> = {
  // Core 9
  stand:        { source: require('../../../assets/mascot/pedal-eyes-closed.png'), aspectRatio: PORTRAIT },
  wave:         { source: require('../../../assets/mascot/pedal-wave.png'),        aspectRatio: PORTRAIT },
  point:        { source: require('../../../assets/mascot/pedal-point.png'),       aspectRatio: PORTRAIT },
  map:          { source: require('../../../assets/mascot/pedal-map.png'),         aspectRatio: PORTRAIT },
  binoculars:   { source: require('../../../assets/mascot/pedal-binoculars.png'),  aspectRatio: PORTRAIT },
  trapeze:      { source: require('../../../assets/mascot/pedal-trapeze.png'),     aspectRatio: PORTRAIT },
  sticker:      { source: require('../../../assets/mascot/pedal-sticker.png'),     aspectRatio: PORTRAIT },
  ride:         { source: require('../../../assets/mascot/pedal-red-bike.png'),    aspectRatio: PORTRAIT },
  'ride-point': { source: require('../../../assets/mascot/pedal-bike-point.png'),  aspectRatio: PORTRAIT },
  // Wishlist
  sleep:        { source: require('../../../assets/mascot/pedal-sleep.png'),       aspectRatio: PORTRAIT },
  sad:          { source: require('../../../assets/mascot/pedal-sad.png'),         aspectRatio: PORTRAIT },
  trophy:       { source: require('../../../assets/mascot/pedal-trophy.png'),      aspectRatio: PORTRAIT },
  rain:         { source: require('../../../assets/mascot/pedal-rain.png'),        aspectRatio: PORTRAIT },
  lock:         { source: require('../../../assets/mascot/pedal-lock.png'),        aspectRatio: PORTRAIT },
  climb:        { source: require('../../../assets/mascot/pedal-climb.png'),       aspectRatio: PORTRAIT },
  phone:        { source: require('../../../assets/mascot/pedal-phone.png'),       aspectRatio: PORTRAIT },
  study:        { source: require('../../../assets/mascot/pedal-study.png'),       aspectRatio: PORTRAIT },
  cheer:        { source: require('../../../assets/mascot/pedal-cheer.png'),       aspectRatio: PORTRAIT },
  excited:      { source: require('../../../assets/mascot/pedal-excited.png'),     aspectRatio: PORTRAIT },
  'high-five':  { source: require('../../../assets/mascot/pedal-high-five.png'),   aspectRatio: PORTRAIT },
};

/** Standard render sizes (logical px / dp). Width-driven; height derived from aspectRatio. */
export const mascotSizes = {
  xs:   48,
  sm:   80,
  md:   120,
  lg:   180,
  hero: 240,
} as const;

export type MascotSize = keyof typeof mascotSizes;
