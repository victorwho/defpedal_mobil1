/**
 * useMapA11ySummary — derives a screen-reader-friendly textual description
 * of a map's current state.
 *
 * Mapbox `SymbolLayer` / `CircleLayer` content is rendered natively and is
 * invisible to TalkBack / VoiceOver. This hook (paired with
 * `ScreenReaderMapSummary`) exposes a parallel text representation so
 * assistive tech can announce what's on the map.
 *
 * Two outputs:
 *  - `label`: always-current static description for `accessibilityLabel`.
 *  - `liveRegionText`: transient string that fires a `polite` announcement
 *    only on meaningful transitions (hazard entering proximity, off-route
 *    state change). Memoized via a key-based dedup ref so the same hazard
 *    isn't announced repeatedly on 1 Hz GPS ticks.
 */
import type { HazardType, RouteOption } from '@defensivepedal/core';
import { formatDistance, formatDuration } from '@defensivepedal/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../hooks/useTranslation';
import { computeRiskDistribution } from '@defensivepedal/core';

export type MapSummaryMode = 'planning' | 'navigating' | 'historical' | 'feed' | 'empty';

export interface MapA11yInput {
  /** Which surface this map is rendered in. Drives which fields are used. */
  mode: MapSummaryMode;
  /** The currently selected route, if any. Used for distance / duration / climb / risk mix. */
  selectedRoute?: RouteOption | null;
  /** How many reported hazards are relevant to this route/view. */
  hazardsOnRoute?: number;
  /** The single hazard approaching the user within announcement range, if any. */
  nearestApproachingHazard?: {
    id: string;
    hazardType: HazardType;
    distanceMeters: number;
  } | null;
  /** True when navigation has lost track of the route polyline. */
  isOffRoute?: boolean;
  /** Remaining distance during navigation (meters). */
  remainingDistanceMeters?: number;
  /** True when user's GPS location is being shown on the map. */
  userLocationKnown?: boolean;
  /**
   * When an assertive live-region (e.g. HazardAlert) is already announcing
   * the upcoming hazard, pass `true` to suppress the polite duplicate.
   */
  suppressHazardLive?: boolean;
  /**
   * Distance threshold for a hazard to be considered "approaching" and
   * therefore worth an announcement. Defaults to 200 m.
   */
  hazardAnnouncementRadiusMeters?: number;
}

export interface MapA11yOutput {
  /** Full static description suitable for `accessibilityLabel`. */
  label: string;
  /**
   * Set to a non-null string *only* on state transitions. Components should
   * pass this into an element that also carries
   * `accessibilityLiveRegion="polite"` so TalkBack / VoiceOver pick it up.
   */
  liveRegionText: string | null;
}

/**
 * Build the full static label describing the map.
 */
const buildLabel = (
  t: (key: string, vars?: Record<string, string | number>) => string,
  input: MapA11yInput,
): string => {
  const parts: string[] = [];

  if (input.mode === 'empty' || !input.selectedRoute) {
    parts.push(t('mapA11y.empty'));
    if (input.userLocationKnown) parts.push(t('mapA11y.userLocationKnown'));
    return parts.join(' ');
  }

  const route = input.selectedRoute;
  const distance = formatDistance(route.distanceMeters);
  const duration = formatDuration(route.adjustedDurationSeconds ?? route.durationSeconds);
  const climbMeters = route.totalClimbMeters ?? 0;

  const summary =
    climbMeters > 0
      ? t('mapA11y.routeWithClimb', {
          distance,
          duration,
          climb: `${Math.round(climbMeters)} m`,
        })
      : t('mapA11y.routeSummary', { distance, duration });

  parts.push(summary);

  // Mode-specific prefix / context
  if (input.mode === 'navigating') {
    if (typeof input.remainingDistanceMeters === 'number' && input.remainingDistanceMeters > 0) {
      parts.push(
        t('mapA11y.navigating', {
          remaining: formatDistance(input.remainingDistanceMeters),
        }),
      );
    }
  } else if (input.mode === 'planning') {
    parts.push(t('mapA11y.planning'));
  } else if (input.mode === 'historical') {
    parts.push(t('mapA11y.historical', { distance }));
  }

  // Risk breakdown (top categories only, short form)
  if (route.riskSegments?.length > 0) {
    const distribution = computeRiskDistribution(route.riskSegments);
    if (distribution.length > 0) {
      const top = distribution
        .filter((entry) => entry.percentage >= 5)
        .slice(0, 3)
        .map((entry) => `${entry.percentage}% ${entry.category.label.toLowerCase()}`)
        .join(', ');
      if (top) {
        parts.push(t('mapA11y.riskBreakdown', { breakdown: top }));
      }
    }
  }

  // Hazard count on route
  const hazardCount = input.hazardsOnRoute ?? 0;
  if (hazardCount > 0) {
    const key =
      hazardCount === 1 ? 'mapA11y.hazardsOnRoute_one' : 'mapA11y.hazardsOnRoute_other';
    parts.push(t(key, { count: hazardCount }));
  }

  return parts.join(' ');
};

/**
 * Translated label for a hazard type, with fallback to 'other'.
 */
const hazardTypeLabel = (
  t: (key: string, vars?: Record<string, string | number>) => string,
  hazardType: HazardType,
): string => {
  const key = `hazard.types.${hazardType}`;
  const translated = t(key);
  // useT returns the key unchanged if the path is missing — guard against that.
  if (translated === key) return t('hazard.types.other');
  return translated;
};

/**
 * Compute the announcement key for the current state. When this key changes,
 * `liveRegionText` is re-emitted. When it's null, live-region is cleared.
 */
const computeAnnouncementKey = (input: MapA11yInput): string | null => {
  if (input.isOffRoute) return 'off-route';

  if (
    input.nearestApproachingHazard &&
    !input.suppressHazardLive &&
    input.nearestApproachingHazard.distanceMeters <=
      (input.hazardAnnouncementRadiusMeters ?? 200)
  ) {
    // Bucket distance in 50m steps so a hazard doesn't re-announce every meter,
    // but does re-announce as the rider closes in meaningfully.
    const bucket = Math.floor(input.nearestApproachingHazard.distanceMeters / 50) * 50;
    return `hazard:${input.nearestApproachingHazard.id}:${bucket}`;
  }

  return null;
};

/**
 * Build the live-region announcement text for a given state key.
 */
const buildAnnouncement = (
  t: (key: string, vars?: Record<string, string | number>) => string,
  input: MapA11yInput,
  key: string,
): string | null => {
  if (key === 'off-route') {
    return t('mapA11y.offRouteEntered');
  }
  if (key.startsWith('hazard:') && input.nearestApproachingHazard) {
    return t('mapA11y.hazardUpcoming', {
      type: hazardTypeLabel(t, input.nearestApproachingHazard.hazardType),
      distance: Math.round(input.nearestApproachingHazard.distanceMeters),
    });
  }
  return null;
};

export const useMapA11ySummary = (input: MapA11yInput): MapA11yOutput => {
  const t = useT();
  const [liveRegionText, setLiveRegionText] = useState<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const wasOffRouteRef = useRef<boolean>(false);

  const label = useMemo(
    () => buildLabel(t, input),
    // Stable deps from primitives + the one optional object we actually read.
    // We intentionally depend on `input` as a whole — the caller is expected
    // to memoize inputs upstream (or accept that `label` re-computes when
    // props change, which is cheap — just string concatenation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      t,
      input.mode,
      input.selectedRoute?.id,
      input.selectedRoute?.distanceMeters,
      input.selectedRoute?.durationSeconds,
      input.selectedRoute?.adjustedDurationSeconds,
      input.selectedRoute?.totalClimbMeters,
      input.selectedRoute?.riskSegments?.length,
      input.hazardsOnRoute,
      input.remainingDistanceMeters,
      input.userLocationKnown,
    ],
  );

  useEffect(() => {
    const key = computeAnnouncementKey(input);

    if (key === lastKeyRef.current) {
      // No state transition — leave liveRegionText as-is. If it's already
      // been announced, TalkBack will not re-read it. If we set the same
      // value, React will bail out anyway.
      return;
    }

    if (key) {
      const text = buildAnnouncement(t, input, key);
      lastKeyRef.current = key;
      setLiveRegionText(text);
      if (key === 'off-route') wasOffRouteRef.current = true;
    } else {
      // Cleared state. If we were off-route and now we're back on, announce it.
      if (wasOffRouteRef.current) {
        wasOffRouteRef.current = false;
        lastKeyRef.current = null;
        setLiveRegionText(t('mapA11y.offRouteCleared'));
      } else {
        lastKeyRef.current = null;
        setLiveRegionText(null);
      }
    }
  }, [
    t,
    input.isOffRoute,
    input.nearestApproachingHazard?.id,
    input.nearestApproachingHazard?.distanceMeters,
    input.nearestApproachingHazard?.hazardType,
    input.suppressHazardLive,
    input.hazardAnnouncementRadiusMeters,
    input,
  ]);

  return { label, liveRegionText };
};
