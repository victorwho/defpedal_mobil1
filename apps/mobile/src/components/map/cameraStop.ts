/**
 * Which camera stop `RouteMap` should hand Mapbox.
 *
 * Pure and separate from the component for one reason: `@rnmapbox/maps` is
 * Flow-typed and cannot be imported under vitest, so nothing that lives inside
 * `RouteMap.tsx` can be tested at all. The camera has three distinct framings
 * and picking the wrong one is invisible — a map that is merely mis-framed
 * still renders, still passes typecheck, and still shows real roads. The loop
 * planner shipped a wrongly-framed camera for exactly that reason.
 *
 * Same idiom as `resolveDragTarget`: extract the decision, test the decision.
 */

/** Zoom used when focused on a point that did not name its own zoom. */
export const DEFAULT_FOCUS_ZOOM = 15.5;

/** Zoom used when nothing is focused and the map is showing an overview. */
export const DEFAULT_OVERVIEW_ZOOM = 12.5;

export type CameraBox = {
  readonly ne: readonly [number, number];
  readonly sw: readonly [number, number];
};

export type CameraPaddingInput = {
  readonly top?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
};

export type CameraStop =
  | {
      readonly kind: 'bounds';
      readonly bounds: { readonly ne: [number, number]; readonly sw: [number, number] };
      readonly padding: {
        readonly paddingTop: number;
        readonly paddingBottom: number;
        readonly paddingLeft: number;
        readonly paddingRight: number;
      };
    }
  | {
      readonly kind: 'point';
      readonly zoomLevel: number;
      readonly centerCoordinate: [number, number];
    };

/**
 * A box with no area is not a framing instruction — Mapbox answers it by
 * zooming as far in as it will go, which is the opposite of what every caller
 * asking for a box wants. Treated as "no box given" so the point framing runs.
 */
const hasArea = (box: CameraBox): boolean =>
  box.ne[0] !== box.sw[0] && box.ne[1] !== box.sw[1];

export const resolveCameraStop = ({
  focusBounds,
  focusBoundsPadding,
  focusCoordinate,
  focusZoomLevel,
  cameraCoordinate,
}: {
  readonly focusBounds?: CameraBox | null;
  readonly focusBoundsPadding?: CameraPaddingInput;
  readonly focusCoordinate?: unknown;
  readonly focusZoomLevel?: number;
  readonly cameraCoordinate: readonly [number, number];
}): CameraStop => {
  if (focusBounds && hasArea(focusBounds)) {
    return {
      kind: 'bounds',
      bounds: {
        ne: [focusBounds.ne[0], focusBounds.ne[1]],
        sw: [focusBounds.sw[0], focusBounds.sw[1]],
      },
      padding: {
        paddingTop: focusBoundsPadding?.top ?? 0,
        paddingBottom: focusBoundsPadding?.bottom ?? 0,
        paddingLeft: focusBoundsPadding?.left ?? 0,
        paddingRight: focusBoundsPadding?.right ?? 0,
      },
    };
  }

  return {
    kind: 'point',
    zoomLevel: focusCoordinate
      ? (focusZoomLevel ?? DEFAULT_FOCUS_ZOOM)
      : DEFAULT_OVERVIEW_ZOOM,
    centerCoordinate: [cameraCoordinate[0], cameraCoordinate[1]],
  };
};

/**
 * Signature for the camera's React `key`.
 *
 * The camera is keyed rather than reactive, so anything that should re-fly has
 * to change this. A box that changes on its own — the rider picking a different
 * loop distance — must re-fit even though `focusKey` did not move.
 */
export const cameraStopKey = (stop: CameraStop): string =>
  stop.kind === 'bounds'
    ? `b${stop.bounds.ne[0].toFixed(4)},${stop.bounds.ne[1].toFixed(4)},${stop.bounds.sw[0].toFixed(4)},${stop.bounds.sw[1].toFixed(4)}`
    : `p${stop.centerCoordinate[0].toFixed(4)},${stop.centerCoordinate[1].toFixed(4)},${stop.zoomLevel}`;
