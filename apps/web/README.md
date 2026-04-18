# @defensivepedal/web

Next.js 14 App Router workspace for the Defensive Pedal web surface.
Deployed to Vercel at `routes.defensivepedal.com`.

## Status

Slice 0 — infrastructure scaffold only. Real route-share viewer arrives in slice 1.

## Local development

Install dependencies from **inside `apps/web/`**, not the monorepo root:

```bash
cd apps/web
npm install --workspaces=false --legacy-peer-deps
```

This matches Vercel's production install (its project root is `apps/web/`) and avoids hoisting Next.js to the monorepo root — where it would conflict with the mobile workspace's React 19 peer. Then:

```bash
npm run dev        # dev server on http://localhost:3001
npm run build      # production build
npm run start      # production server on port 3001
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## Security advisories

Pinned to `next@^15.5.15`. CVEs cleared by Next 15.5.15 bump (2026-04-18) — `npm audit` returns 0 vulnerabilities on runtime and dev trees.

### Historical (pre-15.5.15)

While slice 0 shipped on `next@^14.2.35`, the following CVEs had fixes only in Next.js 15.5.15+ or 16.x and were therefore unpatched on 14.2.35. All have since been cleared by the 15.5.15 bump:

| CVE | Severity | Applied to our surface? |
|-----|----------|-------------------------|
| [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw) Middleware auth bypass | critical | **No** — no middleware in slice 0 |
| [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) HTTP smuggling in rewrites | high | **No** — no rewrites |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) next/image cache growth | high | **No** — no `next/image` usage, and Vercel-hosted (managed cache) |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) Server Components DoS | high | Low — surface is one static page + one 404 stub |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) Image Optimizer remotePatterns DoS | high | **No** — Vercel-hosted (managed) |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) Server Component deserialization | critical | Low — no user-controlled RSC inputs |

---

# HITL operator checklist (slice 0)

Everything below requires a human operator with access to Vercel, DNS, Apple Developer, and Android keystores. **Order matters** — see the warning box at the end.

## 1. Domain + Vercel project

- [ ] **Acquire the domain** — purchase `routes.defensivepedal.com` or alias onto an existing `defensivepedal.com` zone
- [ ] **Create Vercel project**
  - Import the GitHub repo `victorwho/defpedal_mobil1`
  - Set **Root Directory** = `apps/web`
  - Framework preset will autodetect as Next.js (confirmed by `vercel.json`)
- [ ] **Attach domain** — Vercel Dashboard → Project → Settings → Domains → add `routes.defensivepedal.com`
- [ ] **DNS records** — add the `CNAME` (or `A` ALIAS, depending on your registrar) that Vercel prompts for; wait for TLS cert to issue (usually <5 min)
- [ ] **Verify holding page** loads at `https://routes.defensivepedal.com/`

## 2. Environment variables (Vercel Dashboard)

`vercel.json` references these via `@secret-name` indirection. In **Project → Settings → Environment Variables**, add:

| Name | Dashboard entry name | Notes |
|------|----------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `defpedal_supabase_url` | `https://uobubaulcdcuggnetzei.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `defpedal_supabase_anon_key` | anon key from Supabase Dashboard |
| `NEXT_PUBLIC_POSTHOG_KEY` | `defpedal_posthog_key` | set in slice 7 (not required for slice 0) |
| `NEXT_PUBLIC_POSTHOG_HOST` | `defpedal_posthog_host` | e.g. `https://eu.posthog.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | `defpedal_sentry_dsn` | Sentry project DSN |

Add to all three environments: Production, Preview, Development.

## 3. Apple App Site Association (iOS Universal Links)

File: `apps/web/public/.well-known/apple-app-site-association` (no extension).

- [ ] **Find your Apple Team ID** — App Store Connect → Membership Details → 10-character Team ID (e.g. `A1B2C3D4E5`)
- [ ] **Replace every `FILL_ME_TEAM_ID`** (3 occurrences) in the file with the real Team ID
- [ ] **Deploy** the change
- [ ] **Validate via Apple CDN** (Apple caches for up to 24h, but the direct CDN URL is immediate):
  ```
  https://app-site-association.cdn-apple.com/a/v1/routes.defensivepedal.com
  ```
  Must return HTTP 200 with the full JSON body matching what you committed.
- [ ] **Verify MIME** — `curl -I https://routes.defensivepedal.com/.well-known/apple-app-site-association` must show `Content-Type: application/json` (not `text/plain`)
- [ ] **Verify no redirect** — the URL must return 200 directly, not 301/308

> **Constraint:** End-to-end iOS Universal Links verification requires iPhone hardware. This is a known project-wide blocker (see root `CLAUDE.md`).

## 4. Android Digital Asset Links (App Links)

File: `apps/web/public/.well-known/assetlinks.json`.

### Extract SHA-256 fingerprints

```bash
# DEV (development flavor uses the Android debug keystore)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android \
  | grep "SHA256:"

# PREVIEW (preview flavor — same debug keystore if you haven't changed it,
# otherwise the one configured in apps/mobile/android/app/build.gradle)
keytool -list -v -keystore path/to/preview.keystore \
  -alias <your-preview-alias> \
  | grep "SHA256:"

# PROD (production — from your release keystore, NEVER commit this keystore)
keytool -list -v -keystore path/to/release.keystore \
  -alias <your-prod-alias> \
  | grep "SHA256:"
```

Expected format: 64 hex chars in uppercase, colon-separated (95 chars total):
```
SHA256: AA:BB:CC:...:FF
```

### Paste into assetlinks.json

- [ ] Replace `FILL_ME_SHA256_DEV` → dev keystore SHA-256
- [ ] Replace `FILL_ME_SHA256_PREVIEW` → preview keystore SHA-256
- [ ] Replace `FILL_ME_SHA256_PROD` → production keystore SHA-256
- [ ] Copy the full `SHA256:` prefix OUT (values are bare hex-with-colons, no prefix)

### Validate

- [ ] `curl -I https://routes.defensivepedal.com/.well-known/assetlinks.json` → `Content-Type: application/json`
- [ ] Google's official validator:
  ```
  https://digitalassetlinks.googleapis.com/v1/statements:list
    ?source.web.site=https://routes.defensivepedal.com
    &relation=delegate_permission/common.handle_all_urls
  ```
  Must return all 3 package entries with `"delegate_permission/common.handle_all_urls"`.

## 5. Rebuild + install APKs (AFTER steps 3 and 4 verify)

After `.well-known/*` files are live and both validators return green:

- [ ] **Rebuild preview APK** — `npm run build:preview:install` from repo root
- [ ] **Install on physical Android device**
- [ ] **Verify Android App Link status** — `adb shell pm get-app-links com.defensivepedal.mobile.preview` should show `Domain verification state: verified`

## 6. Manual link-tap smoke test

- [ ] On Android (preview APK installed): send yourself a message with `https://routes.defensivepedal.com/r/test` — tapping it should open Defensive Pedal Preview, not the browser
- [ ] Expected behavior for slice 0: app opens and shows a "not yet implemented" toast (the deep-link listener stub from T10). Real claim flow arrives in slice 2.
- [ ] On Android in browser (app uninstalled): same URL should render the 404 page at `/r/test`
- [ ] Holding page — `https://routes.defensivepedal.com/` renders the branded Defensive Pedal page

---

## Order-matters warning (READ BEFORE STARTING)

Android App Link verification with `autoVerify="true"` is **one-shot per install**. When an APK with the new intent filter is installed, the OS fetches `assetlinks.json` over HTTPS. If that fetch fails — because the web app isn't deployed yet, because the file is missing, because the SHA-256 doesn't match the installed APK's signing cert — **the OS caches the failure for ~24 hours** and every shared link falls back to the disambiguation chooser dialog silently, with no user-visible error.

### Correct sequence

1. Deploy web app with **both** `.well-known/*` files live at `routes.defensivepedal.com`
2. Replace all 4 placeholders: 1× `FILL_ME_TEAM_ID` (in AASA) + 3× `FILL_ME_SHA256_*` (in assetlinks.json)
3. Redeploy
4. Confirm Apple CDN validator green AND Google Digital Asset Links API returns all 3 package entries
5. **Only then** rebuild and install the preview APK from the PR that wires up the intent filters (T9)

### If you rebuild APKs first (the wrong order)

Uninstall the APK, wait for the system DNS/verification cache to clear (or use `adb shell pm set-app-links --package <pkg> 0 all` then `verify`), fix the web side, and reinstall.

---

## Placeholder inventory

Quick reference for what needs replacing in each file:

| File | Placeholder | Count | Replace with |
|------|-------------|-------|--------------|
| `public/.well-known/apple-app-site-association` | `FILL_ME_TEAM_ID` | 3 | Apple Team ID (10 chars) |
| `public/.well-known/assetlinks.json` | `FILL_ME_SHA256_DEV` | 1 | dev keystore SHA-256 |
| `public/.well-known/assetlinks.json` | `FILL_ME_SHA256_PREVIEW` | 1 | preview keystore SHA-256 |
| `public/.well-known/assetlinks.json` | `FILL_ME_SHA256_PROD` | 1 | production keystore SHA-256 |
| `vercel.json` (references only — values in Vercel Dashboard) | 5× `@...` secrets | — | set via Dashboard, not file edit |

Total: 6 file-level placeholders, 5 Dashboard entries.

---

## Troubleshooting

### Android taps open the browser chooser instead of the app

Almost always one of:
- `assetlinks.json` wasn't live at `https://routes.defensivepedal.com/.well-known/assetlinks.json` when the APK was installed → the OS cached a failed verification (~24h). Fix: uninstall APK, confirm file is live + returns JSON, reinstall. Optional manual reset: `adb shell pm set-app-links --package <pkg> 0 all` then `adb shell pm verify-app-links --re-verify <pkg>`.
- SHA-256 in `assetlinks.json` doesn't match the keystore that signed the installed APK. Re-run the `keytool` command on the actual keystore used by the build and paste the fresh fingerprint.
- `Content-Type` on `assetlinks.json` isn't `application/json`. Verify with `curl -sI https://routes.defensivepedal.com/.well-known/assetlinks.json` — if it shows `text/plain`, the `next.config.js` `headers()` rule isn't matching (check the source pattern).

### Apple CDN validator returns 404

- DNS / TLS not yet propagated. Propagation can take up to 24h end-to-end; the Apple CDN only fetches after your domain is reachable over HTTPS with a valid cert.
- `apple-app-site-association` has a `.json` extension (it must NOT) — Apple rejects both the missing file AND misnamed files with 404.
- Check MIME with `curl -sI https://routes.defensivepedal.com/.well-known/apple-app-site-association` — must be `application/json`, not `text/plain`. If it's `text/plain`, the `next.config.js` `headers()` rule for `/.well-known/:path*` isn't matching (possible after an accidental rewrite — verify the config wasn't truncated).
- Trailing-slash redirect (301/308) — must be disabled (`skipTrailingSlashRedirect: true` in `next.config.js`). Apple's validator treats any redirect as failure.

### iOS link-tap verification

**Blocked on iPhone hardware** — this is a known project-wide gap (see root `CLAUDE.md`). Android App Links can be fully verified, but iOS Universal Links are configured blind until macOS/iOS hardware is available. The web viewer is the safety net — the link still renders a functional page on any unverified path.

### MIME type wrong

`curl -sI https://routes.defensivepedal.com/.well-known/apple-app-site-association` must show `Content-Type: application/json`. If it shows `text/plain` (or anything else), the `next.config.js` `headers()` rule isn't taking effect. Check that:
1. The file was deployed (Vercel build didn't strip it)
2. `headers()` is exported from `next.config.js`, not commented out
3. The `source` pattern `'/.well-known/:path*'` matches — Next.js uses path-to-regexp syntax, not regex
