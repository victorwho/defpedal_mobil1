import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// HTTPS intermediary for email confirmation links.
//
// Supabase auth email links are forced to be https://. Mobile deep-link
// schemes (defensivepedal://) cannot be opened directly from email clients.
// This function receives the HTTPS redirect from /auth/v1/verify, then:
//   - Android browser → intent:// URI (Chrome handles natively, no JS)
//   - iOS browser → HTML intermediate page; JS opens the app or shows App Store link
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

  // iOS: serve an HTML intermediate page instead of a bare custom-scheme 302.
  // A bare 302 to defensivepedal:// causes SFSafariViewController (used by
  // Gmail and other iOS apps) to show "Safari cannot open the page because the
  // address is invalid" when the Defensive Pedal app is not installed, because
  // iOS treats an unrecognised URL scheme as a navigation error. The HTML page
  // triggers the same window.location redirect via JavaScript so the app opens
  // if it is installed, while showing a helpful download button otherwise.
  const customSchemeUrl = `${scheme}://${targetPath}`;
  const appStoreUrl = 'https://apps.apple.com/app/id6778694757';
  // Two separate escape contexts:
  // - HTML attributes (href): & → &amp;  " → &quot;
  // - JS string literal inside <script>: \ → \\  " → \"  < → <
  //   (HTML entities are NOT decoded inside <script> raw-text elements)
  const htmlAttrUrl = customSchemeUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const jsStringUrl = customSchemeUrl
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening Defensive Pedal…</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0d10;
     color:#f9fafb;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
.card{text-align:center;max-width:320px}
h1{font-size:18px;font-weight:700;margin:0 0 8px}
p{font-size:14px;color:#9ca3af;margin:0 0 24px;line-height:1.5}
.btn{display:inline-block;padding:14px 28px;background:#d4a843;color:#0b0d10;
     border-radius:12px;font-weight:700;text-decoration:none;font-size:15px}
#store{margin-top:20px}
</style>
</head>
<body>
<div class="card">
  <h1>Opening Defensive Pedal…</h1>
  <p>Tap the button below if the app does not open automatically.</p>
  <a class="btn" href="${htmlAttrUrl}">Open in app</a>
  <div id="store" style="display:none">
    <p style="margin-top:20px">App not installed? Download it first, then tap the link in your email again.</p>
    <a class="btn" href="${appStoreUrl}">Download on the App Store</a>
  </div>
</div>
<script>
(function(){
  try { window.location = "${jsStringUrl}"; } catch(e) {}
  setTimeout(function(){
    var s = document.getElementById('store');
    if (s) s.style.display = 'block';
  }, 2000);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
});
