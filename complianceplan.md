# Google Play Store Compliance Plan — Defensive Pedal

**Status:** Plan only — no code changes yet.
**Source audit:** Compliance diagnosis run on branch `claude/review-play-store-compliance-DW47z` (2026-04-25).
**Scope:** All findings classified as Blocker, Warning, or Hardening, with concrete file-level fixes, owners, sequencing, and verification steps.

---

## Phase 0 — Triage summary

| # | Issue | Severity | Effort | Phase |
|---|-------|----------|--------|-------|
| 1 | No in-app account deletion | Blocker | M | 1 |
| 2 | UGC has no report / block / moderation | Blocker | L | 2 |
| 3 | No privacy policy + false FAQ statement | Blocker | M | 1 |
| 4 | Foreground service type missing for background location | Blocker | S | 1 |
| 5 | Release build falls back to debug keystore | Blocker | S | 1 |
| 6 | Cleartext HTTP to bare-IP OSRM, app-wide flag | Warning | M | 3 |
| 7 | Anonymous auth collects PII before consent | Warning | M | 2 |
| 8 | Deep-link `autoVerify=true` without `assetlinks.json` | Warning | S | 1 |
| 9 | Data Safety form will be wrong by default | Warning | S | 2 |
| 10 | Default release artefact is APK, not AAB | Warning | S | 1 |

Phases:
- **Phase 1 — Pre-submission must-do (1–2 weeks).** Anything Play will reject on at the upload screen or first review pass.
- **Phase 2 — Closed-testing must-do (2–3 weeks).** Required for Data Safety truthfulness and UGC policy before opening to external testers.
- **Phase 3 — Hardening before production rollout (after closed test).** Reduces review-board scrutiny + improves user trust.

---

## Phase 1 — Pre-submission blockers

### 1. Account deletion (Blocker #1)

**Why:** Play *User Data* policy requires both an in-app deletion path and a public web URL. Apps without it are removed.

**Server (`services/mobile-api/`)**
1. Add `DELETE /v1/profile` route in `services/mobile-api/src/routes/v1.ts`:
   - Auth: `requireFullUser` (anonymous rejected — they have nothing to delete except an anon row).
   - Body: `{ confirmation: 'DELETE' }` to prevent accidents.
   - Action: hard-delete or anonymise (whichever satisfies legal) the following Supabase rows where `user_id = auth.uid()`:
     - `trips`, `trip_tracks`, `trip_shares`, `feed_likes`, `trip_loves`, `feed_comments`
     - `hazards`, `hazard_validations`
     - `rider_xp_log`, `leaderboard_snapshots` (anonymise — keep aggregate but null user_id)
     - `push_tokens`, `profiles`
     - `auth.users` row (Supabase admin call: `supabaseAdmin.auth.admin.deleteUser(uid)`)
   - Wrap in a Postgres function `delete_user_cascade(uid uuid)` (new migration `202604260001_delete_user_cascade.sql`) so deletion is atomic.
   - Returns `204 No Content` on success.
2. Add tests in `services/mobile-api/src/__tests__/` covering: success, anonymous user 403, partial-failure rollback.

**Mobile (`apps/mobile/`)**
1. New action in `src/lib/api.ts`: `deleteAccount()`.
2. `app/profile.tsx` Account section: add `SettingRow` "Delete account" (red, after Sign out) → opens `DeleteAccountScreen`.
3. New screen `app/delete-account.tsx`:
   - Explains what is deleted.
   - "Type DELETE to confirm" text input.
   - On submit: call API → on 204, call `signOut()`, clear AsyncStorage + MMKV, route to `/auth`.
4. Add to FAQ ("Privacy & Data" section): "How do I delete my account?".

**Web**
- Static page at `https://defensivepedal.com/account-deletion` describing the same process for users who can't open the app. Link from Play Console listing.

**Verification**
- E2E: create account, run trip, share trip, delete account → Supabase rows for that `user_id` are gone (verify with SQL).
- Play Console listing: paste the web URL into the *Account deletion* field on the Data Safety form.

---

### 2. Foreground service type for background location (Blocker #4)

**Why:** Android 14 (API 34) crashes `startForegroundService` if the type is missing. Expo SDK 55 targets API 35 by default.

**Fixes**
1. Add `FOREGROUND_SERVICE_LOCATION` to `apps/mobile/app.config.ts:213-221` permissions list.
2. New config plugin `apps/mobile/plugins/withAndroidForegroundServiceLocation.js`:
   - Walks the manifest XML produced by `expo-location`'s autolink, finds the location service node, sets `android:foregroundServiceType="location"`.
   - Pattern: copy `withAndroidCleartextTraffic.js`, switch to iterating `manifest.application[0].service`.
3. Register the plugin in `app.config.ts` `plugins` array, after `expo-location`.
4. Verify with `npx expo prebuild --platform android --clean` then `grep foregroundServiceType apps/mobile/android/app/src/main/AndroidManifest.xml`.

**Verification**
- Build a preview APK on Android 14+ device, start navigation, lock screen for 5 min, ensure no crash and the foreground notification stays alive.
- Submit *Background Location Access Declaration* form in Play Console with a 30-second screen recording of turn-by-turn navigation locked.

---

### 3. Privacy policy + fix false FAQ statement (Blocker #3)

**Why:** Required by Play listing. The current FAQ claims GPS isn't stored — it is. That's a Deceptive Behavior policy violation.

**Web (out-of-repo)**
- Publish privacy policy at `https://defensivepedal.com/privacy` covering:
  - Identity: legal entity, contact email.
  - Data collected (per Phase 2 §9 inventory): location (precise + breadcrumbs, stored), email/name/avatar, telemetry, crash logs, push token, photos.
  - Purposes: navigation, hazard sharing, leaderboards, crash diagnostics.
  - Third parties: Supabase (DB/auth), Mapbox (tiles + geocoding), Sentry (errors), PostHog (product analytics), Expo Push, Open-Meteo (weather lat/lon).
  - Retention: trips/tracks held until account deleted; aggregated analytics retained X months.
  - User rights: access, deletion (link to in-app + web flow), opt-out of telemetry.
  - Children: not directed at <13 / <16 (DSA).
  - GDPR / Romania DPA contact.
- Publish terms at `https://defensivepedal.com/terms`.

**Repo changes**
1. `apps/mobile/app/faq.tsx:140-147` — rewrite "Is my location data shared?" to truthfully state:
   - GPS breadcrumbs are uploaded for trip history, leaderboards, and community sharing.
   - Hazard reports include a coordinate and (optional) text; usernames are visible.
   - Account deletion removes all of this.
2. New screen `app/legal.tsx` listing privacy + terms links (opens in `expo-web-browser`).
3. `app/profile.tsx` Account section: "Privacy policy" and "Terms" rows.
4. `app/auth.tsx`: footer "By continuing you agree to our Terms and Privacy Policy" with tappable links **before** sign-in.
5. Onboarding screen 1 (location request): show inline link to privacy policy.

**Verification**
- All three URLs load 200.
- Play Console listing has the privacy URL set.

---

### 4. Release signing fallback to debug keystore (Blocker #5)

**Why:** A debug-signed AAB silently uploaded to Play permanently locks you out from updating with the real key.

**Fix**
- Edit `apps/mobile/android/app/build.gradle` around line 116-151:
  - Replace the ternary with an explicit failure when the property is missing for `releasePreview` / `releaseProduction`:
    ```
    if (!project.hasProperty("DEFPEDAL_UPLOAD_STORE_FILE")) {
        throw new GradleException("Release builds require DEFPEDAL_UPLOAD_STORE_FILE in ~/.gradle/gradle.properties")
    }
    ```
  - Allow debug fallback only for `developmentDebug`.
- Document the four required gradle properties in `mobile_release_runbook.md`:
  - `DEFPEDAL_UPLOAD_STORE_FILE`, `DEFPEDAL_UPLOAD_STORE_PASSWORD`, `DEFPEDAL_UPLOAD_KEY_ALIAS`, `DEFPEDAL_UPLOAD_KEY_PASSWORD`.

**Verification**
- `./gradlew assembleProductionRelease` without the property fails with a clear message.
- With the property set, `apksigner verify --print-certs app-production-release.aab` shows the expected SHA-256 of the upload key.

---

### 5. Asset Links file for deep-link verification (Warning #8)

**Why:** `autoVerify=true` is declared (`app.config.ts:228`) but the file isn't published. Pre-launch report flags it.

**Fix**
1. Get the SHA-256 fingerprint of the **upload key** (and Play App Signing key once enrolled — both fingerprints must be in the file):
   ```
   keytool -list -v -keystore upload.keystore -alias <alias>
   ```
2. Publish at `https://routes.defensivepedal.com/.well-known/assetlinks.json`:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.defensivepedal.mobile",
       "sha256_cert_fingerprints": ["<UPLOAD_SHA256>", "<PLAY_SIGNING_SHA256>"]
     }
   }]
   ```
3. Verify with Google's tester:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://routes.defensivepedal.com&relation=delegate_permission/common.handle_all_urls`
4. On a release build: `adb shell pm get-app-links com.defensivepedal.mobile` → state `verified`.

---

### 6. Default production build = AAB (Warning #10)

**Why:** Play rejects APK uploads for new apps.

**Fix**
1. Update `scripts/build-preview.sh` to default to `bundleRelease` when target is `production`.
2. Update `npm run build:production` (add if missing) to invoke `eas build --profile production --platform android` (already produces `.aab`).
3. Update `mobile_release_runbook.md` with the AAB upload procedure (Play Console → Production track → Upload AAB).
4. Add a CI check that fails if a production artefact is `.apk`.

---

## Phase 2 — Closed-testing must-do

### 7. UGC reporting + blocking + moderation (Blocker #2)

**Why:** Apps with user-visible text/photos must ship Report, Block, and have a moderation pipeline.

**Schema**
1. New migration `202604270001_ugc_moderation.sql`:
   - `content_reports(id uuid pk, reporter_user_id uuid, target_type text check in ('comment','hazard','trip_share','profile'), target_id uuid, reason text, details text, status text default 'pending', created_at)`
   - `user_blocks(blocker_user_id uuid, blocked_user_id uuid, created_at, primary key(blocker_user_id, blocked_user_id))`
   - Add `is_hidden boolean default false` to `feed_comments`, `hazards`, `trip_shares`.
   - RLS: blocked users' content is filtered from all feed/comment/hazard reads.

**API (`services/mobile-api/`)**
1. New routes file `src/routes/moderation.ts`:
   - `POST /v1/reports` — body `{ targetType, targetId, reason, details? }`. Rate-limited (5 / 10 min).
   - `POST /v1/users/:id/block` and `DELETE /v1/users/:id/block`.
   - `GET /v1/users/blocked` — list.
2. Update existing list/feed endpoints (`feed.ts`, `v1.ts` hazards/feed) to:
   - Filter out rows from `user_blocks` where current user is blocker.
   - Filter out `is_hidden = true`.

**Mobile**
1. New molecule `src/design-system/molecules/ReportSheet.tsx` — bottom sheet with reason picker (spam, harassment, hate, sexual, violence, illegal, other) + free-text details.
2. Long-press on `FeedCard`, comment row, hazard detail sheet → opens overflow menu with "Report" and "Block user".
3. Long-press on a profile (community feed avatar) → "Block user".
4. New screen `app/blocked-users.tsx` accessible from Profile → Account → Blocked users.
5. `useReportContent` and `useBlockUser` hooks (TanStack mutations + optimistic hide).

**Operational**
- A simple internal Supabase view + email alert (or Slack) on new `content_reports` rows for triage. Document SLA: 24h triage, 72h action.
- Add to Play listing: contact email for content concerns.

**Verification**
- E2E: User A posts comment, User B reports → entry in `content_reports`. User B blocks User A → A's content disappears from B's feed within one query refresh.

---

### 8. Pre-collection consent for analytics + better anon-auth posture (Warning #7)

**Why:** GDPR + Play *Data Safety* truthfulness require consent before non-essential telemetry. Sentry + PostHog currently fire on cold start under an anonymous Supabase session.

**Fixes**
1. New onboarding step (after location screen, before signup) — "Help us improve" with two toggles:
   - "Share crash reports" (Sentry) — default off in EU, on elsewhere (server-side `appEnv` check).
   - "Share product analytics" (PostHog) — default off.
2. Add `analyticsConsent: { sentry: boolean; posthog: boolean; capturedAt: string | null }` to Zustand persisted store.
3. Lazy-init Sentry/PostHog only when consent is granted; gate `Sentry.init()` and `PostHog.init()` behind the consent flag.
4. Profile → Account → "Privacy & analytics" screen exposes the toggles after onboarding.
5. For anonymous users: do not send `displayName` / `email` (they have none); telemetry events keyed on `anon_user_id`.
6. Update FAQ + privacy policy to reflect that telemetry is opt-in.

**Verification**
- Cold-launch a fresh install, decline both toggles → Sentry/PostHog network requests are zero (verify with `adb logcat` + Charles).
- Toggle on → events appear within 30s.

---

### 9. Data Safety form (Warning #9)

**Why:** Truthful disclosure is a Play policy. Mismatch between declared and observed = removal.

**Fill-in (paste verbatim into Play Console after Phase 1 + 2 fixes land):**

| Category | Type | Collected | Shared | Required | Purposes |
|---|---|---|---|---|---|
| Location | Approximate | Yes | Yes (Supabase, Mapbox, Open-Meteo) | Required | App functionality (routing, weather, hazards) |
| Location | Precise | Yes | Yes (Supabase, Mapbox) | Required | App functionality, analytics (opt-in) |
| Personal info | Email | Yes | Yes (Supabase) | Required | Account management |
| Personal info | Name | Yes | Yes (Supabase) | Optional | Account management |
| Personal info | User IDs | Yes | Yes (Supabase, Sentry, PostHog) | Required | Account management, analytics |
| Photos & videos | Photos | Yes | Yes (Supabase storage) | Optional | App functionality (avatar, share cards) |
| App activity | In-app actions | Yes | Yes (PostHog) | Optional (consent) | Analytics |
| App activity | Other actions (hazards, feed) | Yes | Yes (Supabase) | Required | App functionality |
| App info & performance | Crash logs | Yes | Yes (Sentry) | Optional (consent) | Diagnostics |
| App info & performance | Diagnostics | Yes | Yes (Sentry) | Optional (consent) | Diagnostics |
| Device or other IDs | Device ID | Yes | Yes (Expo, Mobile API) | Required | Push notifications |

- Encryption in transit: **Yes** (HTTPS, except routing requests to `34.116.139.172` — see #6).
- Account deletion: **Yes**, in-app + web.
- Data committed to Play *Families* policy: **No** (not child-directed).
- Independent security review: leave blank unless one is performed.

---

## Phase 3 — Hardening

### 10. Cleartext HTTP scoping + TLS for OSRM (Warning #6)

**Why:** App-wide cleartext flag is overscoped; routing requests carry user start GPS in plaintext.

**Short-term (this release):**
1. Replace `usesCleartextTraffic="true"` with a `network_security_config.xml` referenced in the manifest:
   ```xml
   <network-security-config>
     <base-config cleartextTrafficPermitted="false" />
     <domain-config cleartextTrafficPermitted="true">
       <domain includeSubdomains="false">34.116.139.172</domain>
     </domain-config>
   </network-security-config>
   ```
2. Update `plugins/withAndroidCleartextTraffic.js` (rename to `withAndroidNetworkSecurityConfig.js`):
   - Writes the XML to `android/app/src/main/res/xml/network_security_config.xml`.
   - Sets `android:networkSecurityConfig="@xml/network_security_config"` on `<application>`.
3. Match iOS `NSAppTransportSecurity` exception (already scoped to that IP — keep).

**Long-term (next release):**
1. Put a Cloud Run + HTTPS LB (or Caddy) in front of the OSRM VM. Issue a Let's Encrypt cert for e.g. `osrm.defensivepedal.com`.
2. Update `mapbox-routing.ts` URLs to `https://osrm.defensivepedal.com/route/v1/bicycle` and `…/bicycle-flat`.
3. Remove the cleartext exception entirely (delete the plugin and the iOS `NSExceptionDomains` block).

---

### 11. Dev-only artefacts that must never reach production

**Audit and confirm absent from production AAB:**
- `devAuthBypass*` extras — already gated by `appVariant === 'development'` in `app.config.ts:283-304`. Verify with `aapt2 dump badging` + extract `Constants.expoConfig.extra` from the bundle.
- `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` in `gradle.properties:60` — fine in dev, ensure release build doesn't expose the inspector port. Add a `release` build-type override if needed.
- `debug.keystore` not packaged — covered by Blocker #5 fix.

---

### 12. Accessibility, content rating, store listing polish (nice-to-have)

These don't block submission but reduce review friction:
- Run `npx expo prebuild` then `lint` Android Studio's *Pre-launch checks* — fix any contrast / touch-target warnings.
- Generate Content Rating Questionnaire answers consistent with the UGC moderation features.
- Localised store listing for `ro-RO` (target market).
- Screenshot set: 4–8 phone screenshots covering planning → preview → navigation → impact → community.
- Short description ≤ 80 chars, full description ≤ 4000.

---

## Sequencing & gating

```
Week 1  ── Blocker #1 (deletion)  ── Blocker #4 (FG service)  ── Blocker #5 (signing)
Week 2  ── Blocker #3 (privacy + FAQ)  ── Warning #8 (asset links)  ── Warning #10 (AAB default)
        └── Internal alpha build, ad-hoc smoke test on 2 devices.
Week 3  ── Blocker #2 (UGC moderation)  ── Warning #7 (consent)
Week 4  ── Warning #9 (Data Safety form filled in Console)  ── Warning #6 short-term (network config)
        └── Closed testing track open (20 testers, 14-day requirement for production rollout).
Week 5+ ── Phase 3 hardening (TLS for OSRM)  ── Production rollout request.
```

**Do not submit for production review until:**
- All five blockers (#1, #2, #3, #4, #5) are merged + verified on a real Android 14+ device.
- 14-day closed-test period has elapsed with ≥20 active testers.
- Data Safety + Background Location declaration forms are filled.
- Privacy policy URL responds 200 from a fresh IP.
- `assetlinks.json` validates via Google's tester.

---

## Open questions for the team

1. **Legal entity** for the privacy policy — individual or registered company? Affects GDPR data-controller field.
2. **DPO contact** — required if processing is large-scale (likely no, but document the call).
3. **Data retention defaults** — how long to keep `trip_tracks` for active users? (Current: forever.) Consider 24-month auto-purge with user opt-out.
4. **Moderation staffing** — who triages `content_reports` rows? Need a name + 24h SLA owner before opening UGC to closed testers.
5. **Region rollout** — production launch limited to RO at first? Affects content-rating + GDPR-only consent toggles.

---

*End of plan. No code has been changed.*
