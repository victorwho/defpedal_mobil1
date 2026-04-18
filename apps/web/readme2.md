# HITL Checklist — Split by Owner (Claude vs You)

This is the same checklist as `README.md`, but each task is labeled **[CLAUDE]** (I can do it end-to-end if you say go) or **[YOU]** (requires your account login, physical hardware, or a purchase decision). Tasks stay in their original order because **order matters** — see the Critical Sequence note at the end.

Assumption: you've granted me full permissions including computer/browser access. Where I still can't act, it's because the task requires:
- A purchase or billing decision (domain, Apple Developer seat)
- A credential only you should type (Apple ID password, 2FA)
- Physical hardware I can't reach (your Android phone, an iPhone)
- A tool only on your Windows machine that I can't drive (Gradle/ADB — Cowork can click Terminal but can't type into it)

---

## Pre-flight discovery (already done)

I already looked at your repo while writing this, and three useful facts fell out:

1. **Android SHA-256 is already extractable.** Your project keeps the Android debug keystore at `apps/mobile/android/app/debug.keystore`, and `build.gradle` shows **all three flavors** (dev, preview, release) currently sign with that same debug keystore (`signingConfig signingConfigs.debug` on both `debug` and `release` blocks). That means all three `FILL_ME_SHA256_*` placeholders resolve to the same fingerprint:

   ```
   FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
   ```

   ⚠️ **Caveat:** shipping a real production app signed with the debug keystore is not what you want long-term — Google Play won't accept it anyway. Before you publish to Play Store you'll need a real release keystore and to re-run the fingerprint extraction. For slice 0 / preview-only testing, the debug fingerprint is fine.

2. **Apple Team ID — I can't get this.** It lives behind your Apple ID login in App Store Connect. And iOS Universal Links can't be end-to-end verified anyway (no macOS/iPhone hardware per your root `CLAUDE.md`). So this is pure **[YOU]** for now.

3. **Domain, Vercel account, DNS registrar** — all behind your accounts. I can drive the UIs for you via browser control if you're logged in, but the decisions (which domain, which registrar, billing) are yours.

---

## 1. Domain + Vercel project

### 1.1 Acquire the domain `routes.defensivepedal.com` — **[YOU]**
Purchase decision + billing. Step-by-step:
1. Check if you already own `defensivepedal.com`. If yes, skip to 1.2 — `routes.` is just a subdomain of a domain you already own.
2. If you don't own `defensivepedal.com`: go to your preferred registrar (Namecheap, Cloudflare Registrar, Google/Squarespace Domains, GoDaddy…) and buy `defensivepedal.com`. Cloudflare Registrar is cheapest (at-cost) if you're OK managing DNS there.
3. No need to separately "buy" `routes.defensivepedal.com` — subdomains are free; you create them as DNS records in 1.4.

### 1.2 Create the Vercel project — **[CLAUDE]** (with one-time login from you)
I can do this via browser control:
1. You tell me "go", I open `vercel.com/new` in Chrome.
2. If you're not logged in, I'll pause and ask you to log in (your credentials, not mine to see/store).
3. Once logged in, I import `victorwho/defpedal_mobil1`, set **Root Directory = `apps/web`**, confirm the Next.js preset, and trigger the first deploy.

**If you'd rather do this yourself:** dashboard → Add New → Project → Import `victorwho/defpedal_mobil1` → Configure → Root Directory = `apps/web` → Deploy.

### 1.3 Attach domain `routes.defensivepedal.com` — **[CLAUDE]** (with login)
Same flow: Project → Settings → Domains → Add Domain → `routes.defensivepedal.com`. Vercel will then show you the DNS record it wants. I can read that off the screen and tell you exactly what to paste into your registrar.

### 1.4 DNS records — **[YOU]** (fastest for you) or **[CLAUDE]** (if your registrar is Cloudflare/Vercel)
- If your registrar is **Cloudflare or Vercel**, I can log in (once you're signed in) and add the CNAME for you.
- If your registrar is **GoDaddy / Namecheap / Squarespace**, login flows are flakier under browser automation — faster for you to do it. Steps:
  1. Log into your registrar's DNS panel.
  2. Add a record with: Type = `CNAME`, Name = `routes`, Value = whatever Vercel told you (usually `cname.vercel-dns.com`), TTL = Auto/300.
  3. Save. Wait 1–5 minutes.

### 1.5 Verify holding page loads — **[CLAUDE]**
Once DNS is live, I run `curl -I https://routes.defensivepedal.com/` and confirm HTTP 200 + valid TLS. Takes me one command.

---

## 2. Environment variables (Vercel Dashboard) — **[CLAUDE]** for most, **[YOU]** for slice-7 values

The README lists 5 env vars. Here's the split:

| Variable | Value known now? | Who |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes: `https://uobubaulcdcuggnetzei.supabase.co` (already in your mobile `.env`) | **CLAUDE** — I paste it into Vercel dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes: it's in `apps/mobile/.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **CLAUDE** — I paste it |
| `NEXT_PUBLIC_POSTHOG_KEY` | No — PostHog account not set up yet (slice 7) | Skip until slice 7, then **YOU** (create PostHog project → copy key) |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.posthog.com` (standard) | **CLAUDE** in slice 7 |
| `NEXT_PUBLIC_SENTRY_DSN` | No — Sentry project not created yet | **YOU** — create a Sentry project for `defpedal-web`, copy the DSN, paste it in Vercel. Or hand me the DSN and I'll paste. |

For slice 0 you only strictly need the 2 Supabase vars. PostHog/Sentry can wait.

**How I do it:** once you're logged into Vercel, Project → Settings → Environment Variables → Add → select all three environments (Production, Preview, Development) → Save. I can click through each one.

---

## 3. Apple App Site Association (iOS Universal Links)

File: `apps/web/public/.well-known/apple-app-site-association`. It already exists with 3 `FILL_ME_TEAM_ID` placeholders.

### 3.1 Find your Apple Team ID — **[YOU]**
Step-by-step:
1. Go to `https://developer.apple.com/account/` in your browser, sign in with the Apple ID that owns the Defensive Pedal app record.
2. In the left sidebar click **Membership details** (or "Membership" depending on the current UI).
3. Look for **Team ID** — it's a 10-character alphanumeric string like `A1B2C3D4E5`.
4. Copy it. Paste it into your reply to me, or directly into the file.

**If you don't have an Apple Developer account yet:** you'll need to enroll at `developer.apple.com/programs/` ($99/year). This is a hard prerequisite for Universal Links on iOS. For slice 0, you could skip iOS entirely — Android will work independently.

### 3.2 Replace all 3 occurrences of `FILL_ME_TEAM_ID` — **[CLAUDE]**
Once you give me the Team ID, I do a find/replace in the file. One edit.

### 3.3 Deploy the change — **[CLAUDE]**
I commit, push to `main`, and Vercel auto-deploys. I can watch the deploy finish via the Vercel MCP.

### 3.4 Validate via Apple CDN — **[CLAUDE]**
I run:
```
curl -s https://app-site-association.cdn-apple.com/a/v1/routes.defensivepedal.com
```
And compare the JSON body against the committed file. Tell you green/red.

### 3.5 Verify MIME type — **[CLAUDE]**
`curl -I` the file URL, confirm `Content-Type: application/json`.

### 3.6 Verify no redirect — **[CLAUDE]**
Same curl, confirm HTTP 200 (not 301/308).

---

## 4. Android Digital Asset Links (App Links)

File: `apps/web/public/.well-known/assetlinks.json`. Has 3 `FILL_ME_SHA256_*` placeholders.

### 4.1 Extract SHA-256 fingerprints — **[CLAUDE]** (already done)
I already extracted it from `apps/mobile/android/app/debug.keystore` that's committed in the repo:

```
FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

Per `build.gradle`, dev + preview + prod **all currently sign with this keystore**, so all three placeholders get this same value. I can paste it.

**When you eventually create a real release keystore (before Play Store):** you'll need to re-run `keytool` on *that* keystore and update the prod line. That's a slice-later task.

### 4.2 Paste into `assetlinks.json` — **[CLAUDE]**
I edit the file and replace all three placeholders. One edit.

### 4.3 Content-Type validation — **[CLAUDE]**
`curl -I https://routes.defensivepedal.com/.well-known/assetlinks.json` → confirm `application/json`.

### 4.4 Google Digital Asset Links API validation — **[CLAUDE]**
I hit:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://routes.defensivepedal.com&relation=delegate_permission/common.handle_all_urls
```
and confirm all 3 package entries come back. Tell you green/red.

---

## 5. Rebuild + install APKs — **[YOU]**

This is the hard boundary: my sandbox is Linux and can't run your Windows Gradle/ADB. Computer-use could open your Terminal but can't type into it (terminal apps are restricted tier). So **you run these commands**, I watch the output if you want.

Step-by-step:

1. Open Windows Terminal / PowerShell / Command Prompt.
2. `cd C:\dev\defpedal`
3. Confirm your phone is plugged in via USB and developer mode is on: `adb devices` — should list one device.
4. Run: `npm run build:preview:install`
   - This is the script documented in your `CLAUDE.md`. It syncs to `C:\dpb`, cleans cache, builds the preview APK, and installs.
   - Expect 5–15 minutes depending on cold/hot cache.
5. When it finishes, verify Android considers the app-link verified:
   ```
   adb shell pm get-app-links com.defensivepedal.mobile.preview
   ```
   Look for `Domain verification state: verified` next to `routes.defensivepedal.com`.
   - **If it says `legacy_failure` or `1026`**, the web files weren't live when Android did its first check. Fix: uninstall the app (`adb uninstall com.defensivepedal.mobile.preview`), confirm the web files are live, reinstall. (This is the order-matters footgun — see the warning section below.)

---

## 6. Manual link-tap smoke test — **[YOU]**

Requires your physical Android phone and your own messaging app. I have no way in.

Step-by-step:

1. **On your phone (preview APK installed):** open WhatsApp/SMS/whatever, send yourself a message containing the text `https://routes.defensivepedal.com/r/test`. Tap the link.
   - **Expected:** Defensive Pedal Preview opens directly (no browser chooser dialog). A "not yet implemented" toast appears — that's the T10 deep-link stub.
   - **If the browser chooser dialog appears:** App Link verification failed. Go to Troubleshooting in the main README.
2. **On your phone (uninstall preview APK first):** tap the same link again.
   - **Expected:** the browser renders the web 404 page at `/r/test`.
3. **In any browser:** visit `https://routes.defensivepedal.com/`.
   - **Expected:** the branded Defensive Pedal holding page loads.

Tell me the result of each of the 3 and I'll help debug any that fail.

---

## Critical sequence (from the original README — still applies)

The order-matters warning is real and I can't magic it away. The correct sequence:

1. **[CLAUDE]** Deploy web app with both `.well-known/*` files live on `routes.defensivepedal.com`.
2. **[MIXED]** Replace placeholders: I do the 3 SHA-256s immediately (I have the value); you give me the Apple Team ID, I do the 3 TEAM_IDs.
3. **[CLAUDE]** Redeploy.
4. **[CLAUDE]** Confirm Apple CDN returns green AND Google Digital Asset Links API returns all 3 package entries.
5. **[YOU]** Only THEN `npm run build:preview:install` and install the APK.

If you install the APK before step 4 finishes green, Android caches a verification failure for ~24h and links silently fall to the chooser dialog. Recovery is annoying (`adb shell pm set-app-links …`) but not catastrophic.

---

## Summary — what I need from you to proceed

To unblock the whole flow, I need from you **in one reply**:

1. **Domain decision** — do you already own `defensivepedal.com`, or do I need you to buy it? (If buying, which registrar?)
2. **Apple Team ID** — the 10-char string from `developer.apple.com/account → Membership`. *Or say "skip iOS for now"* and we'll leave the AASA placeholders until later.
3. **Sentry DSN** — create a project at `sentry.io` for `defpedal-web` and paste the DSN. *Or say "skip, slice 0 doesn't need it"* and I'll leave the env var blank in Vercel.
4. **Confirmation: "go"** — this is your green light for me to drive your browser (Vercel, DNS if applicable) and commit/push code changes.

Things I **don't** need from you to start:
- Supabase values — already in your repo
- Android SHA-256 — already extracted from the repo debug keystore
- Any Vercel credentials (you'll log in interactively once when I open the dashboard)

Things you'll do **after** my part finishes:
- Run `npm run build:preview:install` on your Windows machine (Section 5)
- Tap the three test URLs on your phone (Section 6)
- Report back so I can debug any failures

---

## Quick reference: Claude vs You

| Section | Who | Notes |
|---------|-----|-------|
| 1.1 Buy domain | **YOU** | Purchase + billing |
| 1.2 Create Vercel project | **CLAUDE** | With your login |
| 1.3 Attach domain | **CLAUDE** | With your login |
| 1.4 DNS records | **YOU or CLAUDE** | Depends on registrar |
| 1.5 Verify holding page | **CLAUDE** | curl |
| 2. Env vars (Supabase) | **CLAUDE** | Values in repo |
| 2. Env vars (PostHog/Sentry) | **YOU → CLAUDE** | You create accounts, I paste |
| 3.1 Find Apple Team ID | **YOU** | Your Apple ID |
| 3.2 Replace Team ID in file | **CLAUDE** | One edit |
| 3.3–3.6 Deploy + validate AASA | **CLAUDE** | Commit/push/curl |
| 4.1 Extract SHA-256 | **CLAUDE** ✅ done | Already have value |
| 4.2 Paste SHA-256 in file | **CLAUDE** | Three edits |
| 4.3–4.4 Validate assetlinks | **CLAUDE** | curl + Google API |
| 5. Rebuild + install APK | **YOU** | Windows Gradle/ADB |
| 6. Link-tap smoke test | **YOU** | Your phone |
