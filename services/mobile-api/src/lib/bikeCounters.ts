/**
 * Municipal cycle-counter ingestion.
 *
 * Every "people cycling" number the app can produce from its own data is
 * honestly small — 822 signed-up cyclists, 552 who have ridden. Municipal
 * counters are the one source of a genuinely large figure that is still a real
 * count of real people on bicycles: Paris alone measured 1,929,105 cyclists
 * across 108 counters in seven days (verified live 2026-09-14).
 *
 * ⚠️ THIS IS NOT OUR ACTIVITY. It must never be summed with rides, folded into
 * the community card, or phrased so a rider could read it as app usage. The UI
 * labels it as Europe — which is also the honest framing because Romania
 * publishes no cyclist counters at all and essentially all our riders are
 * Romanian, so a per-city treatment would be dark for almost everyone we have.
 * See docs/research/bike-counter-availability-2026-09-14.md.
 *
 * Adding a city is a `bike_counter_sources` row whenever an adapter for its
 * platform exists — the same promise `hazard_import_sources` makes, with the
 * same caveat from error-log #98: verify a new source's field types and paging
 * against a real response before assuming "it speaks the same protocol" means
 * "it is only a registry row".
 */
import { supabaseAdmin } from './supabaseAdmin';

/** Window every source reports on. Sources reporting a different period are not comparable. */
export const COUNTER_WINDOW_DAYS = 7;

/** Per-request ceiling. These are public civic APIs; be a good citizen. */
const FETCH_TIMEOUT_MS = 30_000;

export type BikeCounterSource = {
  readonly id: string;
  readonly city: string;
  readonly country_code: string;
  readonly adapter: string;
  readonly config: Record<string, unknown>;
};

export type CounterReading = {
  readonly cyclistsCounted: number;
  readonly counterCount: number | null;
};

export type RunResult = {
  readonly fetched: number;
  readonly failed: number;
  readonly sources: readonly { id: string; ok: boolean; count?: number; error?: string }[];
};

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'DefensivePedal/1.0 (+https://defensivepedal.com)' },
    });
    // Read the body before trusting the status — error-log #117. A civic API
    // that answers 400 with a structured reason is more useful than "not ok".
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Opendatasoft Explore v2.1 (Paris, and the many portals sharing that stack).
 *
 * The aggregation is pushed SERVER-SIDE — `select=sum(...)` with a relative
 * `where` — so one request returns the headline. Downloading 16k hourly rows to
 * sum them locally would be slower, ruder to the host, and no more accurate.
 */
const fetchOpendatasoft = async (source: BikeCounterSource): Promise<CounterReading> => {
  const cfg = source.config as {
    baseUrl?: string; dataset?: string; countField?: string; dateField?: string; counterField?: string;
  };
  if (!cfg.baseUrl || !cfg.dataset || !cfg.countField || !cfg.dateField) {
    throw new Error(`source ${source.id}: incomplete opendatasoft config`);
  }

  const select = [
    `sum(${cfg.countField}) as total`,
    cfg.counterField ? `count(distinct ${cfg.counterField}) as counters` : null,
  ].filter(Boolean).join(',');

  const url =
    `${cfg.baseUrl}/${cfg.dataset}/records` +
    `?limit=1&select=${encodeURIComponent(select)}` +
    `&where=${encodeURIComponent(`${cfg.dateField}>=now(days=-${COUNTER_WINDOW_DAYS})`)}`;

  const body = (await fetchJson(url)) as { results?: { total?: number; counters?: number }[] };
  const row = body.results?.[0];
  const total = Number(row?.total ?? 0);

  // A zero is not a reading. The counters do not stop for a week, so zero means
  // the query shape broke (renamed field, changed dataset) and writing it would
  // quietly halve the headline — the failure this whole module is arranged to
  // avoid. Fail loudly instead.
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`source ${source.id}: returned no usable total (${JSON.stringify(row)})`);
  }

  return { cyclistsCounted: Math.round(total), counterCount: row?.counters ?? null };
};

/**
 * Eco-Visio — Eco-Counter's public platform, the shared backend for counters in
 * dozens of European cities. One adapter, many cities.
 *
 * ⚠️ NOT yet proven end-to-end: the host answers but a guessed `idOrganisme`
 * returned 404, so ids must be harvested per city before a source is enabled.
 * Left here so widening is "find the id, flip enabled" rather than a rebuild.
 */
const fetchEcoVisio = async (source: BikeCounterSource): Promise<CounterReading> => {
  const cfg = source.config as { baseUrl?: string; idOrganisme?: string | number | null };
  if (!cfg.baseUrl || cfg.idOrganisme === null || cfg.idOrganisme === undefined) {
    throw new Error(`source ${source.id}: idOrganisme not set — harvest it before enabling`);
  }

  const counters = (await fetchJson(
    `${cfg.baseUrl}/publicwebpageplus/${cfg.idOrganisme}`,
  )) as { idPdc?: string | number }[];
  if (!Array.isArray(counters) || counters.length === 0) {
    throw new Error(`source ${source.id}: organisation returned no counters`);
  }

  const since = new Date(Date.now() - COUNTER_WINDOW_DAYS * 86_400_000)
    .toISOString().slice(0, 10);
  let total = 0;
  for (const c of counters) {
    if (c.idPdc === undefined) continue;
    try {
      const rows = (await fetchJson(
        `${cfg.baseUrl}/publicwebpage/data/${c.idPdc}?begin=${since}&step=4`,
      )) as [string, number | null][];
      if (Array.isArray(rows)) {
        for (const row of rows) total += Number(row?.[1] ?? 0);
      }
    } catch {
      // One dead counter must not void the city. The zero-total guard below
      // still catches a wholesale failure.
    }
  }

  if (total <= 0) throw new Error(`source ${source.id}: no usable counts`);
  return { cyclistsCounted: Math.round(total), counterCount: counters.length };
};

const ADAPTERS: Record<string, (s: BikeCounterSource) => Promise<CounterReading>> = {
  opendatasoft: fetchOpendatasoft,
  ecovisio: fetchEcoVisio,
};

/**
 * Fetch every enabled source and record one reading each.
 *
 * Never throws for a single source: one city being down must not abort the
 * others, and the aggregate deliberately falls back to each source's last good
 * reading inside a grace window (see get_bike_counter_totals) so a transient
 * failure cannot make the headline sag and look like cycling collapsed.
 */
export const runBikeCounterIngest = async (): Promise<RunResult> => {
  if (!supabaseAdmin) return { fetched: 0, failed: 0, sources: [] };

  const { data, error } = await supabaseAdmin
    .from('bike_counter_sources')
    .select('id, city, country_code, adapter, config')
    .eq('enabled', true);

  if (error || !data) return { fetched: 0, failed: 0, sources: [] };

  const results: { id: string; ok: boolean; count?: number; error?: string }[] = [];
  let fetched = 0;
  let failed = 0;

  for (const row of data as unknown as BikeCounterSource[]) {
    const adapter = ADAPTERS[row.adapter];
    if (!adapter) {
      // Fail loudly rather than skipping: a source enabled with no adapter is a
      // configuration mistake, and silence is how it survives to production.
      failed += 1;
      results.push({ id: row.id, ok: false, error: `no adapter '${row.adapter}'` });
      await supabaseAdmin.from('bike_counter_sources')
        .update({ last_error: `no adapter '${row.adapter}'`, last_fetched_at: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    try {
      const reading = await adapter(row);
      await supabaseAdmin.from('bike_counter_readings').insert([{
        source_id: row.id,
        window_days: COUNTER_WINDOW_DAYS,
        cyclists_counted: reading.cyclistsCounted,
        counter_count: reading.counterCount,
      }]);
      await supabaseAdmin.from('bike_counter_sources')
        .update({ last_fetched_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      fetched += 1;
      results.push({ id: row.id, ok: true, count: reading.cyclistsCounted });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      failed += 1;
      results.push({ id: row.id, ok: false, error: message });
      await supabaseAdmin.from('bike_counter_sources')
        .update({ last_fetched_at: new Date().toISOString(), last_error: message })
        .eq('id', row.id);
    }
  }

  return { fetched, failed, sources: results };
};
