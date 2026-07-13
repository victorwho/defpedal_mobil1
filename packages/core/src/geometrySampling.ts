/**
 * Uniform coordinate downsampling for oversized route geometries.
 *
 * Motivation (Sentry 2026-07-12, `FST_ERR_CTP_BODY_TOO_LARGE` on
 * `POST /v1/risk-segments`): with EU-wide routing, a long cross-country
 * route can carry hundreds of thousands of geometry points — the raw
 * GeoJSON body blows past Fastify's 1 MiB default limit, and even when
 * accepted it turns the PostGIS risk-matching RPC into a cost bomb. Risk
 * overlay matching does not need meter-level fidelity, so both the client
 * (before POSTing) and the server (before the RPC) cap the point count
 * with this helper.
 */

/**
 * Reduce `coords` to at most `maxPoints` by uniform stride, always keeping
 * the exact first and last points. Returns the ORIGINAL array (same
 * reference) when it is already within the cap, so the common case
 * allocates nothing.
 */
export const downsampleCoordinates = <T>(
  coords: readonly T[],
  maxPoints: number,
): readonly T[] => {
  // Non-finite cap = caller bug; degrade to "no downsampling" rather than
  // silently returning a corrupt 1-point array (NaN poisons the stride
  // loop condition so only the final push would execute).
  if (!Number.isFinite(maxPoints)) {
    return coords;
  }

  if (coords.length <= maxPoints || coords.length <= 2) {
    return coords;
  }

  // At least the two endpoints survive, whatever the cap says.
  const target = Math.max(2, Math.floor(maxPoints));
  const lastIndex = coords.length - 1;
  const step = lastIndex / (target - 1);

  const sampled: T[] = [];
  for (let i = 0; i < target - 1; i += 1) {
    sampled.push(coords[Math.round(i * step)]);
  }
  sampled.push(coords[lastIndex]);

  return sampled;
};
