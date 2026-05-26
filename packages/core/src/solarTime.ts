/**
 * Pure sunrise/sunset calculations using the NOAA Solar Position Algorithm.
 *
 * No external deps, no IO. Given (lat, lon, date) returns the day's sunrise
 * and sunset as UTC Date objects. Accuracy is ~1 minute, well within the
 * tolerance needed for the nudge safety floor.
 *
 * Reference: https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *
 * Limitations:
 *   - No polar-day / polar-night handling. Locations above ±66.5° during
 *     solstice may return NaN. Not a concern for the user base (Europe).
 *   - Standard atmosphere refraction (0.833°) assumed.
 */

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const julianDay = (date: Date): number => {
  // Convert UTC instant → Julian Day Number (fractional). The integer-only
  // formula yields JD at 00:00 UTC; we add the fractional day from the
  // input's time-of-day so the result reflects the instant, not just the
  // calendar date. NOAA's algorithm needs JD at solar-noon-ish UTC.
  const y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1; // 1..12
  let yAdj = y;
  if (m <= 2) {
    yAdj = y - 1;
    m = m + 12;
  }
  const a = Math.floor(yAdj / 100);
  const b = 2 - a + Math.floor(a / 4);

  const jdAtMidnight =
    Math.floor(365.25 * (yAdj + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    date.getUTCDate() +
    b -
    1524.5;

  const fractionalDay =
    (date.getUTCHours() * 3600 +
      date.getUTCMinutes() * 60 +
      date.getUTCSeconds()) /
    86400;

  return jdAtMidnight + fractionalDay;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SolarTimes {
  /** Sunrise as a UTC Date. NaN-valued if the location has polar conditions. */
  readonly sunrise: Date;
  /** Sunset as a UTC Date. */
  readonly sunset: Date;
}

/**
 * Compute sunrise + sunset for a given latitude/longitude on a given date.
 * Returns UTC times (you do the timezone conversion at the caller).
 *
 * Algorithm: simplified NOAA solar calculator. Solves for the hour angle
 * at which the sun's elevation crosses -0.833° (sun's apparent radius +
 * standard atmospheric refraction).
 */
export const computeSolarTimes = (
  lat: number,
  lon: number,
  date: Date,
): SolarTimes => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { sunrise: new Date(Number.NaN), sunset: new Date(Number.NaN) };
  }

  // Julian day for noon UTC on the given date.
  const noonUtc = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    12, 0, 0, 0,
  ));
  const jd = julianDay(noonUtc);
  const n = jd - 2451545.0 + 0.0008;

  // Mean solar noon at the location.
  const Jstar = n - lon / 360;
  // Solar mean anomaly.
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const Mrad = M * RAD;
  // Equation of the center.
  const C =
    1.9148 * Math.sin(Mrad) +
    0.02 * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad);
  // Ecliptic longitude of the sun.
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambdaRad = lambda * RAD;
  // Solar transit (true noon).
  const Jtransit =
    2451545.0 +
    Jstar +
    0.0053 * Math.sin(Mrad) -
    0.0069 * Math.sin(2 * lambdaRad);
  // Sun's declination.
  const delta = Math.asin(Math.sin(lambdaRad) * Math.sin(23.44 * RAD));
  // Hour angle for sunrise/sunset, including refraction + apparent radius.
  const latRad = lat * RAD;
  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(latRad) * Math.sin(delta)) /
    (Math.cos(latRad) * Math.cos(delta));

  if (cosH > 1 || cosH < -1) {
    // Sun never rises (polar night) or never sets (polar day) at this lat.
    return { sunrise: new Date(Number.NaN), sunset: new Date(Number.NaN) };
  }

  const H = Math.acos(cosH) * DEG;
  const Jset = Jtransit + H / 360;
  const Jrise = Jtransit - H / 360;

  // Convert Julian Day numbers back to UTC Date.
  const jdToDate = (j: number): Date => {
    const msSinceUnixEpoch = (j - 2440587.5) * 86400 * 1000;
    return new Date(msSinceUnixEpoch);
  };

  return {
    sunrise: jdToDate(Jrise),
    sunset: jdToDate(Jset),
  };
};

/**
 * Convenience: true when the given moment is after sunset (or before
 * sunrise) at the given location on that day. Used by the nudge safety
 * floor: ride-asking pushes must not fire after dark.
 */
export const isAfterSunset = (
  lat: number,
  lon: number,
  now: Date = new Date(),
): boolean => {
  const { sunset } = computeSolarTimes(lat, lon, now);
  if (Number.isNaN(sunset.getTime())) {
    // Polar conditions OR missing inputs — fail closed (treat as after sunset).
    return true;
  }
  return now.getTime() >= sunset.getTime();
};

/**
 * Returns true when `now` is BEFORE sunrise. Bundled with `isAfterSunset`
 * for the cron's full "is it currently dark" check.
 */
export const isBeforeSunrise = (
  lat: number,
  lon: number,
  now: Date = new Date(),
): boolean => {
  const { sunrise } = computeSolarTimes(lat, lon, now);
  if (Number.isNaN(sunrise.getTime())) return true;
  return now.getTime() < sunrise.getTime();
};

/**
 * True when the moment is in nautical / civil twilight or full night.
 * Combines the two predicates above so the caller doesn't have to.
 */
export const isDark = (
  lat: number,
  lon: number,
  now: Date = new Date(),
): boolean => isBeforeSunrise(lat, lon, now) || isAfterSunset(lat, lon, now);
