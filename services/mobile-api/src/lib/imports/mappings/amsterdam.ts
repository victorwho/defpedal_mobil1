/**
 * Amsterdam "Signalen" category slug -> hazard_type map.
 *
 * Built from the live taxonomy (162 subcategory slugs, fetched 2026-08-27 from
 * api.meldingen.amsterdam.nl/signals/v1/public/terms/categories) cross-checked
 * against observed frequencies in a 4,000-feature city sample, so the
 * high-volume categories are all explicitly decided rather than left to a
 * fallback.
 *
 * IMPORTANT — this source has NO FREE TEXT. The public GeoJSON carries only
 * `category` and `created_at`. That has two consequences:
 *
 *   1. The model can add nothing here. There is no prose to read, so Amsterdam
 *      never reaches the LLM stage and costs nothing to classify.
 *   2. An unrecognised slug CANNOT be auto-resolved. It goes to human review
 *      ('review'), not to 'irrelevant' — otherwise every new category the city
 *      introduces would vanish silently. The reviewer's job is to extend this
 *      table.
 *
 * Slugs observed in data occasionally differ from the published tree (the tree
 * lists `omleiding-belijning-verkeer`; live data emits `omleiding`). Both are
 * mapped where known.
 */
import type { ImportableHazardType, MappingOutcome } from '../types';

type MapEntry =
  | 'irrelevant'
  | { readonly type: ImportableHazardType; readonly summary: string };

export const AMSTERDAM_SLUG_MAP: Readonly<Record<string, MapEntry>> = {
  // ── Roads, traffic, street furniture — the cycling-relevant parent ───────
  omleiding: {
    // 1,189 of 4,000 observed — by far the largest road category. A diversion
    // means the carriageway has been taken away or rerouted.
    type: 'narrow_street',
    summary: 'Roadworks diversion reported here — the usual route may be closed or narrowed.',
  },
  'omleiding-belijning-verkeer': {
    type: 'narrow_street',
    summary: 'Roadworks diversion or road-marking issue reported here.',
  },
  'tijdelijke-verkeersmaatregelen': {
    type: 'narrow_street',
    summary: 'Temporary traffic measures in place here — expect a changed or narrowed layout.',
  },
  verkeerssituaties: {
    // 235 observed. Amsterdam's own label is "unclear or dangerous traffic
    // situation" — the most on-target category in the taxonomy.
    type: 'dangerous_intersection',
    summary: 'Unclear or dangerous traffic situation reported here.',
  },
  'verkeersoverlast-verkeerssituaties': {
    type: 'dangerous_intersection',
    summary: 'Traffic nuisance or dangerous traffic situation reported here.',
  },
  verkeerslicht: {
    type: 'dangerous_intersection',
    summary: 'Traffic signal fault reported at this junction.',
  },
  'onderhoud-fietspad': {
    // A dedicated CYCLE PATH maintenance category — exactly the signal this
    // pipeline exists to surface.
    type: 'poor_surface',
    summary: 'Cycle path in need of repair reported here.',
  },
  'onderhoud-stoep-straat-en-fietspad': {
    // 111 observed. Covers footway, carriageway AND cycle path.
    type: 'poor_surface',
    summary: 'Damaged road, pavement or cycle path surface reported here.',
  },
  gladheid: {
    type: 'poor_surface',
    summary: 'Slippery surface reported here.',
  },
  'put-riolering-verstopt': {
    type: 'poor_surface',
    summary: 'Blocked drain reported here — expect standing water or a fouled grate.',
  },
  putrioleringverstopt: {
    // Live-data spelling of the above (no hyphens).
    type: 'poor_surface',
    summary: 'Blocked drain reported here — expect standing water or a fouled grate.',
  },
  'put-riool-kapot': {
    type: 'poor_surface',
    summary: 'Broken drain or manhole cover reported here.',
  },
  'verkeersbord-verkeersafzetting': {
    type: 'narrow_street',
    summary: 'Traffic sign or road closure issue reported here.',
  },

  // ── Obstruction in public space ─────────────────────────────────────────
  'hinderlijk-geplaatst-object': {
    type: 'blocked_bike_lane',
    summary: 'An object has been left obstructing the public way here.',
  },
  parkeeroverlast: {
    type: 'illegally_parked_car',
    summary: 'Parking obstruction reported here.',
  },
  'auto-scooter-bromfietswrak': {
    type: 'illegally_parked_car',
    summary: 'An abandoned vehicle is reported here and may be obstructing the way.',
  },

  // ── Explicitly NOT cycling hazards ──────────────────────────────────────
  // Street lighting is genuinely a night-cycling safety issue, but hazard_type
  // has no way to express it; mapping it to `other` would put an unactionable
  // pin on the map. 364 observed, so this is a deliberate, high-volume drop.
  'lantaarnpaal-straatverlichting': 'irrelevant',
  'straatverlichting-openbare-klok': 'irrelevant',
  'verlichting-netstoring': 'irrelevant',
  lichthinder: 'irrelevant',
  klok: 'irrelevant',

  veegzwerfvuil: 'irrelevant',
  'prullenbak-vol': 'irrelevant',
  prullenbakkapot: 'irrelevant',
  'onkruid-verharding': 'irrelevant',
  onkruid: 'irrelevant',
  'drijfvuil-niet-bevaarbaar-water': 'irrelevant',

  grofvuil: 'irrelevant',
  'handhaving-op-afval': 'irrelevant',
  'container-bijplaatsing': 'irrelevant',
  'container-is-vol': 'irrelevant',
  'asbest-accu': 'irrelevant',
  'bruin-en-witgoed': 'irrelevant',

  'japanse-duizendknoop': 'irrelevant',
  beplanting: 'irrelevant',
  'maaien-snoeien': 'irrelevant',
  snoeien: 'irrelevant',
  eikenprocessierups: 'irrelevant',

  ratten: 'irrelevant',

  // `verkeersoverlast` is Amsterdam's "traffic nuisance" class — persistent
  // speeding, rat-running and aggressive driving on a street. It is the one
  // slug in the tail that maps to a hazard type we already have.
  verkeersoverlast: {
    type: 'aggressive_traffic',
    summary: 'Persistent traffic nuisance reported on this street — expect fast or aggressive driving.',
  },
  'bouw-sloopoverlast': {
    type: 'narrow_street',
    summary: 'Construction or demolition work reported here — the street may be obstructed.',
  },

  // Second-sweep tail: individually small, decided here so the review queue
  // stays a place where something is actually waiting for a human.
  'overig-openbare-ruimte': 'irrelevant',
  'stank-geluidsoverlast': 'irrelevant',
  kades: 'irrelevant',
  markten: 'irrelevant',
  watergangen: 'irrelevant',
  deelfiets: 'irrelevant', // shared bikes — parked, not a riding hazard
  'brug-bediening': 'irrelevant',
  wegsleep: 'irrelevant',

  // Observed in the first live sweep, all decided here so they stop occupying
  // the review queue. An abandoned bike is parked, not a riding hazard (same
  // call as Cologne's Schrottfahrräder); generic street furniture and bridge
  // reports carry no text to act on, and a bridge CLOSURE surfaces as
  // `omleiding` anyway.
  fietswrak: 'irrelevant',
  straatmeubilair: 'irrelevant',
  bruggen: 'irrelevant',
  brug: 'irrelevant',
  graffitiwildplak: 'irrelevant',
  uitwerpselen: 'irrelevant',
  'daklozen-bedelen': 'irrelevant',
  jongerenoverlast: 'irrelevant',
  'overige-overlast-door-personen': 'irrelevant',
  'overig-boten': 'irrelevant',
  // Amsterdam's generic "other" bucket. With no free text this can never be
  // resolved by anyone, so parking it in review would grow the queue forever.
  overig: 'irrelevant',
  'overig-wegen-verkeer-straatmeubilair': 'irrelevant',

  'fietsrek-nietje': 'irrelevant', // bike racks — infrastructure, not a hazard
  parkeerautomaten: 'irrelevant',
  'parkeer-verwijssysteem': 'irrelevant',
  oplaadpunt: 'irrelevant',
  bewegwijzering: 'irrelevant',
  camerasystemen: 'irrelevant',
  stadsplattegronden: 'irrelevant',
  speelplaats: 'irrelevant',
  sportvoorziening: 'irrelevant',
  'verdeelkasten-bekabeling': 'irrelevant',
  'autom-verzinkbare-palen': 'irrelevant',
};

/**
 * Resolve an Amsterdam category slug.
 *
 * Unknown slugs go to REVIEW, never to 'irrelevant' and never to the model:
 * there is no free text for a model to read, and silently dropping an
 * unrecognised category would hide new categories as the city adds them.
 */
export const resolveAmsterdamMapping = (
  slug: string | null | undefined,
  parentSlug?: string | null,
): MappingOutcome => {
  const key = (slug ?? '').trim();
  if (!key) {
    return { kind: 'review', reason: 'amsterdam_missing_slug' };
  }

  const direct = AMSTERDAM_SLUG_MAP[key];
  if (direct) {
    return direct === 'irrelevant'
      ? { kind: 'irrelevant' }
      : { kind: 'type', hazardType: direct.type, summaryEn: direct.summary };
  }

  // Unknown child slug: decide by PARENT.
  //
  // Deliberately an allowlist rather than a blocklist. Of Amsterdam's 14
  // parent categories only three can contain a riding hazard; the other
  // eleven (waste, greenery, animals, boats, housing, businesses, people
  // nuisance, cleanliness, trees, subversion, "other") cannot, whatever
  // subcategories the city adds later. A blocklist would silently start
  // queueing every new slug under a parent nobody had thought to exclude.
  //
  // `schoon` is deliberately NOT in this list even though one of its children
  // (blocked drains) IS mapped: that child is handled explicitly above, and
  // no other cleanliness subcategory could be a hazard.
  const HAZARD_BEARING_PARENTS = new Set([
    'wegen-verkeer-straatmeubilair', // roads, traffic, street furniture
    'civiele-constructies', // bridges, quays, tunnels
    'overlast-in-de-openbare-ruimte', // obstruction of the public way
  ]);

  if (parentSlug && !HAZARD_BEARING_PARENTS.has(parentSlug)) {
    return { kind: 'irrelevant' };
  }

  // Either no parent was supplied, or it is one that can bear hazards — a
  // human decides and extends this table.
  return { kind: 'review', reason: `amsterdam_unmapped_slug: ${key.slice(0, 60)}` };
};
