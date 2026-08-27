/**
 * Decides whether a hazard can become a Romanian sesizare, and resolves the
 * street address the petition text needs.
 *
 * ⚠️ Deliberately does NOT use `resolveCountryFromCoord` from core. The RO
 * bounding box in `countryCoverage.ts` intentionally over-includes Belgrade
 * and Chișinău (documented in CLAUDE.md), so a bbox gate would offer Romanian
 * city-hall complaints to riders in Serbia and Moldova. Mapbox's reverse
 * geocode is authoritative — and it is the same call that produces the
 * address, so eligibility costs no extra round-trip.
 *
 * Offline behaviour: the geocode fails, `eligible` stays false and no CTA
 * renders. That is correct — the hand-off needs a browser anyway.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { isSesizareEligible, type Coordinate, type HazardType } from '@defensivepedal/core';

import { reverseGeocodeAddressWithCountry } from '../lib/mapbox-search';
import { useAppStore } from '../store/appStore';

/** Sesizări exist only for Romanian authorities (OG 27/2002). */
const SESIZARE_COUNTRY = 'RO';

/** Addresses don't move. Cache hard. */
const STALE_TIME_MS = 24 * 60 * 60 * 1000;

type Resolved = { address: string; countryCode: string } | null;

const cacheKeyFor = (coordinate: Coordinate | null | undefined, id?: string): string =>
  id ?? (coordinate ? `${coordinate.lat.toFixed(5)},${coordinate.lon.toFixed(5)}` : 'none');

const queryOptionsFor = (coordinate: Coordinate, key: string) => ({
  queryKey: ['sesizare-availability', key] as const,
  staleTime: STALE_TIME_MS,
  gcTime: STALE_TIME_MS,
  retry: 1,
  queryFn: (): Promise<Resolved> =>
    reverseGeocodeAddressWithCountry(coordinate.lat, coordinate.lon),
});

const isUsable = (resolved: Resolved): resolved is { address: string; countryCode: string } =>
  // An empty address counts as ineligible rather than falling back to a
  // coordinates-only petition: a primărie cannot dispatch a crew to a lat/lon,
  // and a rejected sesizare is worse than no offer at all.
  resolved?.countryCode === SESIZARE_COUNTRY && resolved.address.trim().length > 0;

const hasCoordinate = (coordinate: Coordinate | null | undefined): boolean =>
  Boolean(coordinate) && Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lon);

// ---------------------------------------------------------------------------
// Single hazard
// ---------------------------------------------------------------------------

export interface SesizareAvailability {
  readonly eligible: boolean;
  readonly address: string | null;
  readonly isLoading: boolean;
}

export const useSesizareAvailability = (
  hazardType: HazardType | null | undefined,
  coordinate: Coordinate | null | undefined,
  /** Pass the hazard id when known so the cache key is stable across renders. */
  cacheKey?: string,
): SesizareAvailability => {
  const sesizariEnabled = useAppStore((state) => state.sesizariConfig.enabled);

  // Cheap gates first — never spend a geocode on a hazard that can't qualify.
  const typeEligible = Boolean(hazardType) && isSesizareEligible(hazardType as HazardType);
  const shouldResolve = sesizariEnabled && typeEligible && hasCoordinate(coordinate);

  const query = useQuery({
    ...queryOptionsFor(coordinate ?? { lat: 0, lon: 0 }, cacheKeyFor(coordinate, cacheKey)),
    enabled: shouldResolve,
  });

  const resolved = query.data ?? null;
  return {
    eligible: shouldResolve && isUsable(resolved),
    address: isUsable(resolved) ? resolved.address.trim() : null,
    isLoading: shouldResolve && query.isLoading,
  };
};

// ---------------------------------------------------------------------------
// Batch — the post-ride card
// ---------------------------------------------------------------------------

export interface SesizareCandidateInput {
  readonly hazardType: HazardType;
  readonly coordinate: Coordinate;
  readonly reportedAt: string;
}

export interface SesizareCandidate extends SesizareCandidateInput {
  readonly address: string;
}

/**
 * Resolves a batch of reports down to the ones that can actually become a
 * sesizare. Shares the single-hazard cache (same query key), so a row that
 * later renders on its own costs nothing.
 *
 * Used by the post-ride card to decide whether to render at all — a header
 * over an empty list is worse than no card.
 */
export const useSesizareCandidates = (
  reports: readonly SesizareCandidateInput[],
): { candidates: SesizareCandidate[]; isLoading: boolean } => {
  const sesizariEnabled = useAppStore((state) => state.sesizariConfig.enabled);

  const eligibleReports = sesizariEnabled
    ? reports.filter(
        (report) => isSesizareEligible(report.hazardType) && hasCoordinate(report.coordinate),
      )
    : [];

  const results = useQueries({
    queries: eligibleReports.map((report) =>
      queryOptionsFor(report.coordinate, cacheKeyFor(report.coordinate)),
    ),
  });

  const candidates: SesizareCandidate[] = [];
  for (let index = 0; index < eligibleReports.length; index += 1) {
    const resolved = (results[index]?.data ?? null) as Resolved;
    if (isUsable(resolved)) {
      candidates.push({ ...eligibleReports[index], address: resolved.address.trim() });
    }
  }

  return {
    candidates,
    isLoading: results.some((result) => result.isLoading),
  };
};
