/**
 * Cologne ("Sag's uns" Anliegenmanagement) service_code -> hazard_type map.
 *
 * Built from the full live taxonomy (42 services, fetched 2026-08-27 from
 * https://sags-uns.stadt-koeln.de/georeport/v2/services.json), NOT from a
 * sample. Keyed on `service_code` rather than `service_name` because the code
 * is stable while the German label is presentation text that can be reworded.
 *
 * This table is the review gate. Everything mapped to a concrete hazard type
 * auto-publishes, so the human review that matters happens HERE, in code
 * review — once — rather than on ~215 items a week forever.
 *
 * Three outcomes:
 *   - a hazard type + English phrase -> auto-publish candidate
 *   - 'irrelevant' -> dropped before the model (saves cost and review load)
 *   - 'llm'        -> genuinely ambiguous; read the free text
 *
 * Each mapped entry carries its own `summary` because the deterministic path
 * never calls the model. The source's own text is unusable as a description:
 * it is German, and Cologne's `title` field is `#<id> <service_name>`, so
 * deriving from it yields "Kfz-Ampel defekt — #19078-2026 Kfz-Ampel defekt".
 * These phrases are written from the RIDER's point of view — what they will
 * encounter — not the municipal category name.
 *
 * IMPORTANT: `construction` is NOT a valid hazard_type. It was removed from
 * hazards_hazard_type_check by migration 202604210003 (swapped for
 * `aggro_dogs`); inserting it returns 400. Roadworks therefore map to
 * `narrow_street`, which is also the more accurate description of what a
 * roadworks site actually does to a rider: it takes away usable width.
 */
import type { ImportableHazardType, MappingOutcome } from '../types';

type MapEntry =
  | 'irrelevant'
  | 'llm'
  | { readonly type: ImportableHazardType; readonly summary: string };

export const KOLN_SERVICE_MAP: Readonly<Record<string, MapEntry>> = {
  // ── 1. Stadtbild (streetscape) ──────────────────────────────────────────
  '1': 'llm', // generic parent — a reporter who picked no subcategory
  '1.1': 'irrelevant', // Wilder Müll — fly-tipping. Highest-volume category
  //                      (~30% of all reports) and overwhelmingly not a
  //                      riding hazard. Dropping it pre-model is most of the
  //                      cost and review-load saving in this table.
  '1.2': 'irrelevant', // Graffiti
  '1.3': 'irrelevant', // Altkleidercontainer (clothing banks)
  '1.3.1': 'irrelevant',
  '1.3.2': 'irrelevant',
  '1.3.3': 'irrelevant',
  '1.3.4': 'irrelevant',
  '1.4': 'irrelevant', // Glascontainer
  '1.4.1': 'irrelevant',
  '1.4.2': 'irrelevant',
  '1.4.3': 'irrelevant',
  '1.5': 'irrelevant', // Schrottfahrräder — abandoned bikes: parked, not a
  //                      hazard to a moving rider.
  '1.6': {
    // Blocked drain: standing water over a grate is a classic urban-cycling
    // wheel-grabber.
    type: 'poor_surface',
    summary: 'Blocked drain reported here — expect standing water or a fouled grate.',
  },
  '1.7': 'irrelevant', // Sexistische Werbung
  '1.7.1': 'irrelevant',
  '1.7.2': 'irrelevant',

  // ── 2. Straßen und Verkehrsanlagen (roads and traffic installations) ────
  '2': 'llm',
  '2.1': 'llm', // Ampelanlage parent — could be any signal fault

  '2.1.1': {
    type: 'dangerous_intersection',
    summary: 'Pedestrian signal reported faulty at this crossing — expect unpredictable crossing traffic.',
  },
  '2.1.2': {
    // A broken CYCLIST signal — the single most on-target category here.
    type: 'dangerous_intersection',
    summary: 'Cyclist traffic signal reported faulty at this junction.',
  },
  '2.1.3': {
    type: 'dangerous_intersection',
    summary: 'Traffic signal reported faulty at this junction — approach expecting drivers to behave unpredictably.',
  },
  '2.1.4': 'irrelevant', // Zu lange Rotzeit — annoyance, not danger
  '2.1.5': 'irrelevant', // Zu kurze Grünzeit
  '2.1.6': {
    // Inter-green clearance too short: a real conflict risk, unlike 2.1.4/5.
    type: 'dangerous_intersection',
    summary: 'Signal clearance time reported too short at this junction — you may still be crossing when other traffic gets a green.',
  },
  '2.1.7': 'irrelevant', // Keine grüne Welle

  '2.2': 'irrelevant', // Parkscheinautomat defekt — ticket machine
  '2.3': 'llm', // Schrott-Kfz — an abandoned vehicle may or may not block a
  //               bike lane. Cheap to let the model read the text.

  '2.4': 'llm', // "Straßen-, Geh- und RADWEGSCHÄDEN" — explicitly includes
  //               cycle-path damage, but the parent gives no detail.
  '2.4.1': 'llm', // Straßenmarkierung — faded bike-lane markings mean
  //                 missing_bike_lane; faded parking bays are irrelevant.
  '2.4.2': 'llm', // Defekte Verkehrszeichen — depends entirely which sign
  '2.4.3': {
    type: 'poor_surface',
    summary: 'Damaged road surface reported here.',
  },

  '2.5': {
    // See header note: `construction` is not a valid hazard_type, and
    // narrow_street describes the actual rider-facing effect.
    type: 'narrow_street',
    summary: 'Roadworks reported here — the carriageway may be narrowed or partly closed.',
  },

  '2.6': 'irrelevant', // Straßenbeleuchtung parent. Broken lighting IS a
  '2.6.1': 'irrelevant', // night-cycling safety issue, but the hazard_type
  '2.6.2': 'irrelevant', // enum cannot express it — mapping to `other` would
  '2.6.3': 'irrelevant', // put an unactionable pin on the map.

  '2.7': {
    // Chicane barriers placed ON cycle paths specifically to slow riders.
    type: 'narrow_street',
    summary: 'Chicane barrier or bollard squeeze reported on the cycle path here.',
  },

  // ── 3. Spielplätze und Grünanlagen (playgrounds and parks) ──────────────
  '3': 'irrelevant',
  '3.1': 'irrelevant', // Brunnen
  '3.2': 'irrelevant', // Kölner Grün
  '3.3': 'irrelevant', // Spiel- und Bolzplätze
};

/**
 * Resolve a Cologne service_code to a mapping outcome.
 *
 * Unknown codes fall through to 'llm' rather than 'irrelevant': the city adds
 * categories over time, and a new one silently vanishing is worse than a few
 * cents of model spend. Falls back to the parent code first (a new `2.4.4`
 * inherits `2.4`'s treatment before being treated as wholly unknown).
 */
export const resolveKolnMapping = (serviceCode: string | null | undefined): MappingOutcome => {
  const code = (serviceCode ?? '').trim();
  if (!code) return { kind: 'llm' };

  const direct = KOLN_SERVICE_MAP[code];
  if (direct) return toOutcome(direct);

  // Walk up: '2.4.4' -> '2.4' -> '2'
  const parts = code.split('.');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const parent = parts.slice(0, i).join('.');
    const inherited = KOLN_SERVICE_MAP[parent];
    if (inherited) return toOutcome(inherited);
  }

  return { kind: 'llm' };
};

const toOutcome = (value: MapEntry): MappingOutcome => {
  if (value === 'irrelevant') return { kind: 'irrelevant' };
  if (value === 'llm') return { kind: 'llm' };
  return { kind: 'type', hazardType: value.type, summaryEn: value.summary };
};
