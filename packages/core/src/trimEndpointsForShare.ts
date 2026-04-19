/**
 * trimEndpointsForShare — slice 6 wrapper around `trimPrivacyZone`.
 *
 * Consumes the `hideEndpoints` boolean from the share sheet and the
 * 400m short-route safeguard from the PRD, and returns a structured
 * result the mobile share preview and the web viewer both use.
 *
 *   - hideEndpoints=false       → polyline unchanged, endpointsHidden=false
 *   - long route + hideEndpoints→ trim 200m off each end, endpointsHidden=true
 *   - short route (< 2 × trim)  → polyline unchanged + shortRouteFallback=true
 *                                 so the UI can disable the toggle and the web
 *                                 viewer can suppress the "hidden for privacy"
 *                                 hint (nothing was actually hidden).
 *
 * The underlying polyline math lives once in `trimPrivacyZone` from
 * sharePrivacy.ts — this wrapper only adds the boolean branching,
 * metadata fields, and a clean empty-string handler so the server-side
 * createShare flow doesn't need to special-case.
 */
import { polylineSegmentDistance } from './distance';
import { decodePolyline, encodePolyline } from './polyline';
import { trimPrivacyZone } from './sharePrivacy';

export interface TrimEndpointsOptions {
  /** Toggle value from the share sheet. */
  readonly hideEndpoints: boolean;
  /**
   * Meters to trim off each end when hideEndpoints=true. Defaults to 200
   * (PRD value). Overriding is useful in tests and for future per-user
   * privacy tiers (e.g. 500m for high-sensitivity accounts).
   */
  readonly trimMeters?: number;
}

export interface TrimEndpointsResult {
  /** The polyline the web viewer should render. */
  readonly polyline: string;
  /** True when the polyline in `polyline` is actually trimmed. */
  readonly endpointsHidden: boolean;
  /**
   * True when the caller asked to hide endpoints but the route was too
   * short (length < 2 × trimMeters) so trimming would leave nothing
   * visible. Mobile UI reads this to disable the toggle; web viewer
   * reads this to suppress the privacy hint.
   */
  readonly shortRouteFallback: boolean;
  /**
   * Full pre-trim polyline length in meters. Stored on route_shares and
   * surfaced in `RouteSharePublicView.fullLengthMeters` so the web viewer
   * can show an accurate "X km route" figure even when the rendered
   * polyline is shorter.
   */
  readonly fullLengthMeters: number;
}

const DEFAULT_TRIM_METERS = 200;

export function trimEndpointsForShare(
  polyline: string,
  options: TrimEndpointsOptions,
): TrimEndpointsResult {
  if (!polyline) {
    return {
      polyline: '',
      endpointsHidden: false,
      shortRouteFallback: false,
      fullLengthMeters: 0,
    };
  }

  const coords = decodePolyline(polyline) as [number, number][];
  const fullLengthMeters =
    coords.length < 2
      ? 0
      : polylineSegmentDistance(coords, 0, coords.length - 1);

  const trimMeters = options.trimMeters ?? DEFAULT_TRIM_METERS;

  if (!options.hideEndpoints) {
    return {
      polyline,
      endpointsHidden: false,
      shortRouteFallback: false,
      fullLengthMeters,
    };
  }

  // Short-route safeguard: trimming 200m off each end of a <400m route
  // would leave the public view with either an empty polyline or a tiny
  // visible segment that doesn't meaningfully protect privacy anyway.
  // Surface the fallback flag so the UI can communicate this clearly.
  if (fullLengthMeters < trimMeters * 2) {
    return {
      polyline,
      endpointsHidden: false,
      shortRouteFallback: true,
      fullLengthMeters,
    };
  }

  const trimmedCoords = trimPrivacyZone(coords, trimMeters);
  const trimmedPolyline = encodePolyline(trimmedCoords);

  return {
    polyline: trimmedPolyline,
    endpointsHidden: true,
    shortRouteFallback: false,
    fullLengthMeters,
  };
}
