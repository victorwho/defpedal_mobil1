import { NextResponse, type NextRequest } from 'next/server';

// Attribution cookie for the slice-2 claim pipeline.
// Must be set in middleware (or a Route Handler / Server Action) — Next.js 15
// disallows cookie mutations during Server Component render, which broke the
// original page.tsx implementation ("Cookies can only be modified in a Server
// Action or Route Handler" runtime error on every /r/<code> load).
//
// SameSite=Lax + NOT HttpOnly — the slice-7 PostHog snippet reads this from JS
// to bridge the web session into the mobile app's PostHog user at claim time.
// Cookie lifetime matches the PRD default share expiry (30 days).
const SHARE_CODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SHARE_CODE_COOKIE_NAME = 'dp_share_code';
const SHARE_CODE_REGEX = /^[0-9A-Za-z]{8}$/;

export function middleware(request: NextRequest) {
  const match = /^\/r\/([^/?#]+)/.exec(request.nextUrl.pathname);
  const code = match?.[1];

  const response = NextResponse.next();

  // Only set the cookie when the share code is syntactically valid. Validation
  // + existence is the page.tsx's job (it 404s on unknown codes) — middleware
  // just stamps the attribution early so the cookie lands on the same response
  // that carries the rendered viewer.
  if (code && SHARE_CODE_REGEX.test(code)) {
    response.cookies.set(SHARE_CODE_COOKIE_NAME, code, {
      maxAge: SHARE_CODE_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      httpOnly: false,
      secure: true,
      path: '/',
    });
  }

  return response;
}

// Scope the middleware to /r/:code* so it doesn't run on `/`, `/_next/*`, or
// other routes that don't need attribution.
export const config = {
  matcher: ['/r/:code*'],
};
