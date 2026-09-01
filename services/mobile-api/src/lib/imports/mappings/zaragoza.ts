/**
 * Zaragoza (Open311 "Quejas y Sugerencias") service_code -> hazard_type map.
 *
 * Built from the full live taxonomy (100 services, fetched 2026-09-01 from
 * https://www.zaragoza.es/api/recurso/open311/services.json), NOT a sample.
 *
 * Keyed on `service_code`. Note Zaragoza returns the code as a JSON NUMBER,
 * which the adapter coerces to a string — see `toTrimmedString` in
 * adapters/open311.ts and the regression test that pins it. Before that fix
 * every Zaragoza row was silently dropped.
 *
 * The taxonomy is flat but semantically two-level: a parent names the object
 * and a child names the defect, e.g. Calzada(60) -> Bache(61), Deteriorada(62),
 * Grietas(63); Acera(10) -> Bache(11), Deteriorada(12), Elevada(13),
 * Hundida(14). Codes are NOT dotted, so there is no parent to walk up to — an
 * unmapped code therefore goes to human review rather than being guessed.
 *
 * This table is the review gate. Everything mapped to a concrete hazard type
 * auto-publishes, so the human review that matters happens HERE, once, in code
 * review.
 */
import type { ImportableHazardType, MappingOutcome } from '../types';

type MapEntry =
  | 'irrelevant'
  | 'llm'
  | { readonly type: ImportableHazardType; readonly summary: string };

export const ZARAGOZA_SERVICE_MAP: Readonly<Record<string, MapEntry>> = {
  // ── Holes in the riding surface ─────────────────────────────────────────
  // A missing or sunken manhole cover is the same thing to a wheel as a
  // pothole, and considerably more dangerous, so both land on `pothole`.
  '11': { type: 'pothole', summary: 'Pothole in the pavement' },
  '61': { type: 'pothole', summary: 'Pothole in the roadway' },
  '81': { type: 'pothole', summary: 'Missing manhole cover — open hole in the surface' },
  '93': { type: 'pothole', summary: 'Missing inspection-chamber lid — open hole in the surface' },
  '83': { type: 'pothole', summary: 'Sunken manhole cover' },

  // ── Degraded but continuous surface ─────────────────────────────────────
  '12': { type: 'poor_surface', summary: 'Damaged pavement surface' },
  '13': { type: 'poor_surface', summary: 'Raised, uneven pavement' },
  '14': { type: 'poor_surface', summary: 'Sunken, uneven pavement' },
  '20': { type: 'poor_surface', summary: 'Broken or missing paving slabs' },
  '21': { type: 'poor_surface', summary: 'Missing paving slabs' },
  '22': { type: 'poor_surface', summary: 'Broken paving slabs' },
  '31': { type: 'poor_surface', summary: 'Broken kerb' },
  '50': { type: 'poor_surface', summary: 'Cobbles in poor condition' },
  '51': { type: 'poor_surface', summary: 'Loose cobbles — unstable under a wheel' },
  '62': { type: 'poor_surface', summary: 'Damaged roadway surface' },
  '63': { type: 'poor_surface', summary: 'Cracked roadway surface' },
  '94': { type: 'poor_surface', summary: 'Defective inspection chamber in the surface' },
  '262': { type: 'poor_surface', summary: 'Ice reported on the public road' },
  '1000023': { type: 'poor_surface', summary: 'Oil or grease spill on the road — slippery' },

  // ── Junctions ───────────────────────────────────────────────────────────
  '103677952': {
    type: 'dangerous_intersection',
    summary: 'Traffic-signal fault reported at this junction',
  },

  // ── Ambiguous: read the free text ───────────────────────────────────────
  // Generic parents (the reporter picked no defect) and categories whose
  // meaning genuinely varies per report.
  '10': 'llm', // Acera — parent
  '30': 'llm', // Bordillos — parent
  '60': 'llm', // Calzada — parent
  '80': 'llm', // Tapa — parent
  '85': 'llm', // Puentes deteriorados — may or may not affect the deck
  '330': 'llm', // Otros
  '7733248': 'llm', // Movilidad Urbana — parent
  '1000007': 'llm', // Movilidad Urbana: Señalización — signage complaints vary
  // Bicicletas looks like a jackpot and is not one: the sampled report was a
  // long prose POLICY SUGGESTION about network planning, with a null location
  // (2026-09-01). Route it to the model, which will mark the suggestions
  // irrelevant and keep any that describe an actual obstruction.
  '9043969': 'llm',

  // ── Not a riding hazard ─────────────────────────────────────────────────
  '32': 'irrelevant', // Bordillos sin rebajar — accessibility, not a hazard
  '40': 'irrelevant', // Barandillas
  '41': 'irrelevant',
  '70': 'irrelevant', // Hitos (bollards)
  '71': 'irrelevant',
  '82': 'irrelevant', // Tapa que hace ruido
  '87': 'irrelevant', // Rampa para acceso
  '90': 'irrelevant', // Lighting. Real at night, but a pin cannot be scoped to
  '91': 'irrelevant', // darkness and an always-on "dark here" marker is noise
  '92': 'irrelevant', // on a daytime ride. Same call as the Civia map.
  '95': 'irrelevant',
  '96': 'irrelevant',
  '97': 'irrelevant',
  '98': 'irrelevant', // Cables colgando
  '99': 'irrelevant',
  '5144577': 'irrelevant', // Alumbrado Público — parent
  '180': 'irrelevant', // Césped, arbustos, flor
  '212': 'irrelevant', // Cubos
  '222': 'irrelevant',
  '223': 'irrelevant',
  '224': 'irrelevant',
  '225': 'irrelevant',
  '231': 'irrelevant',
  '233': 'irrelevant',
  '234': 'irrelevant', // Basura abandonada
  '235': 'irrelevant', // Animales muertos
  '236': 'irrelevant',
  '252': 'irrelevant',
  '253': 'irrelevant',
  '254': 'irrelevant', // Pintadas y grafitis
  '255': 'irrelevant',
  '256': 'irrelevant',
  '258': 'irrelevant',
  '263': 'irrelevant',
  '291': 'irrelevant',
  '292': 'irrelevant',
  '310': 'irrelevant', // Filtración o salida de agua
  '320': 'irrelevant',
  '401': 'irrelevant',
  '402': 'irrelevant',
  '422': 'irrelevant',
  '97550336': 'irrelevant', // Transporte Público
  '97779712': 'irrelevant', // Estacionamiento Regulado — paid-parking admin
  '4849672': 'irrelevant', // Limpieza Pública
  '4849673': 'irrelevant', // Medioambiente
  '4849668': 'irrelevant',
  '4849665': 'irrelevant',
  '5144576': 'irrelevant', // Instalaciones Deportivas
  '5472256': 'irrelevant',
  '5931009': 'irrelevant',
  '6029312': 'irrelevant',
  '9043968': 'irrelevant', // Cultura
  '24182784': 'irrelevant',
  '30009': 'irrelevant',
  '30010': 'irrelevant',
  '40000': 'irrelevant',
  '82182145': 'irrelevant',
  '82182147': 'irrelevant',
  '102793216': 'irrelevant',
  '188088321': 'irrelevant',
  '4784129': 'irrelevant',
  '1000001': 'irrelevant',
  '1000002': 'irrelevant',
  '1000011': 'irrelevant',
  '1000012': 'irrelevant',
  '1000013': 'irrelevant',
  '1000014': 'irrelevant',
  '1000015': 'irrelevant',
  '1000016': 'irrelevant',
  '1000024': 'irrelevant',
};

const toOutcome = (entry: MapEntry): MappingOutcome => {
  if (entry === 'irrelevant') return { kind: 'irrelevant' };
  if (entry === 'llm') return { kind: 'llm' };
  return { kind: 'type', hazardType: entry.type, summaryEn: entry.summary };
};

/**
 * Resolve a Zaragoza service_code.
 *
 * Unknown codes go to `review`, not `irrelevant`: the codes are flat integers
 * with no parent to inherit from, so an unrecognised one cannot be resolved
 * structurally, and dropping it silently would hide any category the city
 * adds. A human reads it once and extends the table.
 */
export const resolveZaragozaMapping = (
  serviceCode: string | null | undefined,
): MappingOutcome => {
  const code = (serviceCode ?? '').trim();
  if (!code) return { kind: 'llm' };

  const direct = ZARAGOZA_SERVICE_MAP[code];
  if (direct) return toOutcome(direct);

  return {
    kind: 'review',
    reason: `Unmapped Zaragoza service_code "${code}" — add it to ZARAGOZA_SERVICE_MAP`,
  };
};
