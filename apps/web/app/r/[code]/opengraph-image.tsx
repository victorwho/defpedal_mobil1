/* eslint-disable @next/next/no-img-element */
/**
 * OG (Open Graph) preview image for shared routes — slice 7a.
 *
 * Next.js 15 serves this file as `/r/<code>/opengraph-image` and auto-wires
 * the `<meta property="og:image">` + `<meta name="twitter:image">` tags on
 * the HTML page, so pasting a share link into WhatsApp / iMessage / Slack /
 * Twitter shows a rich preview card.
 *
 * Layout (per PRD): Mapbox static image on the left 60%, stat tiles on the
 * right 40%, brand footer bar across the bottom. 1200×630 is the
 * WhatsApp/Twitter-preferred OG size.
 *
 * Any non-ok share state (404 / 410 / error) renders a branded fallback so
 * the preview still looks intentional — nobody gets a broken image icon.
 * Runtime is `nodejs` (not edge) so the ImageResponse has access to the
 * full fetch polyfill + `@defensivepedal/core` transpiled output.
 */
import { ImageResponse } from 'next/og';

import { decodePolyline, mapboxStaticImageUrl } from '@defensivepedal/core';

import { fetchRouteShare } from '../../../lib/fetchRouteShare';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// OG scrapers cache aggressively; 1h is long enough that a single share can
// be pasted into multiple chats without re-rendering, short enough that a
// revoke/expire takes effect on the next scrape. `public` so CDN caches
// too. `s-maxage` over `max-age` to target shared caches specifically.
export const revalidate = 3600;

const MAP_WIDTH = 720; // 60% of 1200
const MAP_HEIGHT = 630;
const PANEL_WIDTH = size.width - MAP_WIDTH;

const COLORS = {
  bgDeep: '#111827',
  bgSurface: '#1F2937',
  border: '#374151',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  textMuted: '#9CA3AF',
} as const;

const BRAND_FOOTER_HEIGHT = 56;

const formatDistanceKm = (meters: number): string => {
  const km = meters / 1000;
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
};

const formatDurationLabel = (seconds: number): { value: string; unit: string } => {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return { value: String(totalMinutes), unit: 'min' };
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0
    ? { value: `${hours}h ${mins}`, unit: 'min' }
    : { value: String(hours), unit: 'h' };
};

const ROUTING_MODE_LABEL: Record<string, string> = {
  safe: 'Safe route',
  fast: 'Fast route',
  flat: 'Flat route',
};

// ── Branded fallback ──────────────────────────────────────────────────────
// Rendered when the share is gone/expired/404/error. Same dimensions so
// any already-scraped OG card from a live share gets visually replaced on
// re-scrape (not a blank or 404 image).
const FallbackImage = (reason: 'gone' | 'not_found' | 'error') => {
  const copy =
    reason === 'gone'
      ? { title: 'This shared route is no longer available', sub: 'The link may have expired or been revoked.' }
      : reason === 'not_found'
      ? { title: 'Route not found', sub: 'This share link doesn\u2019t exist.' }
      : { title: 'Preview unavailable', sub: 'We couldn\u2019t generate this preview.' };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(ellipse at top, ${COLORS.bgSurface} 0%, ${COLORS.bgDeep} 70%)`,
          color: COLORS.textPrimary,
          padding: 60,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 22,
            background: COLORS.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            fontSize: 36,
            fontWeight: 800,
            color: COLORS.bgDeep,
          }}
        >
          DP
        </div>
        <div style={{ fontSize: 48, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 22, color: COLORS.textSecondary, textAlign: 'center' }}>
          {copy.sub}
        </div>
      </div>
    ),
    { ...size },
  );
};

// ── Main image ────────────────────────────────────────────────────────────
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await fetchRouteShare(code);

  if (result.status === 'gone') return FallbackImage('gone');
  if (result.status === 'not_found') return FallbackImage('not_found');
  if (result.status === 'error') return FallbackImage('error');

  const share = result.data;
  const { route, sharerDisplayName } = share;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  // We can always compose the Mapbox static URL — the token is inlined at
  // build time on Vercel. If it's missing (local `next build` without
  // env.local), fall through to the branded fallback so the card still
  // renders.
  if (!mapboxToken) return FallbackImage('error');

  const coords = decodePolyline(route.geometryPolyline6);
  const mapUrl = mapboxStaticImageUrl({
    coords,
    width: MAP_WIDTH,
    height: MAP_HEIGHT - BRAND_FOOTER_HEIGHT,
    retina: true,
    accessToken: mapboxToken,
  });

  const distance = formatDistanceKm(route.distanceMeters);
  const duration = formatDurationLabel(route.durationSeconds);
  const modeLabel = ROUTING_MODE_LABEL[route.routingMode] ?? route.routingMode;
  const displayName = sharerDisplayName ?? 'A Defensive Pedal rider';
  const safetyScore =
    route.safetyScore != null ? Math.round(route.safetyScore) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.bgDeep,
          color: COLORS.textPrimary,
        }}
      >
        {/* Top region: map left, stats right */}
        <div style={{ display: 'flex', flex: 1 }}>
          <img
            src={mapUrl}
            alt=""
            width={MAP_WIDTH}
            height={MAP_HEIGHT - BRAND_FOOTER_HEIGHT}
            style={{
              width: MAP_WIDTH,
              height: MAP_HEIGHT - BRAND_FOOTER_HEIGHT,
              objectFit: 'cover',
            }}
          />

          {/* Stats panel */}
          <div
            style={{
              width: PANEL_WIDTH,
              display: 'flex',
              flexDirection: 'column',
              padding: 44,
              gap: 28,
              background: COLORS.bgSurface,
              borderLeft: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: COLORS.accent,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              {modeLabel}
            </div>

            {/* Distance tile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 1 }}>
                {distance}
                <span style={{ fontSize: 32, fontWeight: 500, color: COLORS.textSecondary, marginLeft: 8 }}>
                  km
                </span>
              </div>
              <div style={{ fontSize: 16, color: COLORS.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>
                Distance
              </div>
            </div>

            {/* Duration + Safety row */}
            <div style={{ display: 'flex', gap: 32 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
                  {duration.value}
                  <span style={{ fontSize: 20, fontWeight: 500, color: COLORS.textSecondary, marginLeft: 6 }}>
                    {duration.unit}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: COLORS.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>
                  Duration
                </div>
              </div>
              {safetyScore != null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
                    {safetyScore}
                    <span style={{ fontSize: 20, fontWeight: 500, color: COLORS.textSecondary, marginLeft: 6 }}>
                      /100
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: COLORS.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Safety
                  </div>
                </div>
              ) : null}
            </div>

            {/* Sharer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 'auto',
                paddingTop: 20,
                borderTop: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: COLORS.accent,
                  color: COLORS.bgDeep,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Shared by
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{displayName}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand footer bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: BRAND_FOOTER_HEIGHT,
            paddingLeft: 32,
            paddingRight: 32,
            background: COLORS.accent,
            color: COLORS.bgDeep,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                background: COLORS.bgDeep,
                color: COLORS.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              DP
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Defensive Pedal</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1 }}>
            Safer cycling, shared
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
