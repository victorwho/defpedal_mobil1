/**
 * Merge the rider's matching recent destinations into live search results.
 *
 * Recents whose label contains the query come first (the clock-icon rows),
 * then the live Mapbox results — minus any that are the same place as a recent
 * already shown.
 *
 * "Same place" is matched by NAME, case-insensitively. It used to be "within
 * ~200 m of the recent", but live results no longer carry coordinates: they
 * are listed from Search Box /suggest alone, because fetching every result's
 * location billed a session per result (see `resolveSuggestion`).
 */
import type { AutocompleteSuggestion } from '@defensivepedal/core';

const MIN_QUERY_LENGTH = 2;

const normalise = (label: string): string => label.trim().toLowerCase();

export const mergeRecentsWithResults = (
  recents: readonly AutocompleteSuggestion[],
  results: AutocompleteSuggestion[],
  query: string,
): AutocompleteSuggestion[] => {
  const q = normalise(query);
  if (q.length < MIN_QUERY_LENGTH) return results;

  const matchingRecents = recents.filter((r) => normalise(r.label).includes(q));
  if (matchingRecents.length === 0) return results;

  const recentLabels = new Set(matchingRecents.map((r) => normalise(r.label)));
  return [...matchingRecents, ...results.filter((s) => !recentLabels.has(normalise(s.label)))];
};
