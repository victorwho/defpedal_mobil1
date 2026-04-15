import type { MiaPersona, RiskSegment } from '@defensivepedal/core';
import { haversineDistance } from '@defensivepedal/core';
import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentBannerState {
  readonly type: 'entry' | 'exit' | null;
  readonly streetName: string;
  readonly hasBikeLane: boolean;
}

const NULL_BANNER: SegmentBannerState = {
  type: null,
  streetName: '',
  hasBikeLane: false,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Distance in meters within which we consider the rider "entering" a segment */
const ENTRY_RADIUS_M = 200;

/** Distance in meters beyond segment end to consider "exited" */
const EXIT_RADIUS_M = 50;

/** Risk score threshold — segments below this are considered moderate */
const MODERATE_RISK_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the first coordinate from a RiskSegment geometry. */
function getSegmentStart(seg: RiskSegment): [number, number] | null {
  const geom = seg.geometry;
  if (geom.type === 'LineString' && geom.coordinates.length > 0) {
    const [lon, lat] = geom.coordinates[0];
    return [lat, lon];
  }
  if (geom.type === 'MultiLineString' && geom.coordinates.length > 0 && geom.coordinates[0].length > 0) {
    const [lon, lat] = geom.coordinates[0][0];
    return [lat, lon];
  }
  return null;
}

/** Extract the last coordinate from a RiskSegment geometry. */
function getSegmentEnd(seg: RiskSegment): [number, number] | null {
  const geom = seg.geometry;
  if (geom.type === 'LineString' && geom.coordinates.length > 0) {
    const last = geom.coordinates[geom.coordinates.length - 1];
    return [last[1], last[0]];
  }
  if (geom.type === 'MultiLineString' && geom.coordinates.length > 0) {
    const lastLine = geom.coordinates[geom.coordinates.length - 1];
    if (lastLine.length > 0) {
      const last = lastLine[lastLine.length - 1];
      return [last[1], last[0]];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Detects when a Mia user enters or exits moderate risk segments during
 * navigation. Shows contextual banners to help build confidence.
 *
 * Only active for persona === 'mia' and miaLevel <= 3.
 */
export function useMiaSegmentBanners(
  riskSegments: readonly RiskSegment[],
  currentPosition: { lat: number; lon: number } | null,
  persona: MiaPersona,
  miaLevel: number,
): SegmentBannerState {
  const [banner, setBanner] = useState<SegmentBannerState>(NULL_BANNER);
  const announcedEntryRef = useRef<Set<string>>(new Set());
  const announcedExitRef = useRef<Set<string>>(new Set());

  // CRITICAL (error-log #23): Clear refs on unmount so a new navigation
  // session starts with a clean slate.
  useEffect(() => {
    return () => {
      announcedEntryRef.current.clear();
      announcedExitRef.current.clear();
    };
  }, []);

  useEffect(() => {
    // Only for Mia persona at levels 1-3
    if (persona !== 'mia' || miaLevel > 3) {
      if (banner.type !== null) setBanner(NULL_BANNER);
      return;
    }

    if (!currentPosition) return;

    const pos: [number, number] = [currentPosition.lat, currentPosition.lon];

    // Filter to moderate risk segments
    const moderateSegments = riskSegments.filter(
      (seg) => seg.riskScore < MODERATE_RISK_THRESHOLD,
    );

    // Check for exit first (higher priority — clear a banner after passing)
    for (const seg of moderateSegments) {
      if (announcedExitRef.current.has(seg.id)) continue;
      if (!announcedEntryRef.current.has(seg.id)) continue; // only exit if we entered

      const segEnd = getSegmentEnd(seg);
      if (!segEnd) continue;

      const distToEnd = haversineDistance(pos, segEnd);
      if (distToEnd < EXIT_RADIUS_M) {
        announcedExitRef.current.add(seg.id);
        setBanner({
          type: 'exit',
          streetName: '', // street name not available in RiskSegment
          hasBikeLane: false,
        });
        return;
      }
    }

    // Check for entry
    for (const seg of moderateSegments) {
      if (announcedEntryRef.current.has(seg.id)) continue;

      const segStart = getSegmentStart(seg);
      if (!segStart) continue;

      const distToStart = haversineDistance(pos, segStart);
      if (distToStart < ENTRY_RADIUS_M) {
        announcedEntryRef.current.add(seg.id);
        setBanner({
          type: 'entry',
          streetName: '', // street name not available in RiskSegment
          hasBikeLane: false,
        });
        return;
      }
    }
  }, [currentPosition, riskSegments, persona, miaLevel, banner.type]);

  return banner;
}
