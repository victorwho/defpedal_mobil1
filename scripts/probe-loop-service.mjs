#!/usr/bin/env node
/**
 * probe-loop-service — drive POST /v1/loops over a grid of starts and
 * distances, and print what came back.
 *
 * This is the validation tool for the server-side loop rollout. Loop quality is
 * not something a unit test can settle: the tests prove the two implementations
 * agree and that the measurements are read correctly, but whether a 30 km loop
 * out of Râșnov is a ride anyone wants is a question about roads. So this asks
 * the real endpoint for real loops and puts the numbers in one table.
 *
 * Usage:
 *
 *   API_BASE_URL=https://defpedal-api-….run.app \
 *   LOOP_PROBE_TOKEN=<supabase access token> \
 *     node scripts/probe-loop-service.mjs
 *
 * Options, all optional:
 *   LOOP_PROBE_CITIES=bucharest,rasnov      subset of the built-in starts
 *   LOOP_PROBE_DISTANCES=10,20,30           km, comma separated
 *   LOOP_PROBE_TERRAIN=rolling              flat | rolling | hilly
 *   LOOP_PROBE_SURFACE=any                  paved | any | offroad
 *   LOOP_PROBE_GEOJSON=out.geojson          write every loop for visual checking
 *
 * Getting a token: sign in on a dev build and copy the Supabase access token
 * from Diagnostics, or mint one with the Supabase CLI. An anonymous session
 * works — the endpoint accepts one, like the risk overlay does.
 *
 * The GeoJSON output is the part worth actually looking at. Numbers say a loop
 * is 15.2 km and repeats 14% of itself; only a map says whether it is a ride.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8080';
const TOKEN = process.env.LOOP_PROBE_TOKEN ?? '';

/** Five starts across two countries and three kinds of road network. */
const CITIES = {
  bucharest: { lat: 44.4268, lon: 26.1025, note: 'dense flat grid' },
  rasnov: { lat: 45.5936, lon: 25.4633, note: 'valley town, thin network' },
  brasov: { lat: 45.6427, lon: 25.5887, note: 'city against mountains' },
  cluj: { lat: 46.7712, lon: 23.6236, note: 'hilly city' },
  amsterdam: { lat: 52.3676, lon: 4.9041, note: 'dense, heavy cycle network' },
};

const parseList = (raw, fallback) =>
  raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const cityNames = parseList(process.env.LOOP_PROBE_CITIES, Object.keys(CITIES));
const distancesKm = parseList(process.env.LOOP_PROBE_DISTANCES, [
  '10',
  '20',
  '30',
]).map(Number);
const terrain = process.env.LOOP_PROBE_TERRAIN ?? 'rolling';
const surface = process.env.LOOP_PROBE_SURFACE ?? 'any';
const geojsonPath = process.env.LOOP_PROBE_GEOJSON ?? '';

if (!TOKEN) {
  console.error(
    'LOOP_PROBE_TOKEN is required — the endpoint needs a Supabase access token.',
  );
  process.exit(1);
}

/** Read one NDJSON stream to completion, returning every frame. */
const readStream = async (response) => {
  const frames = [];
  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (text) => {
    buffer += text;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) frames.push(JSON.parse(line));
      newline = buffer.indexOf('\n');
    }
  };

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      consume(decoder.decode(value, { stream: true }));
    }
  } else {
    consume(await response.text());
  }
  if (buffer.trim()) frames.push(JSON.parse(buffer.trim()));
  return frames;
};

const search = async (start, targetKm) => {
  const startedAt = Date.now();
  const response = await fetch(`${API_BASE_URL}/v1/loops`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/x-ndjson',
    },
    body: JSON.stringify({
      start: { lat: start.lat, lon: start.lon },
      targetDistanceMeters: targetKm * 1000,
      terrain,
      surface,
      heading: 'any',
      locale: 'en',
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      /* keep the status */
    }
    return { ok: false, detail, ms: Date.now() - startedAt };
  }

  const frames = await readStream(response);
  const terminal = frames.at(-1);
  return {
    ok: true,
    ms: Date.now() - startedAt,
    candidates: frames.filter((f) => f.type === 'candidate').length,
    terminal,
  };
};

const pct = (value) => `${(value * 100).toFixed(0)}%`;

const rows = [];
const features = [];

for (const name of cityNames) {
  const start = CITIES[name];
  if (!start) {
    console.error(`Unknown city "${name}". Known: ${Object.keys(CITIES).join(', ')}`);
    continue;
  }

  for (const targetKm of distancesKm) {
    process.stderr.write(`… ${name} ${targetKm} km\n`);
    const result = await search(start, targetKm);

    if (!result.ok) {
      rows.push({ city: name, targetKm, status: 'HTTP FAIL', detail: result.detail });
      continue;
    }
    if (!result.terminal || result.terminal.type === 'error') {
      rows.push({
        city: name,
        targetKm,
        status: 'ERROR',
        detail: result.terminal?.message ?? 'stream ended with no terminal frame',
        ms: result.ms,
      });
      continue;
    }
    if (result.terminal.type === 'empty') {
      rows.push({ city: name, targetKm, status: 'empty', ms: result.ms });
      continue;
    }

    const loops = result.terminal.loops ?? [];
    const best = loops[0];
    rows.push({
      city: name,
      targetKm,
      status: 'ok',
      ms: result.ms,
      relaxation: result.terminal.relaxation,
      checked: result.terminal.checked,
      offered: loops.length,
      // The headline number: how close the best loop is to what was asked for.
      errorPct: best
        ? Math.abs(best.distanceMeters - targetKm * 1000) / (targetKm * 1000)
        : null,
      km: best ? best.distanceMeters / 1000 : null,
      climb: best?.climbMeters ?? null,
      ringRetrace: best?.ringRetracedShare ?? null,
      spur: best?.spurShare ?? null,
      unpaved: best?.unpavedShare ?? null,
      // Worth watching: a stem means the rider was offered a lollipop, the
      // shape that historically never survived to be shown.
      stemKm: best ? best.stemMeters / 1000 : null,
    });

    if (geojsonPath) {
      loops.forEach((loop, index) => {
        features.push({
          type: 'Feature',
          properties: {
            city: name,
            targetKm,
            rank: index + 1,
            distanceKm: Number((loop.distanceMeters / 1000).toFixed(2)),
            climbMeters: loop.climbMeters,
            ringRetracedShare: loop.ringRetracedShare,
            spurShare: loop.spurShare,
            unpavedShare: loop.unpavedShare,
            stemMeters: Math.round(loop.stemMeters),
            relaxation: loop.relaxation,
          },
          geometry: { type: 'LineString', coordinates: loop.coordinates },
        });
      });
    }
  }
}

console.log('');
console.log(
  `terrain=${terrain} surface=${surface}  target: distance error, doubling back, spur`,
);
console.log('');
console.log(
  'city        km   status   wall    best     err    climb  ring-retrace  spur   unpaved  stem   relaxed    checked',
);
for (const row of rows) {
  if (row.status !== 'ok') {
    console.log(
      `${row.city.padEnd(11)} ${String(row.targetKm).padStart(2)}   ${row.status.padEnd(8)} ${
        row.ms ? `${(row.ms / 1000).toFixed(1)}s` : ''
      }  ${row.detail ?? ''}`,
    );
    continue;
  }
  console.log(
    [
      row.city.padEnd(11),
      String(row.targetKm).padStart(2),
      '  ok     ',
      `${(row.ms / 1000).toFixed(1)}s`.padStart(6),
      `${row.km.toFixed(1)}km`.padStart(8),
      pct(row.errorPct).padStart(6),
      `${row.climb ?? '-'}m`.padStart(7),
      pct(row.ringRetrace).padStart(13),
      pct(row.spur).padStart(6),
      pct(row.unpaved).padStart(8),
      `${row.stemKm.toFixed(1)}`.padStart(5),
      String(row.relaxation).padStart(10),
      String(row.checked).padStart(8),
    ].join(' '),
  );
}

const good = rows.filter((r) => r.status === 'ok');
if (good.length > 0) {
  const errors = good.map((r) => r.errorPct).sort((a, b) => a - b);
  const median = errors[Math.floor(errors.length / 2)];
  const strict = good.filter((r) => r.errorPct <= 0.12).length;
  const relaxedNone = good.filter((r) => r.relaxation === 'none').length;
  console.log('');
  console.log(`searches            ${rows.length}`);
  console.log(`returned loops      ${good.length}`);
  console.log(`median distance err ${pct(median)}`);
  console.log(`inside strict 12%   ${strict} of ${good.length}`);
  console.log(`no relaxation       ${relaxedNone} of ${good.length}`);
  console.log('');
  console.log(
    'A ladder that reaches its last rung on nearly every search is a defect report,',
  );
  console.log('not the feature working.');
}

if (geojsonPath && features.length > 0) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    geojsonPath,
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  console.log('');
  console.log(`wrote ${features.length} loops to ${geojsonPath}`);
  console.log('Drop it on geojson.io — the map is the part the numbers cannot tell you.');
}
