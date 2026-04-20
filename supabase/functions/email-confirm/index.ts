import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// HTTPS intermediary for email confirmation links.
//
// Supabase auth email links are forced to be https://. Mobile deep-link
// schemes (defensivepedal://) cannot be opened directly from email clients.
// This function receives the HTTPS redirect from /auth/v1/verify, then:
//   - Android browser → intent:// URI (Chrome handles natively, no JS)
//   - iOS browser → custom-scheme 302 redirect (OS opens the app)
//   - Desktop/other → branded "email confirmed" HTML page telling the
//     user to open the app on their phone
//
// The user's email address is already marked confirmed by the preceding
// /verify step (before this function is reached), so when the user opens
// the link on desktop we don't need to complete the PKCE exchange — we
// just reassure them and point them back to the phone.

const ALLOWED_SCHEMES = [
  'defensivepedal-dev',
  'defensivepedal-preview',
  'defensivepedal',
] as const;

const PACKAGE_MAP: Record<string, string> = {
  'defensivepedal-dev': 'com.defensivepedal.mobile.dev',
  'defensivepedal-preview': 'com.defensivepedal.mobile.preview',
  defensivepedal: 'com.defensivepedal.mobile',
};

// Desktop visitors get redirected here because Supabase's edge runtime
// wraps non-redirect responses in CSP sandbox + text/plain (anti-phishing).
// The static page lives in the Next.js web app (apps/web).
const DESKTOP_SUCCESS_URL = 'https://routes.defensivepedal.com/email-confirmed';

Deno.serve((req: Request): Response => {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent') ?? '';

  const scheme = url.searchParams.get('scheme') ?? '';

  if (!ALLOWED_SCHEMES.includes(scheme as (typeof ALLOWED_SCHEMES)[number])) {
    return new Response('Invalid scheme', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const isAndroid = /android/i.test(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  const isMobile = isAndroid || isIOS;

  // Desktop / unknown user agent: the app isn't reachable from here, so
  // redirect to a branded confirmation page on the web app. The user is
  // already confirmed at the database level by the preceding /verify step.
  if (!isMobile) {
    return new Response(null, {
      status: 302,
      headers: {
        location: DESKTOP_SUCCESS_URL,
        'cache-control': 'no-store',
      },
    });
  }

  // Forward every query param except `scheme` itself.
  const params = new URLSearchParams(url.search);
  params.delete('scheme');
  const queryString = params.toString();
  const targetPath = `auth/callback${queryString ? `?${queryString}` : ''}`;

  if (isAndroid) {
    const androidPackage = PACKAGE_MAP[scheme];
    const intentUri =
      `intent://${targetPath}` +
      `#Intent;scheme=${scheme};package=${androidPackage};end`;

    return new Response(null, {
      status: 302,
      headers: {
        location: intentUri,
        'cache-control': 'no-store',
      },
    });
  }

  // iOS
  const customSchemeUrl = `${scheme}://${targetPath}`;

  return new Response(null, {
    status: 302,
    headers: {
      location: customSchemeUrl,
      'cache-control': 'no-store',
    },
  });
});
