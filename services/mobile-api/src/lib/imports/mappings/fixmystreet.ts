/**
 * FixMyStreet (mySociety, UK-wide) -> hazard_type, plus per-council expiry.
 *
 * Unlike Cologne or Zaragoza there is no single taxonomy to key on: every
 * council names its own categories ("Pothole", "Potholes", "Pothole on a road -
 * More than 150mm wide and 40mm deep", "TMC - Defects -CW6 Potholes"), so the
 * map is a set of rules over the category name, checked against a full week
 * (21,918 reports) and then two months (193,988) of live data on 2026-10-12/13.
 *
 * Three outcomes, as for every source:
 *   - a hazard type + English phrase: road potholes and road-surface defects,
 *     the two groups that read correctly on manual sampling;
 *   - 'llm': categories that mix road and pavement or private property
 *     (vegetation, obstructions, roadworks, signals, cycle paths, parking that
 *     mentions a cycle lane) — the model reads the text;
 *   - 'irrelevant': everything else.
 *
 * Traps each rule exists for, all seen in the live data:
 *   - Councils file pavement defects under road-sounding names. "Slabs",
 *     "Trip hazard/uneven surface" and "TMC - Defects -FW6 Potholes" (FW =
 *     footway) are pavement; a pothole there is not a riding hazard.
 *   - "Abandoned Lime bike or scooter" matches any naive "bike" rule. Hire
 *     bikes left on the pavement are litter, not a cycling hazard.
 *   - "Damaged road sign" matches a naive "road damage" rule.
 *   - Most parking reports are about blocked driveways or garages.
 *   - A bare "Other" is too broad to send to the model in bulk (~400 a week),
 *     so it falls through to irrelevant. "Other road surface issue" and
 *     "Other Traffic Signals issue" are NOT bare and match their own rules —
 *     which is why there is no \bother\b in the irrelevant pattern.
 */
import type { MappingOutcome, RawReport } from '../types';

const IRRELEVANT_CATEGORY =
  /abandon|fly.?tip|graffiti|litter|\bbins?\b|refuse|recycl|dog foul|street ?light|lamp|lighting|noise|street name|name ?plate|bus shelter|bench|toilet|play ?area|playground|grass|weed|\bsigns?\b|signage|bike rack|cycle rack|racks|estates|tree preserv|private|dead animal|needle|syringe/;
const CYCLE_CATEGORY = /cycle|bike|bicycle/;
const FOOTWAY_CATEGORY = /pavement|footway|footpath|sidewalk|slabs?\b|trip hazard|kerb|\bfw\d|\bf\/w\b/;
const ROAD_IN_CATEGORY = /\broad\b|carriageway|\bcw\d/;
const POTHOLE = /pothole/;
const SURFACE =
  /road surface|carriageway|uneven|surface defect|road defect|damage to road|road damage|damaged road(?! sign)|manhole|ironwork|drain cover|gull(y|ies)|drain|flood|standing water|debris|glass|spillage|\bspill\b|mud on|\bmud\b|\boil\b|diesel|subsidence/;
const OBSTRUCTION = /roadworks|road works|obstruct|overhang|overgrown|vegetation|hedge|branch|\btrees?\b/;
const SIGNALS = /traffic signal|traffic light|signals/;
const PARKING = /parking|parked/;

const FOOTWAY_TEXT = /\bf\/?w\b|\bfw\d|footway|pavement|footpath/;
/**
 * Evidence that a report is about the riding surface. NOT the bare word
 * "road": most UK street names contain it ("Pavement outside 12 Station
 * Road"), which made every pavement report read as a road one. Likewise
 * "lane", "junction" and "traffic", which name places rather than surfaces.
 */
const ROAD_TEXT =
  /carriageway|\bcw\d|roadway|\b(in|on|across|into|onto|middle of|side of|edge of) the road\b|cycl|bike/;
const CYCLE_LANE_TEXT = /(bike|cycle) ?(lane|way|path|track)/;

const textOf = (report: RawReport): string =>
  `${report.title ?? ''} ${report.description ?? ''}`.toLowerCase();

const categoryOf = (report: RawReport): string =>
  `${report.categoryLabel} ${report.categoryKey}`.toLowerCase();

const surfaceSummary = (category: string, text: string): string => {
  const both = `${category} ${text}`;
  if (/manhole|ironwork|drain cover|\bcover\b/.test(both)) {
    return 'Damaged or loose manhole or drain cover in the road';
  }
  if (/gull(y|ies)|drain|flood|standing water/.test(both)) {
    return 'Blocked drain at the road edge; water may pool on the road';
  }
  if (/debris|glass|spill|mud|\boil\b|diesel|grit|gravel/.test(both)) {
    return 'Debris or spillage on the road surface';
  }
  return 'Broken or uneven road surface';
};

/** Pavement-only report: the text talks about the footway and never the road. */
const isFootwayOnly = (text: string): boolean =>
  FOOTWAY_TEXT.test(text) && !ROAD_TEXT.test(text);

export const resolveFixMyStreetMapping = (report: RawReport): MappingOutcome => {
  const category = categoryOf(report);
  const text = textOf(report);

  if (IRRELEVANT_CATEGORY.test(category)) return { kind: 'irrelevant' };

  if (POTHOLE.test(category)) {
    // A cycleway pothole ("Pothole on road/cycleway") is a riding hazard;
    // a footway pothole ("FW6 Potholes") is not.
    if (CYCLE_CATEGORY.test(category) && !ROAD_IN_CATEGORY.test(category)) return { kind: 'llm' };
    if (FOOTWAY_CATEGORY.test(category) && !ROAD_IN_CATEGORY.test(category)) {
      return { kind: 'irrelevant' };
    }
    if (isFootwayOnly(text)) return { kind: 'irrelevant' };
    return { kind: 'type', hazardType: 'pothole', summaryEn: 'Pothole in the road' };
  }

  // "Pavement and Cycle path", "Public footpath or cyclepath": mixed, so read.
  if (CYCLE_CATEGORY.test(category)) return { kind: 'llm' };

  // "Road and pavement defects": mixed, so read rather than drop.
  if (FOOTWAY_CATEGORY.test(category)) {
    return ROAD_IN_CATEGORY.test(category) ? { kind: 'llm' } : { kind: 'irrelevant' };
  }

  if (SURFACE.test(category)) {
    if (isFootwayOnly(text)) return { kind: 'irrelevant' };
    return {
      kind: 'type',
      hazardType: 'poor_surface',
      summaryEn: surfaceSummary(category, text),
    };
  }

  if (OBSTRUCTION.test(category) || SIGNALS.test(category)) return { kind: 'llm' };

  // Parking is almost always a driveway or a garage. Only a cycle lane makes it
  // a riding hazard, and then the model decides.
  if (PARKING.test(category)) {
    return CYCLE_LANE_TEXT.test(text) ? { kind: 'llm' } : { kind: 'irrelevant' };
  }

  return { kind: 'irrelevant' };
};

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/**
 * Councils whose FixMyStreet reports are reliably CLOSED when dealt with, so
 * an open report means an unfixed hazard. Measured 2026-10-12 over two months
 * of reports: at least 25% of cycling-relevant reports aged 4+ weeks closed,
 * with closures taking days rather than minutes. Matched against
 * `agency_responsible.recipient[0]`.
 *
 * Membership sets only how long an OPEN report may live (8 weeks here, 4
 * elsewhere). A closed report is never published and a re-seen closed one is
 * expired, for every council.
 *
 * Dumfries and Galloway Council is deliberately ABSENT although it passed the
 * threshold: it closes 60% of reports within a day, i.e. on receipt, so an
 * open report there is merely not yet acknowledged and gets the short timer.
 */
export const FIXMYSTREET_CLOSING_COUNCILS: ReadonlySet<string> = new Set([
  'Aberdeenshire Council',
  'Barnet Borough Council',
  'Bath and North East Somerset Council',
  'Brent Council',
  'Bristol City Council',
  'Bromley Council',
  'Buckinghamshire Council',
  'Camden Borough Council',
  'Cardiff Council',
  'Central Bedfordshire Council',
  'Dudley Borough Council',
  'East Sussex County Council',
  'Enfield Council',
  'Gloucester City Council',
  'Gloucestershire County Council',
  'Hackney Council',
  'Hampshire County Council',
  'Highland Council',
  'Hounslow Highways',
  'Isle of Wight Council',
  'Lincolnshire County Council',
  'London Borough of Bexley',
  'Merton Council',
  'National Highways',
  'North Northamptonshire Council',
  'Northumberland County Council',
  'Oxfordshire County Council',
  'Peterborough City Council',
  'Royal Borough of Greenwich',
  'Rutland County Council',
  'Shropshire Council',
  'Southwark Council',
  'Surrey County Council',
  'TfL',
  'West Northamptonshire Council',
]);

/**
 * Where status is trustworthy a hazard lives until FixMyStreet marks it closed
 * (the sweep expires it) or until it is 8 weeks old. Everywhere else — councils
 * that rarely or never close reports, Dumfries and Galloway, and councils with
 * too few reports to judge — "open" means nothing, so a timer decides.
 */
export const CLOSING_COUNCIL_MAX_AGE_DAYS = 56;
export const TIMER_COUNCIL_MAX_AGE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export const councilOf = (raw: unknown): string | null => {
  const agency = (raw as { agency_responsible?: { recipient?: unknown } } | null)
    ?.agency_responsible?.recipient;
  const first = Array.isArray(agency) ? agency[0] : agency;
  return typeof first === 'string' && first.trim() ? first.trim() : null;
};

/**
 * Expiry for one report, from its REPORT date (not the import date): an old
 * open report at a silent council must not get a fresh four weeks on arrival.
 * Returns null when the report date is unknown — the caller then falls back to
 * the source's backstop TTL.
 */
export const fixMyStreetExpiresAt = (report: RawReport): string | null => {
  if (!report.reportedAt) return null;
  const reported = Date.parse(report.reportedAt);
  if (Number.isNaN(reported)) return null;
  const council = councilOf(report.raw);
  const days =
    council && FIXMYSTREET_CLOSING_COUNCILS.has(council)
      ? CLOSING_COUNCIL_MAX_AGE_DAYS
      : TIMER_COUNCIL_MAX_AGE_DAYS;
  return new Date(reported + days * DAY_MS).toISOString();
};
