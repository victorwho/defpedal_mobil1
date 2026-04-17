import { describe, expect, it } from 'vitest';

import { mapboxStaticImageUrl } from './mapboxStaticImageUrl';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'pk.eyJ1IjoidGVzdCIsImEiOiJjbHh0ZXN0In0.test';

const shortRoute: [number, number][] = [
  [26.1025, 44.4268],
  [26.1050, 44.4290],
  [26.1080, 44.4310],
];

/** Generates a synthetic long route that will push the URL past 8192 chars
 *  when encoded as GeoJSON. ~200 coords with 6-decimal precision easily
 *  overflows. */
const buildLongRoute = (n = 200): [number, number][] =>
  Array.from({ length: n }, (_, i) => [
    26.1 + i * 0.0005,
    44.4 + i * 0.0004,
  ]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapboxStaticImageUrl', () => {
  it('throws when coords is empty', () => {
    expect(() =>
      mapboxStaticImageUrl({
        coords: [],
        width: 600,
        height: 400,
        accessToken: TOKEN,
      }),
    ).toThrow('coords required');
  });

  it('produces a URL with GeoJSON overlay for short routes', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });

    // GeoJSON path overlay is URL-encoded; the literal `geojson(` prefix
    // should appear.
    expect(url).toContain('geojson(');
    // Stroke color is URL-encoded — %23 is "#", D4A843 is brand yellow
    expect(url).toContain('%23D4A843');
    // Stroke width is 6
    expect(url).toContain('stroke-width%22%3A6');
  });

  it('uses the default Mapbox Outdoors v12 style when styleId omitted', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(url).toContain('/styles/v1/mapbox/outdoors-v12/static/');
  });

  it('respects a custom styleId', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
      styleId: 'mapbox/streets-v12',
    });
    expect(url).toContain('/styles/v1/mapbox/streets-v12/static/');
  });

  it('appends @2x when retina=true', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      retina: true,
      accessToken: TOKEN,
    });
    expect(url).toContain('/600x400@2x?access_token=');
  });

  it('omits @2x when retina is false or undefined', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(url).not.toContain('@2x');
    expect(url).toContain('/600x400?access_token=');
  });

  it('uses auto-fit bounds (/auto/ segment)', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(url).toMatch(/\/auto\/\d+x\d+(@2x)?\?/);
  });

  it('places green start pin and red end pin', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    // Overlay syntax uses literal `+` and `,` at the path level — only the
    // inner payloads (GeoJSON / encoded polyline) are URL-encoded.
    // Start (first coord) green
    expect(url).toContain(`pin-s+2E7D32(${shortRoute[0][0]},${shortRoute[0][1]})`);
    // End (last coord) red
    const last = shortRoute[shortRoute.length - 1];
    expect(url).toContain(`pin-s+C62828(${last[0]},${last[1]})`);
  });

  it('puts the access token at the end as a query parameter', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(url.endsWith(`?access_token=${encodeURIComponent(TOKEN)}`)).toBe(true);
  });

  it('emits one overlay per risk segment and skips the default single path', () => {
    const riskSegments = [
      { coords: shortRoute.slice(0, 2), color: '#FF0000' },
      { coords: shortRoute.slice(1), color: '#00FF00' },
    ];

    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      riskSegments,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });

    // Two geojson() overlays, each with a different stroke color
    const matches = url.match(/geojson\(/g) ?? [];
    expect(matches.length).toBe(2);
    expect(url).toContain('%23FF0000');
    expect(url).toContain('%2300FF00');
    // Default brand color should NOT appear in the path overlays
    // (pins don't use %23 prefix — they use %2B). Stroke colors do.
    // Brand default yellow D4A843 should not be in the URL stroke.
    expect(url).not.toContain('%23D4A843');
  });

  it('normalises colors with or without leading # in risk segments', () => {
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      riskSegments: [
        { coords: shortRoute, color: 'FF5500' }, // no leading #
      ],
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(url).toContain('%23FF5500');
  });

  it('falls back to encoded-polyline overlay when GeoJSON URL exceeds 8192 chars', () => {
    const longRoute = buildLongRoute(250);

    const url = mapboxStaticImageUrl({
      coords: longRoute,
      width: 1280,
      height: 1280,
      accessToken: TOKEN,
    });

    // Encoded path overlay format: path-6+D4A843(<encoded>)
    // The overlay token is literal at the path level; only the inner payload
    // is URL-encoded.
    expect(url).toContain('path-6+D4A843(');
    // GeoJSON prefix should NOT be present in fallback
    expect(url).not.toContain('geojson(');
    // URL should be well under threshold after the fallback
    expect(url.length).toBeLessThan(8192);
  });

  it('encodes the fallback polyline at precision 1e5 (Mapbox Static Images default)', async () => {
    // Mapbox decodes `path-…(encoded)` overlays with polyline precision 5.
    // Polyline6 strings cause HTTP 422 "Overlay bounds are out of range",
    // which manifests as a blank map in the captured share image.
    // Decoding our fallback overlay at precision 1e5 must yield the
    // original lat/lon values (within rounding tolerance).
    const { decodePolyline } = await import('./polyline');
    const longRoute = buildLongRoute(250);

    const url = mapboxStaticImageUrl({
      coords: longRoute,
      width: 1280,
      height: 1280,
      accessToken: TOKEN,
    });

    const match = /path-6\+D4A843\(([^)]+)\)/.exec(url);
    expect(match).not.toBeNull();
    const encoded = decodeURIComponent(match![1]);
    const decoded5 = decodePolyline(encoded, 1e5);

    expect(decoded5).toHaveLength(longRoute.length);
    // First and last coords round-trip within 0.001 deg of the originals
    expect(decoded5[0][0]).toBeCloseTo(longRoute[0][0], 3);
    expect(decoded5[0][1]).toBeCloseTo(longRoute[0][1], 3);
    expect(decoded5[decoded5.length - 1][0]).toBeCloseTo(
      longRoute[longRoute.length - 1][0],
      3,
    );
    expect(decoded5[decoded5.length - 1][1]).toBeCloseTo(
      longRoute[longRoute.length - 1][1],
      3,
    );
  });

  it('falls back using per-segment encoded paths when risk segments are large', () => {
    const longRoute = buildLongRoute(250);
    const url = mapboxStaticImageUrl({
      coords: longRoute,
      riskSegments: [
        { coords: longRoute.slice(0, 125), color: '#FF0000' },
        { coords: longRoute.slice(125), color: '#00FF00' },
      ],
      width: 1280,
      height: 1280,
      accessToken: TOKEN,
    });
    // Two encoded-path overlays, matching the two risk segments
    const encodedPaths = url.match(/path-6\+/g) ?? [];
    expect(encodedPaths.length).toBe(2);
    expect(url).toContain('path-6+FF0000(');
    expect(url).toContain('path-6+00FF00(');
    expect(url).not.toContain('geojson(');
  });

  it('does not mutate the input coords', () => {
    const coords = shortRoute.map((c) => [...c] as [number, number]);
    const snapshot = coords.map((c) => [...c] as [number, number]);
    mapboxStaticImageUrl({
      coords,
      width: 600,
      height: 400,
      accessToken: TOKEN,
    });
    expect(coords).toEqual(snapshot);
  });

  it('URL-encodes the access token', () => {
    const tokenWithSpecial = 'pk.tok+en/with?special&chars';
    const url = mapboxStaticImageUrl({
      coords: shortRoute,
      width: 600,
      height: 400,
      accessToken: tokenWithSpecial,
    });
    expect(url).toContain(`?access_token=${encodeURIComponent(tokenWithSpecial)}`);
  });
});
