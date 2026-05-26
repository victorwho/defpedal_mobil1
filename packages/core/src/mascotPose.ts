/**
 * Pedal mascot pose contract — single source of truth shared between
 * the server (cron picks a pose per nudge) and mobile (resolves to an
 * actual PNG via the design-system token map at
 * `apps/mobile/src/design-system/tokens/mascotPoses.ts`).
 *
 * Keep this union in sync with the mobile token file. If a new pose is
 * added on mobile, list it here too so server-side nudge poses are
 * type-checked against valid options at compile time.
 */

export type MascotPose =
  | 'stand'
  | 'wave'
  | 'point'
  | 'map'
  | 'binoculars'
  | 'trapeze'
  | 'sticker'
  | 'ride'
  | 'ride-point'
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
  | 'high-five'
  | 'podium'   // streak-tier-only — currently maps to `trophy` on mobile until art ships
  | 'legend';  // streak-tier-only — currently maps to `excited` on mobile until art ships
