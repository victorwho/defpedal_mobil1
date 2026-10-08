# Branded signup email + confirmation flow

How Defensive Pedal's signup-confirmation and password-reset emails reach the
app, and the manual infra/dashboard pieces behind them.

## Flow (reworked 2026-08-11 — scanner-proof token_hash links)

**History:** the original 2026-04 flow used `{{ .ConfirmationURL }}`, which
routes through `GET /auth/v1/verify` — a single-use GET that is consumed by
*any* HTTP fetch. Mail-provider link scanners (Outlook SafeLinks, corporate
AV), double-taps, and stale emails after a repeat signup all killed the link
before/instead of the user, producing "Email link is invalid or has expired"
for a meaningful slice of signups. Pasting the link in Chrome's omnibox also
dead-ended (Chrome refuses to launch `intent://` from typed navigations) while
still consuming the token. See error-log #77.

**Current flow:** the email templates link DIRECTLY at this edge function with
a `token_hash` — no server-side verify happens on GET for Android or desktop,
so the link cannot be consumed by a browser or scanner there; only the app's
`verifyOtp` call consumes it. **iPhone signup links are the exception since
2026-10-08** — this function verifies them itself (see the iOS section below).

```
email link:
  https://<project>.supabase.co/functions/v1/email-confirm
      ?scheme=<app scheme>&token_hash={{ .TokenHash }}&type=signup|recovery

edge function (this dir):
  Android  → 302 intent://auth/callback?token_hash=...&type=...
  iOS      → signup: this function calls POST /auth/v1/verify itself, then
             302 to routes.defensivepedal.com/email-confirmed (or
             /email-link-expired when GoTrue rejects the token)
             recovery / anything else: 302 <scheme>://auth/callback?...
             (cannot open the app on current builds — see the iOS section)
  Desktop  → 302 to routes.defensivepedal.com/email-open-on-phone
             (token untouched — user is told to open the email on the phone)

app (AuthSessionProvider deep-link handler, shipped since v0.2.9x 2026-04-20):
  verifyOtp({ token_hash, type }) → session. No PKCE verifier needed →
  works cross-device and after reinstall.
```

Properties (Android + desktop): scanner-prefetch immune, double-click immune, repeat-signup emails
only die when GoTrue rotates the token (resend gets a fresh one), and the
sign-in screen now has a "Resend confirmation email" affordance
(`resendSignupConfirmation` in `apps/mobile/src/lib/supabase.ts`).

### iOS: signup is confirmed by this function (2026-10-08)

No iOS build made before 2026-10-08 can be opened from an email link.
`app.config.ts` set `ios.infoPlist.CFBundleURLTypes` to the Google
reversed-client-id alone (native Google Sign-In), and when that key is set
explicitly Expo's `withScheme` is skipped, so those builds do not register
`defensivepedal://`. This is read from the evaluated config and the
`@expo/config-plugins` source, and matches production logs (iPhone taps reach
this function; no `POST /auth/v1/verify` ever follows). It has not been
confirmed against a built `Info.plist`. See error-log #134.

`app.config.ts` now lists the app scheme and bundle identifier next to the
Google scheme, so the first iOS build after 2026-10-08 should register it.
That stays unproven until a link is tapped on a real iPhone running that build.

Current behaviour, and what is still broken:

- **Signup** — for an iPhone user agent this function does the one-time
  `POST /auth/v1/verify` itself, revokes the session that call mints, and
  redirects to `/email-confirmed` (or `/email-link-expired` if the token was
  rejected). The rider then signs in from the app with email + password.
- **Trade-off** — an iPhone-UA GET consumes the token, so the scanner-proof
  property above does not hold for that one case. Scanners overwhelmingly use
  desktop user agents; if one with an iPhone UA gets there first the email is
  still confirmed and the rider's own tap shows the "expired or already used —
  just sign in" page.
- **Recovery** — cannot be finished server-side (the app needs the session to
  set the new password). The link still 302s to the custom scheme, so password
  reset by email does **not** work on iPhone for anyone on a build made before
  2026-10-08.
- **When to revisit** — once a build that registers the scheme is live and
  tap-tested, the iOS branch could hand signup links to the app again, like
  Android. Riders still on older builds would break again if it did, so keep
  the server-side confirm until those have aged out. It works on every build.

**Legacy links** (emails sent before the switch, valid ≤24h) still route
through `/auth/v1/verify` and arrive here with `?code=` (success) or
`?error_code=` (failure). Both are handled: code → app exchange; error →
forwarded to the app (mobile) or `routes.defensivepedal.com/email-link-expired`
(desktop). Keep the `code`/`error` handling until at least 2026-09 in case a
straggler clicks an old email.

`{{ .TokenHash }}` renders the *stored* `auth.users.confirmation_token`
including the `pkce_` prefix for PKCE-initiated signups — `verifyOtp` accepts
it as-is (validated live 2026-08-11 against production GoTrue).

## Deploy

```bash
supabase functions deploy email-confirm --project-ref uobubaulcdcuggnetzei --no-verify-jwt --use-api
```

`--no-verify-jwt` is REQUIRED — browsers hitting this from an email link carry
no Authorization header. There is no `config.toml` pinning this, so pass the
flag on every deploy.

Desktop pages live in `apps/web` (Next.js on Vercel, project `defpedal-web`,
Root Directory `apps/web` — deploy from the REPO ROOT, from a clean `main`
worktree): `/email-confirmed`, `/email-open-on-phone`, `/email-link-expired`.

## Email templates (Supabase Dashboard → Auth → Email Templates)

Both managed via Management API `PATCH /v1/projects/<ref>/config/auth`
(fields `mailer_templates_confirmation_content`,
`mailer_templates_recovery_content`, `mailer_subjects_*`).

- **Confirm signup**: branded HTML; every link is
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup`
- **Reset password**: branded HTML; links are
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`

`{{ .RedirectTo }}` is the per-request `emailRedirectTo`/`redirectTo` the app
sends (`https://<project>.supabase.co/functions/v1/email-confirm?scheme=<scheme>`,
built by `buildEmailConfirmRedirect()` in `apps/mobile/src/lib/supabase.ts`).
It already carries `?scheme=`, hence the `&` when appending. Caveat: a signup
triggered WITHOUT a redirect (e.g. dashboard invite) renders `{{ .RedirectTo }}`
as the Site URL and produces a broken link — all app flows send it.

## SMTP (Resend)

Dashboard → Project Settings → Auth → SMTP: `smtp.resend.com`, sender
`team@defensivepedal.com`. Keep Resend link/click tracking OFF for the domain —
tracking rewrites add a redirect hop and invite scanner clicks.

## Redirect URL allowlist (Dashboard → Auth → URL Configuration)

Must contain (already live):

```
https://uobubaulcdcuggnetzei.supabase.co/functions/v1/email-confirm?*
defensivepedal://auth/callback
defensivepedal-dev://auth/callback
defensivepedal-preview://auth/callback
```

## End-to-end test

1. In the app: Account → Sign up with a `+tag` email you control.
2. Open the email on the SAME phone → tap the button → browser bounces to
   `defensivepedal://auth/callback?token_hash=...` → app signs in.
   On iPhone the browser lands on the "Email confirmed" page instead — go
   back to the app and sign in with email + password.
3. Negative checks: open the link on desktop FIRST → "open on your phone" page,
   then the phone tap must STILL work (token not consumed).
4. `resend` path: sign-in with an unconfirmed account → "Resend confirmation
   email" appears under the error.
5. The test only passes when the server log shows the confirmation itself:
   Android → `POST /auth/v1/verify` from `okhttp` in `edge_logs`; iPhone →
   `ios server-side verify ok` in `function_logs`. A 302 seen in curl proves
   the redirect, not that the phone could follow it (error-log #134).

## Rollback

- Templates: restore `{{ .ConfirmationURL }}` in the Confirm-signup template
  (Management API or dashboard) — reverts to the /verify flow.
- Edge function changes are backward compatible with both flows; no rollback
  needed independently of the templates.
