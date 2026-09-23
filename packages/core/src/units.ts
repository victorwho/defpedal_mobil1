/**
 * Measurement system — metric everywhere, imperial for riders who ask for it
 * (and by default for the UK, which joined coverage 2026-09-22).
 *
 * What switches, decided 2026-09-23: distance (miles), short distance and
 * climb (feet), speed including wind (mph). What does NOT switch: temperature
 * (the UK reports weather in Celsius), rider weight (kg), and CO2 (kg) — those
 * are metric in the UK too, and converting them would be wrong rather than
 * merely unfamiliar.
 *
 * Conversions are exact by definition: an international mile is 1609.344 m and
 * a foot is 0.3048 m.
 */
export type MeasurementSystem = 'metric' | 'imperial';

/** The four units a distance can be rendered in across both systems. */
export type DistanceUnit = 'm' | 'km' | 'ft' | 'mi';

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_FOOT = 0.3048;

/** Below this, imperial distance reads in feet rather than fractions of a mile. */
export const IMPERIAL_FEET_CUTOFF_METERS = METERS_PER_MILE / 10;

export const metersToMiles = (meters: number): number => meters / METERS_PER_MILE;
export const metersToFeet = (meters: number): number => meters / METERS_PER_FOOT;
export const kmhToMph = (kmh: number): number => kmh / 1.609344;

/**
 * The unit a distance of this size is rendered in. Exposed so surfaces that
 * render the number and its unit separately (the navigation HUD's big numeral,
 * the route-preview stat cells) agree with the joined form.
 */
export const distanceUnitFor = (
  meters: number,
  units: MeasurementSystem,
): DistanceUnit => {
  if (units === 'imperial') {
    return Math.abs(meters) < IMPERIAL_FEET_CUTOFF_METERS ? 'ft' : 'mi';
  }
  return Math.abs(meters) < 1000 ? 'm' : 'km';
};

/** Unit label for a climb or an altitude — never abbreviates to miles. */
export const elevationUnitFor = (units: MeasurementSystem): 'm' | 'ft' =>
  units === 'imperial' ? 'ft' : 'm';

export const speedUnitFor = (units: MeasurementSystem): 'km/h' | 'mph' =>
  units === 'imperial' ? 'mph' : 'km/h';

/**
 * Distance value WITHOUT its unit, rounded the way that unit deserves:
 * whole metres, whole tens of feet (a rider cannot place a single foot at
 * speed), one decimal for km and miles.
 */
export const distanceValueIn = (
  meters: number,
  unit: DistanceUnit,
): string => {
  switch (unit) {
    case 'm':
      return `${Math.round(meters)}`;
    case 'km':
      return (meters / 1000).toFixed(1);
    case 'ft':
      return `${Math.round(metersToFeet(meters) / 10) * 10}`;
    case 'mi':
      return metersToMiles(meters).toFixed(1);
  }
};
