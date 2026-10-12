/**
 * What a long-press on the planning map does (route-planning.tsx).
 *
 * A long-press drops the destination — unless the rider is editing the start
 * field, in which case it drops the START (2026-10-12). Tying the start to the
 * open field keeps the common case one gesture: no "start or destination?"
 * menu in front of every destination drop. The placement modes (hazard,
 * city suggestion) keep precedence over both.
 */
export type MapLongPressTarget = 'hazard' | 'start' | 'destination' | 'none';

export const mapLongPressTarget = ({
  hazardPlacementMode,
  suggestionPlacementMode,
  activeField,
}: {
  hazardPlacementMode: boolean;
  suggestionPlacementMode: boolean;
  activeField: string | null;
}): MapLongPressTarget => {
  if (suggestionPlacementMode) return 'none';
  if (hazardPlacementMode) return 'hazard';
  return activeField === 'startOverride' ? 'start' : 'destination';
};
