import { NextResponse, type NextRequest } from 'next/server';

// Device-aware install link. Share `https://www.defensivepedal.com/get` anywhere:
//   - Android phones/tablets  -> Google Play listing (with web_share attribution)
//   - iPhone / iPad / desktop -> marketing site
//
// Done server-side in a Route Handler so the visitor never sees a flash of the
// wrong page before a client-side redirect fires.
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile&pcampaignid=web_share';
const WEBSITE_URL = 'https://www.defensivepedal.com/';

// Match Android but exclude the legacy "Windows Phone" UA, which also contains
// the substring "Android" in some compatibility tokens.
function isAndroid(userAgent: string): boolean {
  return /android/i.test(userAgent) && !/windows phone/i.test(userAgent);
}

export function GET(request: NextRequest): NextResponse {
  const userAgent = request.headers.get('user-agent') ?? '';
  const destination = isAndroid(userAgent) ? PLAY_STORE_URL : WEBSITE_URL;

  const response = NextResponse.redirect(destination, { status: 302 });
  // The redirect target depends on the request's User-Agent, so it must never be
  // cached by a CDN/proxy and replayed for a different device.
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Vary', 'User-Agent');
  return response;
}

// Force dynamic evaluation — the redirect is request-dependent and must not be
// statically prerendered at build time.
export const dynamic = 'force-dynamic';
