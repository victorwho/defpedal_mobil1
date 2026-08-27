/**
 * Sesizări — hazard → Romanian civic-complaint (sesizare) handoff.
 *
 * Pure functions only. No I/O, no platform APIs, no clock side effects.
 *
 * This module composes the Romanian petition paragraph a rider pastes into
 * civia.ro. It lives in core (not in the i18n layer) for the same reason the
 * `pedalVoice` catalogs do: it is civic copy addressed to a Romanian public
 * authority, so it is **always Romanian regardless of the app's UI locale**.
 * Never route this text through `useT()`.
 *
 * Why a handoff and not a submission: civia.ro's final submit requires
 * `author_name` + `author_address` (OG 27/2002 art. 7 — anonymous petitions
 * may be disregarded). We never hold the rider's legal identity, so the rider
 * always finishes on Civia. See docs/plans/sesizari-civia.md §1.
 */
import type { Coordinate, HazardType } from './contracts';

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * The hazard types a Romanian authority can actually act on.
 *
 * Deliberately excluded: `aggressive_traffic` and `narrow_street` (no
 * department has a remedy), `missing_bike_lane` (an infrastructure request,
 * not a defect report) and `other` (unclassified free text we cannot map to a
 * competent body).
 */
export const SESIZARE_ELIGIBLE_HAZARD_TYPES = [
  'pothole',
  'poor_surface',
  'dangerous_intersection',
  'illegally_parked_car',
  'blocked_bike_lane',
  'aggro_dogs',
] as const;

export type SesizareEligibleHazardType = (typeof SESIZARE_ELIGIBLE_HAZARD_TYPES)[number];

export const isSesizareEligible = (
  hazardType: HazardType,
): hazardType is SesizareEligibleHazardType =>
  (SESIZARE_ELIGIBLE_HAZARD_TYPES as readonly string[]).includes(hazardType);

/**
 * Civia's own problem-category slugs, recorded on each `sesizari` row.
 *
 * We open the generic form today, so these are not used for routing yet —
 * they exist so the stored history stays meaningful if we ever deep-link to
 * `civia.ro/sesizare/<slug>`. Verified against civia.ro/sesizare on
 * 2026-08-27; external and unversioned, so treat drift as expected.
 */
export const CIVIA_CATEGORY_BY_HAZARD_TYPE: Record<SesizareEligibleHazardType, string> = {
  pothole: 'groapa-in-asfalt',
  poor_surface: 'trotuar-stricat',
  dangerous_intersection: 'semafor-defect',
  illegally_parked_car: 'parcare-pe-trotuar',
  blocked_bike_lane: 'ocupare-abuziva-domeniu-public',
  aggro_dogs: 'caini-fara-stapan',
};

// ---------------------------------------------------------------------------
// Handoff target
// ---------------------------------------------------------------------------

/**
 * Fallback only. The live value is served by `GET /v1/profile`
 * (`SESIZARI_BASE_URL` on Cloud Run) so a civia.ro path change is fixable
 * without a store release.
 */
export const DEFAULT_CIVIA_BASE_URL = 'https://civia.ro/sesizari';

/** Attribution tag — civia.ro already understands a `ref` query param. */
export const CIVIA_REF = 'defensivepedal';

export const buildCiviaUrl = (baseUrl: string = DEFAULT_CIVIA_BASE_URL): string => {
  const trimmed = baseUrl.trim() || DEFAULT_CIVIA_BASE_URL;
  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}ref=${CIVIA_REF}`;
};

// ---------------------------------------------------------------------------
// Badge ladder
// ---------------------------------------------------------------------------

/**
 * Thresholds for the `civic_sesizari` tier family. Kept here so the mobile
 * progress UI and the `check_and_award_badges` migration cannot drift apart
 * silently — the migration hard-codes the same numbers and a test asserts it.
 */
export const SESIZARE_BADGE_THRESHOLDS = [1, 5, 25] as const;

// ---------------------------------------------------------------------------
// Text composition
// ---------------------------------------------------------------------------

const RO_MONTHS = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
] as const;

/** `2026-08-27T09:14:00Z` → `27 august 2026`. Invalid input → empty string. */
export const formatSesizareDate = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getDate()} ${RO_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
};

/** `44.46117` → `44.4612`. Four decimals is ~11 m — enough to find a pothole. */
export const formatSesizareCoordinates = (coordinate: Coordinate): string =>
  `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`;

export interface SesizareInput {
  readonly hazardType: SesizareEligibleHazardType;
  /** Street address from `reverseGeocodeAddress`. May be blank — see below. */
  readonly address: string;
  readonly coordinate: Coordinate;
  /** ISO timestamp of when the rider observed the hazard. */
  readonly observedAt: string;
}

/**
 * The problem sentence and the closing request, per hazard type.
 *
 * `place` is already a full clause ("pe strada X" or "în zona indicată de
 * coordonatele de mai jos"), so each template reads correctly with either.
 */
const TEMPLATES: Record<
  SesizareEligibleHazardType,
  { problem: (place: string) => string; request: string }
> = {
  pothole: {
    problem: (place) =>
      `${place} există o groapă în carosabil care pune în pericol bicicliștii care circulă pe această stradă.`,
    request: 'Vă rog să dispuneți remedierea.',
  },
  poor_surface: {
    problem: (place) =>
      `${place} carosabilul este într-o stare avansată de degradare — asfalt crăpat, denivelări și porțiuni desprinse — ceea ce face deplasarea cu bicicleta periculoasă.`,
    request: 'Vă rog să dispuneți repararea carosabilului.',
  },
  dangerous_intersection: {
    problem: (place) =>
      `${place} se află o intersecție periculoasă pentru bicicliști: vizibilitatea este redusă, iar semnalizarea și marcajele rutiere sunt insuficiente.`,
    request:
      'Vă rog să dispuneți verificarea intersecției și luarea măsurilor de siguranță care se impun.',
  },
  illegally_parked_car: {
    problem: (place) =>
      `${place} autovehicule staționează neregulamentar pe trotuar, obligând bicicliștii și pietonii să coboare în carosabil.`,
    request:
      'Vă rog să dispuneți verificarea zonei de către Poliția Locală și sancționarea staționărilor neregulamentare.',
  },
  blocked_bike_lane: {
    problem: (place) =>
      `${place} pista de biciclete este blocată, iar bicicliștii sunt nevoiți să iasă în trafic pentru a o ocoli.`,
    request: 'Vă rog să dispuneți eliberarea pistei de biciclete de către Poliția Locală.',
  },
  aggro_dogs: {
    problem: (place) =>
      `${place} se află câini fără stăpân care aleargă după bicicliști și reprezintă un pericol real de accident.`,
    request:
      'Vă rog să dispuneți intervenția serviciului de gestionare a câinilor fără stăpân.',
  },
};

/**
 * Builds the single Romanian paragraph the rider pastes into Civia's
 * "Descriere" field.
 *
 * One paragraph rather than a labelled block on purpose: Civia's pipeline
 * (`/api/ai/classify`, `/api/ai/detect-city`, `/api/ai/improve`) rewrites free
 * prose into formal petition language and detects the city from the text, so
 * prose is their happy path and structure would have to be undone.
 */
export const composeSesizareText = (input: SesizareInput): string => {
  const template = TEMPLATES[input.hazardType];
  const address = input.address.trim();
  const place = address.length > 0 ? `Pe ${address}` : 'În zona indicată de coordonatele de mai jos';

  const date = formatSesizareDate(input.observedAt);
  const observation =
    date.length > 0
      ? `Am observat problema pe ${date}, în timp ce mă deplasam cu bicicleta.`
      : 'Am observat problema în timp ce mă deplasam cu bicicleta.';

  const coordinates = `Coordonate GPS: ${formatSesizareCoordinates(input.coordinate)}.`;

  return [template.problem(place), observation, coordinates, template.request].join(' ');
};
