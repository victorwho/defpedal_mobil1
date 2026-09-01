/**
 * Civia.ro category slug -> hazard_type map.
 *
 * Built from the live taxonomy (21 problem types listed on civia.ro/sesizare)
 * cross-checked against the `<category>` slugs actually emitted by
 * civia.ro/feed.xml, sampled 2026-09-01. Keyed on the slug rather than the
 * Romanian label because the slug is stable while the label is presentation
 * text.
 *
 * This table is the review gate. Everything mapped to a concrete hazard type
 * auto-publishes, so the human review that matters happens HERE, in code
 * review — once — rather than on every item forever.
 *
 * WHAT COUNTS AS CYCLING-RELEVANT: deliberately the same set as
 * SESIZARE_ELIGIBLE_HAZARD_TYPES in packages/core/src/sesizare.ts — the types
 * we let a rider file a sesizare ABOUT. Importing a category we would not let
 * a rider report, or dropping one we would, means the outbound and inbound
 * halves of the same feature disagree about what a cycling hazard is.
 *
 * Each mapped entry carries its own English phrase because the deterministic
 * path never calls the model, and Civia's own text is Romanian prose written
 * for a city clerk ("Vă rog să dispuneți remedierea"), not a rider-facing
 * description. Phrases are written from the RIDER's point of view — what they
 * will actually encounter — not the municipal category name.
 */
import type { ImportableHazardType, MappingOutcome } from '../types';

type MapEntry =
  | 'irrelevant'
  | 'llm'
  | { readonly type: ImportableHazardType; readonly summary: string };

export const CIVIA_CATEGORY_MAP: Readonly<Record<string, MapEntry>> = {
  // ── Road surface ────────────────────────────────────────────────────────
  groapa: { type: 'pothole', summary: 'Pothole reported in the roadway' },
  trotuar: {
    type: 'poor_surface',
    summary: 'Broken or badly degraded pavement surface',
  },

  // ── Parking / obstruction ───────────────────────────────────────────────
  // The highest-value cycling category in this feed: Romanian pavement
  // parking routinely pushes riders into live traffic.
  parcare: {
    type: 'illegally_parked_car',
    summary: 'Vehicles parked on the pavement, forcing people into the road',
  },
  parcare_trasata: {
    type: 'illegally_parked_car',
    summary: 'Parking bays marked illegally, narrowing the usable roadway',
  },
  masina_abandonata: {
    type: 'illegally_parked_car',
    summary: 'Abandoned vehicle blocking part of the roadway',
  },
  ocupare_domeniu: {
    type: 'blocked_bike_lane',
    summary: 'Public right of way obstructed — expect to be pushed around it',
  },

  // ── Junctions ───────────────────────────────────────────────────────────
  semafor: {
    type: 'dangerous_intersection',
    summary: 'Faulty traffic signal or road markings at this junction',
  },
  trecere_pietoni: {
    type: 'dangerous_intersection',
    summary: 'Dangerous crossing — poor visibility or missing markings',
  },

  // ── Animals ─────────────────────────────────────────────────────────────
  caini: {
    type: 'aggro_dogs',
    summary: 'Stray dogs reported here — they chase riders',
  },

  // ── Ambiguous: the reporter picked no specific category ─────────────────
  // Routed to the model rather than dropped: "altele" is exactly where a real
  // cycling hazard hides when the taxonomy has no box for it. Low volume
  // (~10% of the feed), so the cost is negligible.
  altele: 'llm',

  // ── Not a riding hazard ─────────────────────────────────────────────────
  // stalpisori is 36% of the feed and the single biggest drop. It is a
  // REQUEST to install anti-parking bollards, not a present hazard: the pin
  // would claim something is there that is not. The underlying complaint
  // (cars park here) reaches us via `parcare` when someone reports it as a
  // hazard rather than as a request.
  stalpisori: 'irrelevant',
  iluminat: 'irrelevant', // street lighting — real at night, but we have no
  //                         way to scope a pin to darkness, and an always-on
  //                         "dark here" marker is noise on a daytime ride.
  gunoi: 'irrelevant', // uncollected rubbish
  canalizare: 'irrelevant', // blocked drains
  copac: 'irrelevant', // dangerous trees
  spatiu_verde: 'irrelevant', // unkempt green space
  constructie: 'irrelevant', // unpermitted construction
  mediu: 'irrelevant', // pollution / fly-tipping in nature
  transport: 'irrelevant', // public-transport complaints
  mobilier: 'irrelevant', // vandalised street furniture
  teren_insalubru: 'irrelevant', // derelict land
  vandalism: 'irrelevant',
  irigatii: 'irrelevant', // sprinklers wasting water
  aspersoare: 'irrelevant',
};

const toOutcome = (entry: MapEntry): MappingOutcome => {
  if (entry === 'irrelevant') return { kind: 'irrelevant' };
  if (entry === 'llm') return { kind: 'llm' };
  return { kind: 'type', hazardType: entry.type, summaryEn: entry.summary };
};

/**
 * Resolve a Civia category slug.
 *
 * An UNKNOWN slug goes to `review`, not `irrelevant` and not `llm`. Civia is a
 * young platform still adding categories; silently dropping a new one would
 * hide it forever, and handing it to the model spends tokens guessing at a
 * label we could simply read once and add to this table.
 */
export const resolveCiviaMapping = (
  categorySlug: string | null | undefined,
): MappingOutcome => {
  const slug = (categorySlug ?? '').trim().toLowerCase();
  if (!slug) return { kind: 'llm' };

  const direct = CIVIA_CATEGORY_MAP[slug];
  if (direct) return toOutcome(direct);

  return {
    kind: 'review',
    reason: `Unmapped civia category "${slug}" — add it to CIVIA_CATEGORY_MAP`,
  };
};
