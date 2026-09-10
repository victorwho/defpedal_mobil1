import { describe, expect, it } from 'vitest';

import {
  cameraStopKey,
  DEFAULT_FOCUS_ZOOM,
  DEFAULT_OVERVIEW_ZOOM,
  resolveCameraStop,
} from '../cameraStop';

const CENTRE = [26.1025, 44.4268] as const;
const BOX = { ne: [26.15, 44.47] as const, sw: [26.05, 44.38] as const };

describe('resolveCameraStop', () => {
  it('fits the box when one is given', () => {
    const stop = resolveCameraStop({ focusBounds: BOX, cameraCoordinate: CENTRE });
    expect(stop.kind).toBe('bounds');
    if (stop.kind !== 'bounds') throw new Error('unreachable');
    // [lon, lat] — turf's order, which is what makeLatLngBounds builds points from.
    expect(stop.bounds.ne).toEqual([26.15, 44.47]);
    expect(stop.bounds.sw).toEqual([26.05, 44.38]);
  });

  /**
   * The whole reason the box exists. A loop planner that also names a focus
   * point must still get the box, or it is back to a point-and-zoom that
   * cannot know the viewport.
   */
  it('prefers the box over a focus point when both are set', () => {
    const stop = resolveCameraStop({
      focusBounds: BOX,
      focusCoordinate: { lat: 44.4268, lon: 26.1025 },
      focusZoomLevel: 14,
      cameraCoordinate: CENTRE,
    });
    expect(stop.kind).toBe('bounds');
  });

  it('carries padding through, defaulting each side to zero', () => {
    const stop = resolveCameraStop({
      focusBounds: BOX,
      focusBoundsPadding: { top: 96, bottom: 168 },
      cameraCoordinate: CENTRE,
    });
    if (stop.kind !== 'bounds') throw new Error('expected bounds');
    expect(stop.padding).toEqual({
      paddingTop: 96,
      paddingBottom: 168,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  /**
   * Mapbox answers a zero-area box by zooming all the way in — the exact
   * opposite of what a caller asking to frame an extent wants.
   */
  it('ignores a box with no area rather than zooming to the floor', () => {
    for (const degenerate of [
      { ne: [26.1, 44.4] as const, sw: [26.1, 44.4] as const },
      { ne: [26.1, 44.47] as const, sw: [26.1, 44.38] as const },
      { ne: [26.15, 44.4] as const, sw: [26.05, 44.4] as const },
    ]) {
      const stop = resolveCameraStop({
        focusBounds: degenerate,
        cameraCoordinate: CENTRE,
      });
      expect(stop.kind).toBe('point');
    }
  });

  it('falls back to the focus point, at its own zoom when it names one', () => {
    const stop = resolveCameraStop({
      focusBounds: null,
      focusCoordinate: { lat: 44.4268, lon: 26.1025 },
      focusZoomLevel: 13.25,
      cameraCoordinate: CENTRE,
    });
    expect(stop).toMatchObject({ kind: 'point', zoomLevel: 13.25 });
  });

  it('uses the focus default zoom when the point names none', () => {
    const stop = resolveCameraStop({
      focusCoordinate: { lat: 1, lon: 2 },
      cameraCoordinate: CENTRE,
    });
    expect(stop).toMatchObject({ kind: 'point', zoomLevel: DEFAULT_FOCUS_ZOOM });
  });

  it('uses the overview zoom when nothing is focused', () => {
    const stop = resolveCameraStop({ cameraCoordinate: CENTRE });
    expect(stop).toMatchObject({
      kind: 'point',
      zoomLevel: DEFAULT_OVERVIEW_ZOOM,
      centerCoordinate: [26.1025, 44.4268],
    });
  });
});

describe('cameraStopKey', () => {
  it('changes when the box changes, so the camera re-fits', () => {
    const a = cameraStopKey(
      resolveCameraStop({ focusBounds: BOX, cameraCoordinate: CENTRE }),
    );
    const b = cameraStopKey(
      resolveCameraStop({
        focusBounds: { ne: [26.3, 44.6] as const, sw: [25.9, 44.25] as const },
        cameraCoordinate: CENTRE,
      }),
    );
    expect(a).not.toEqual(b);
  });

  it('is stable for the same box', () => {
    const of = () =>
      cameraStopKey(resolveCameraStop({ focusBounds: BOX, cameraCoordinate: CENTRE }));
    expect(of()).toEqual(of());
  });

  it('separates a box from a point', () => {
    expect(
      cameraStopKey(resolveCameraStop({ focusBounds: BOX, cameraCoordinate: CENTRE })),
    ).not.toEqual(cameraStopKey(resolveCameraStop({ cameraCoordinate: CENTRE })));
  });
});
