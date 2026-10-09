import { describe, expect, it } from 'vitest';

import { isMapDragGesture, MAP_DRAG_THRESHOLD_DP } from './mapDragGesture';

describe('isMapDragGesture', () => {
  const start = { x: 100, y: 200 };

  it('ignores a tap that wobbles a few dp', () => {
    expect(isMapDragGesture(start, { x: 104, y: 203 }, 1)).toBe(false);
  });

  it('flags one finger moving past the threshold', () => {
    expect(isMapDragGesture(start, { x: 100, y: 200 + MAP_DRAG_THRESHOLD_DP + 1 }, 1)).toBe(true);
  });

  it('flags a second finger immediately (pinch, rotate, tilt)', () => {
    expect(isMapDragGesture(start, start, 2)).toBe(true);
  });

  it('does nothing without a recorded start point', () => {
    expect(isMapDragGesture(null, { x: 500, y: 500 }, 1)).toBe(false);
  });
});
