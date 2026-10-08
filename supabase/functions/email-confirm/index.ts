import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// HTTPS intermediary for email confirmation links.
//
// Supabase auth email links are forced to be https://. Mobile deep-link
// schemes (defensivepedal://) cannot be opened directly from email clients.
// This function finishes the journey per platform:
//   - Android browser → intent:// URI (Chrome handles natively, no JS); the
//     app then calls verifyOtp with the forwarded token_hash
//   - iOS browser, signup link → the email is confirmed HERE (server-side
//     verify) and the browser lands on a web page telling the rider to sign
//     in. The iPhone app cannot be opened from a link — see the iOS block.
//   - iOS browser, anything else → 302 to the custom scheme (best effort)
//   - Desktop/other → 302 to a state-appropriate page on the web app
//
// Two link generations arrive here (2026-08-11 rework, see README):
//
//   NEW (signup + recovery emails since 2026-08-11): the email links point
//   DIRECTLY at this function with `token_hash=...&type=...`. Nothing has
//   been consumed when we run. On Android and desktop a GET here still has
//   no side effects, so the link is immune to mail-scanner prefetch and
//   double-clicks, and works cross-device (verifyOtp needs no PKCE
//   verifier). The one exception is an iPhone user agent on a signup link,
//   where this function consumes the token itself (iOS block below).
//
//   LEGACY (emails sent before the rework, valid up to 24h): the link went
//   through /auth/v1/verify first, which consumed the one-time token and
//   redirected here with `?code=` (success — email already confirmed) or
//   `?error=...&error_code=...` (failure — expired/consumed token).

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

// Browsers that cannot be handed to the app get redirected to static pages
// on the web app, because Supabase's edge runtime wraps non-redirect
// responses in CSP sandbox + text/plain (anti-phishing) — see error-log #31.
//   - email is confirmed (legacy ?code= on desktop, or the iOS server-side
//     verify succeeded) → success page
//   - desktop token_hash link: NOT confirmed yet (needs the app) → "open on
//     phone"
//   - failed verify (legacy ?error_code=, or the iOS server-side verify was
//     rejected) → expired/used-link page
const WEB_SUCCESS_URL = 'https://routes.defensivepedal.com/email-confirmed';
const WEB_OPEN_ON_PHONE_URL = 'https://routes.defensivepedal.com/email-open-on-phone';
const WEB_LINK_EXPIRED_URL = 'https://routes.defensivepedal.com/email-link-expired';

// Stored confirmation tokens are hex, optionally prefixed `pkce_`. Anything
// else is not worth a round trip to GoTrue.
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const redirect = (location: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
    },
  });

// Confirms a signup the same way the app's verifyOtp({ token_hash, type })
// does. Returns true only when GoTrue accepted the token. Never logs the
// token or the session.
async function confirmSignupOnServer(tokenHash: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error(
      '[email-confirm] SUPABASE_URL / SUPABASE_ANON_KEY missing — cannot confirm on the server',
    );
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'signup', token_hash: tokenHash }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const errorCode = typeof body?.error_code === 'string' ? body.error_code : '';
      console.warn(
        `[email-confirm] ios server-side verify rejected: status=${res.status} error_code=${errorCode}`,
      );
      return false;
    }

    // A successful verify also mints a session that nobody will ever use (the
    // rider signs in from the app afterwards). Revoke it, best effort.
    const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
    if (accessToken) {
      await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
        },
      })
        .then((logoutRes) => logoutRes.body?.cancel())
        .catch(() => undefined);
    }

    console.log('[email-confirm] ios server-side verify ok');
    return true;
  } catch (error) {
    console.error(
      `[email-confirm] ios server-side verify threw: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
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

  const hasError = url.searchParams.has('error') || url.searchParams.has('error_code');
  const tokenHash = url.searchParams.get('token_hash') ?? '';

  // Desktop / unknown user agent: the app isn't reachable from here, so
  // redirect to the state-appropriate branded page on the web app. Nothing
  // is consumed — mail scanners land in this branch.
  if (!isMobile) {
    const location = hasError
      ? WEB_LINK_EXPIRED_URL
      : tokenHash
        ? WEB_OPEN_ON_PHONE_URL
        : WEB_SUCCESS_URL;
    return redirect(location);
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

    return redirect(intentUri);
  }

  // ── iOS ──────────────────────────────────────────────────────────────────
  //
  // The iPhone app cannot be opened from these links (found 2026-10-08,
  // error-log #134). app.config.ts sets ios.infoPlist.CFBundleURLTypes for
  // native Google Sign-In, and when that key is set explicitly Expo ignores
  // the top-level `scheme`, so iOS builds do not register defensivepedal://.
  // That is read from app.config.ts and the @expo/config-plugins source and
  // matches production (iPhone taps reach this function, the app never calls
  // /auth/v1/verify); it has not been checked against a built Info.plist.
  // Until an iOS build registers the scheme, neither a bare 302 to it (the
  // 2026-10-07 hotfix) nor an HTML/JS bounce page (which Supabase serves as
  // text/plain anyway, error-log #31) can reach the app.
  //
  // So a signup link is confirmed right here — POST /auth/v1/verify with the
  // token_hash, exactly what the app's verifyOtp does — and the browser lands
  // on a web page telling the rider to go back to the app and sign in.
  //
  // Trade-off against the 2026-08-11 rework: for an iPhone user agent a GET
  // now consumes the token. Mail scanners overwhelmingly present desktop
  // user agents and take the branch above. If one does get here first, the
  // email still ends up confirmed and the rider's own tap lands on
  // /email-link-expired, whose copy already says "just sign in".
  //
  // Recovery links cannot be finished here (the app needs the session to set
  // a new password), so everything that is not a signup token_hash keeps the
  // custom-scheme 302 and only works once an iOS build registers the scheme.

  if (hasError) {
    return redirect(WEB_LINK_EXPIRED_URL);
  }

  if (tokenHash && url.searchParams.get('type') === 'signup') {
    const confirmed =
      TOKEN_HASH_PATTERN.test(tokenHash) && (await confirmSignupOnServer(tokenHash));
    return redirect(confirmed ? WEB_SUCCESS_URL : WEB_LINK_EXPIRED_URL);
  }

  return redirect(`${scheme}://${targetPath}`);
});
