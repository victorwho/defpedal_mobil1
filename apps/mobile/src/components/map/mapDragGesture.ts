/**
 * Detects a rider moving the map by hand during navigation, from raw touches.
 *
 * Why not `Camera.onUserTrackingModeChange`: on the bridgeless preview build it
 * never reached JS when the rider panned (device report, preview 0.2.182), so
 * the recenter button could not tell that follow had been broken. Touches are
 * dispatched to JS for every view, including the native map, so this works
 * regardless of what the map library reports.
 */

/**
 * How far (dp) one finger must travel before a touch counts as moving the
 * map. A tap wobbles a few dp; anything past this is a drag.
 */
export const MAP_DRAG_THRESHOLD_DP = 10;

export type TouchPoint = { readonly x: number; readonly y: number };

/**
 * True when the gesture is a map move: a second finger (pinch / rotate / tilt)
 * or one finger that travelled past the threshold from where it went down.
 */
export const isMapDragGesture = (
  start: TouchPoint | null,
  current: TouchPoint,
  touchCount: number,
): boolean => {
  if (touchCount > 1) return true;
  if (!start) return false;
  return Math.hypot(current.x - start.x, current.y - start.y) > MAP_DRAG_THRESHOLD_DP;
};
