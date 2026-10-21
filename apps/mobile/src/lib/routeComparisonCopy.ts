import {
  describeBusyRoadSaving,
  formatDistance,
  type MeasurementSystem,
  type RiderPace,
  type RoutePreviewResponse,
} from '@defensivepedal/core';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface RouteComparisonCopy {
  title: string;
  subtitle: string | null;
  isWarning: boolean;
}

/**
 * Busy-stretch distances round to the nearest 10 m (or the formatter's 10 ft)
 * — a callout that says "183 m on a busy road" implies a precision the
 * risk-segment geometry does not have.
 */
export const formatStretchDistance = (meters: number, units: MeasurementSystem): string =>
  meters >= 1000
    ? formatDistance(meters, units)
    : formatDistance(Math.round(meters / 10) * 10, units);

/**
 * Whole minutes the current route costs at the rider's pace: the extra
 * distance at their speed. Climb is taken as equal on both routes (they join
 * the same two points, and the compared route is never elevation-enriched),
 * so this is a distance gap, not a terrain one. Null without a pace or
 * without the compared route's length.
 */
const extraMinutesAtPace = (
  comparisonDistanceMeters: number | undefined,
  currentDistanceMeters: number | null,
  pace: RiderPace | null,
): number | null => {
  if (!pace?.personal || comparisonDistanceMeters === undefined || currentDistanceMeters === null) {
    return null;
  }
  return Math.round(((currentDistanceMeters - comparisonDistanceMeters) / 1000 / pace.kmh) * 60);
};

/**
 * The Safe-vs-Fast comparison line, shared by `/route-preview` and the
 * onboarding route reveal so the two can never describe the same route
 * differently.
 *
 * Prefers the structured `comparison` (localized copy); falls back to the
 * legacy free-text `comparisonLabel` for previews persisted by pre-2026-08
 * builds.
 */
export const describeRouteComparison = (
  preview: Pick<RoutePreviewResponse, 'comparison' | 'comparisonLabel'> | null | undefined,
  t: Translate,
  units: MeasurementSystem,
  /** From `useRiderPace`; with it the time cost is quoted at the rider's pace. */
  pace: RiderPace | null,
  /** Length of the route shown, needed for the pace-based cost. */
  currentDistanceMeters: number | null,
): RouteComparisonCopy | null => {
  const comparison = preview?.comparison;
  if (comparison) {
    let title: string;
    let subtitle: string | null = null;
    if (comparison.against === 'fast') {
      if (comparison.verdict === 'safer') {
        /*
         * Quantify "calmer" where we honestly can.
         *
         * The saving is metres on HIGH-RISK roads — length-weighted, and a
         * tier-level figure rather than the score-level `diffPercent` that
         * this comparison has always carried and never rendered. That older
         * number is an unweighted mean over segments (a 20 m junction counts
         * as much as a 2 km arterial) and a percentage off it reads as a
         * likelihood claim, which the risk model does not validate.
         *
         * Falls back to the generic line when there is no saving to quote —
         * including when the safe route uses MORE busy road, which happens.
         */
        const saving = comparison.busyRoadMeters
          ? describeBusyRoadSaving(
              comparison.busyRoadMeters.current,
              comparison.busyRoadMeters.comparison,
            )
          : { kind: 'none' as const };
        const savingLine =
          saving.kind === 'saves'
            ? t('preview.comparison.busySaving', {
                distance: formatStretchDistance(saving.metersSaved, units),
              })
            : null;

        const atPace = extraMinutesAtPace(
          comparison.comparisonDistanceMeters,
          currentDistanceMeters,
          pace,
        );
        const extraMinutes = atPace ?? comparison.extraMinutes ?? 0;
        if (extraMinutes >= 1) {
          title = atPace !== null
            ? t('preview.comparison.calmerCostAtPace', { minutes: extraMinutes })
            : t('preview.comparison.calmerCost', { minutes: extraMinutes });
          subtitle = savingLine ?? t('preview.comparison.calmerCostSub');
        } else {
          title = t('preview.comparison.calmerFree');
          subtitle = savingLine;
        }
      } else if (comparison.verdict === 'similar') {
        title = t('preview.comparison.similarFast');
      } else {
        title = t('preview.comparison.sameFast');
      }
    } else if (comparison.verdict === 'less_safe') {
      title = comparison.diffPercent >= 1
        ? t('preview.comparison.lessSafe', { percent: comparison.diffPercent })
        : t('preview.comparison.slightlyLessSafe');
    } else if (comparison.verdict === 'similar') {
      title = t('preview.comparison.similarSafe');
    } else {
      title = t('preview.comparison.sameSafe');
    }
    return { title, subtitle, isWarning: comparison.verdict === 'less_safe' };
  }
  if (preview?.comparisonLabel) {
    return {
      title: preview.comparisonLabel,
      subtitle: null,
      isWarning: preview.comparisonLabel.includes('less safe'),
    };
  }
  return null;
};
