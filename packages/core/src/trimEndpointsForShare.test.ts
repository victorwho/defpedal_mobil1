/**
 * Tests for `trimEndpointsForShare` — the slice-6 wrapper around
 * `trimPrivacyZone` that takes the `hideEndpoints` boolean from the
 * share sheet + the 400m short-route safeguard + the full-length metadata
 * the web viewer needs ("First and last 200m hidden for privacy" hint).
 */
import { describe, it, expect } from 'vitest';

import { decodePolyline, encodePolyline } from './polyline';
import { trimEndpointsForShare } from './trimEndpointsForShare';

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * ~2.2km straight-line polyline from Bucharest centre heading north.
 * Each step ≈ 110m, so 20 points is ~2.2km. Plenty of room to trim 200m
 * off each end and still have a visible middle.
 */
const longRouteCoords: [number, number][] = Array.from({ length: 20 }, (_, i) => [
  26.1025,
  44.4268 + i * 0.001,
]);
const longRoutePolyline = encodePolyline(longRouteCoords);

/** ~300m polyline — below the 400m safeguard so trimming must be a no-op. */
const shortRouteCoords: [number, number][] = Array.from({ length: 4 }, (_, i) => [
  26.1025,
  44.4268 + i * 0.001,
]);
const shortRoutePolyline = encodePolyline(shortRouteCoords);

describe('trimEndpointsForShare', () => {
  describe('hideEndpoints=false branch', () => {
    it('returns the original polyline verbatim', () => {
      const result = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: false,
      });
      expect(result.polyline).toBe(longRoutePolyline);
      expect(result.endpointsHidden).toBe(false);
    });

    it('still reports the original length (so the web viewer knows not to render the privacy hint)', () => {
      const result = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: false,
      });
      expect(result.fullLengthMeters).toBeGreaterThan(2000);
      expect(result.fullLengthMeters).toBeLessThan(2500);
    });
  });

  describe('hideEndpoints=true branch, long route', () => {
    it('trims 200m off each end by default', () => {
      const result = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
      });
      // The polyline changed.
      expect(result.polyline).not.toBe(longRoutePolyline);
      expect(result.endpointsHidden).toBe(true);

      // Decode and verify the new endpoints are ~200m in from the originals.
      const decoded = decodePolyline(result.polyline);
      expect(decoded.length).toBeGreaterThan(2);
      const firstLat = decoded[0][1];
      const originalFirstLat = longRouteCoords[0][1];
      const lastLat = decoded[decoded.length - 1][1];
      const originalLastLat = longRouteCoords[longRouteCoords.length - 1][1];
      // 200m @ ~44° lat ≈ 0.0018° — cut should be at least that far in.
      expect(firstLat - originalFirstLat).toBeGreaterThan(0.0015);
      expect(originalLastLat - lastLat).toBeGreaterThan(0.0015);
    });

    it('reports the full pre-trim length, not the trimmed length', () => {
      const result = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
      });
      expect(result.fullLengthMeters).toBeGreaterThan(2000);
    });

    it('accepts an explicit trimMeters override', () => {
      const trimmedDefault = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
      });
      const trimmed500 = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
        trimMeters: 500,
      });
      const decodedDefault = decodePolyline(trimmedDefault.polyline);
      const decoded500 = decodePolyline(trimmed500.polyline);
      // 500m trim leaves fewer kept vertices than 200m trim.
      expect(decoded500.length).toBeLessThan(decodedDefault.length);
    });
  });

  describe('short-route safeguard', () => {
    it('returns the polyline unchanged when length < 2 × trimMeters', () => {
      const result = trimEndpointsForShare(shortRoutePolyline, {
        hideEndpoints: true,
      });
      expect(result.polyline).toBe(shortRoutePolyline);
      // `endpointsHidden: false` on the fallback — the client signal is
      // "you asked to hide, but the route is too short, so we didn't".
      // The web viewer uses this to suppress the privacy hint when no trim
      // actually happened.
      expect(result.endpointsHidden).toBe(false);
    });

    it('flags `shortRouteFallback: true` so the UI can disable the toggle', () => {
      const result = trimEndpointsForShare(shortRoutePolyline, {
        hideEndpoints: true,
      });
      expect(result.shortRouteFallback).toBe(true);
    });

    it('does NOT flag shortRouteFallback on a long route', () => {
      const result = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
      });
      expect(result.shortRouteFallback).toBe(false);
    });

    it('also skips fallback logic when hideEndpoints=false (not asked to trim)', () => {
      const result = trimEndpointsForShare(shortRoutePolyline, {
        hideEndpoints: false,
      });
      expect(result.shortRouteFallback).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('trimming a trimmed polyline does not over-trim', () => {
      const once = trimEndpointsForShare(longRoutePolyline, {
        hideEndpoints: true,
      });
      const twice = trimEndpointsForShare(once.polyline, {
        hideEndpoints: true,
      });

      const onceDecoded = decodePolyline(once.polyline);
      const twiceDecoded = decodePolyline(twice.polyline);
      // Double-trimmed is shorter but by a reasonable amount — NOT zero
      // points and NOT the whole middle gone. The safeguard (400m min)
      // kicks in naturally if the once-trimmed is below 400m.
      expect(twiceDecoded.length).toBeGreaterThan(0);
      // First vertex of the double-trimmed is further from the original
      // than the once-trimmed (we cut 200m more off the front).
      expect(twiceDecoded[0][1]).toBeGreaterThanOrEqual(onceDecoded[0][1]);
    });
  });

  describe('edge cases', () => {
    it('handles empty polyline string', () => {
      const result = trimEndpointsForShare('', { hideEndpoints: true });
      expect(result.polyline).toBe('');
      expect(result.endpointsHidden).toBe(false);
      expect(result.fullLengthMeters).toBe(0);
    });
  });
});
