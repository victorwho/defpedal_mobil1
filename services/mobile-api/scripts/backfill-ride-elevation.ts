/**
 * Backfill `ride_impacts.elevation_gain_m`.
 *
 * The column has been 0 on every row since the table existed: the impact
 * endpoint accepted `elevationGainM` from the client and no client ever sent
 * it. The endpoint now derives the climb server-side from the ride's geometry
 * (see lib/rideElevation.ts), but only for impacts written after that shipped.
 * This walks the rides that were recorded before it and fills them in.
 *
 * Dry by default. Nothing is written without `--apply`.
 *
 *   npx tsx scripts/backfill-ride-elevation.ts              # report only
 *   npx tsx scripts/backfill-ride-elevation.ts --apply
 *   npx tsx scripts/backfill-ride-elevation.ts --apply --limit 25
 *
 * Safe to re-run: it only ever selects rows still sitting at 0, so an
 * interrupted run resumes where it stopped and a completed run becomes a no-op.
 * Elevation comes from Mapbox Terrain-RGB tiles, so this costs tile requests —
 * hence the small concurrency and the --limit escape hatch.
 */
import { createClient } from '@supabase/supabase-js';

import { config } from '../src/config';
import { getElevationGain } from '../src/lib/elevation';
import { rideElevationCoordinates } from '../src/lib/rideElevation';

/** Matches the ceiling the impact endpoint's request schema enforces. */
const MAX_ELEVATION_GAIN_M = 10_000;
/** Gentle on the tile API; the whole backfill is a few hundred rides. */
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitFlag = args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(args[limitFlag + 1]) : Infinity;

const supabaseUrl = config.supabaseUrl;
const serviceRoleKey = config.supabaseServiceRoleKey;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (services/mobile-api/.env).');
  process.exit(1);
}
if (!config.mapboxAccessToken) {
  console.error('MAPBOX_ACCESS_TOKEN must be set — elevation reads Terrain-RGB tiles.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

/** Page through a table; PostgREST caps a single response at 1000 rows. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

type ImpactRow = { id: string; trip_id: string | null; elevation_gain_m: number | null };
type TrackRow = { trip_id: string | null; gps_trail: unknown; planned_route_polyline6: string | null };

async function main(): Promise<void> {
  const impacts = await fetchAll<ImpactRow>((from, to) =>
    supabase
      .from('ride_impacts')
      .select('id, trip_id, elevation_gain_m')
      .or('elevation_gain_m.is.null,elevation_gain_m.eq.0')
      .not('trip_id', 'is', null)
      .order('id')
      .range(from, to),
  );

  const tracks = await fetchAll<TrackRow>((from, to) =>
    supabase
      .from('trip_tracks')
      .select('trip_id, gps_trail, planned_route_polyline6')
      .order('id')
      .range(from, to),
  );
  const trackByTrip = new Map<string, TrackRow>();
  for (const track of tracks) {
    if (track.trip_id) trackByTrip.set(track.trip_id, track);
  }

  // A trip with no track can still carry the route it planned.
  const tripGeometry = await fetchAll<{ id: string; planned_route_polyline6: string | null }>((from, to) =>
    supabase.from('trips').select('id, planned_route_polyline6').order('id').range(from, to),
  );
  const plannedByTrip = new Map(tripGeometry.map((t) => [t.id, t.planned_route_polyline6]));

  const candidates = impacts.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`${impacts.length} impact rows at 0; processing ${candidates.length}`);
  console.log(apply ? 'MODE: apply (writes)\n' : 'MODE: dry run — pass --apply to write\n');

  let measured = 0;
  let noGeometry = 0;
  let zeroGain = 0;
  let failed = 0;
  let written = 0;
  const gains: number[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const track = row.trip_id ? trackByTrip.get(row.trip_id) : undefined;
      const planned = track?.planned_route_polyline6 ?? (row.trip_id ? plannedByTrip.get(row.trip_id) : null);
      const coordinates = rideElevationCoordinates(
        Array.isArray(track?.gps_trail) ? (track?.gps_trail as unknown[]) : null,
        planned ?? null,
      );

      if (coordinates.length < 2) {
        noGeometry++;
        continue;
      }

      try {
        const { elevationGain } = await getElevationGain(coordinates);
        if (!Number.isFinite(elevationGain) || elevationGain < 0) {
          failed++;
          continue;
        }
        const gain = Math.min(Math.round(elevationGain), MAX_ELEVATION_GAIN_M);
        measured++;
        gains.push(gain);
        if (gain === 0) zeroGain++;

        if (apply && gain > 0) {
          // Re-assert the 0 guard so a concurrent write is not overwritten.
          const { error } = await supabase
            .from('ride_impacts')
            .update({ elevation_gain_m: gain })
            .eq('id', row.id)
            .or('elevation_gain_m.is.null,elevation_gain_m.eq.0');
          if (error) {
            failed++;
            console.error(`  ${row.id}: ${error.message}`);
          } else {
            written++;
          }
        }
      } catch (error) {
        failed++;
        console.error(`  ${row.id}: ${(error as Error).message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const total = gains.reduce((sum, g) => sum + g, 0);
  const sorted = [...gains].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  console.log('\n─── result ───');
  console.log(`  measured            ${measured}`);
  console.log(`  of which 0 m climb  ${zeroGain}   (flat ride, or a ride that never moved)`);
  console.log(`  no usable geometry  ${noGeometry}`);
  console.log(`  failed              ${failed}`);
  console.log(`  rows written        ${apply ? written : 0}${apply ? '' : '  (dry run)'}`);
  if (gains.length) {
    console.log(`  total climb         ${total.toLocaleString()} m`);
    console.log(`  median / max        ${median} m / ${sorted[sorted.length - 1]} m`);
  }
  if (!apply && measured > 0) {
    console.log('\nRe-run with --apply to write these.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
