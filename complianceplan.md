# Google Play Store Compliance Plan — Defensive Pedal

**Status:** Plan only — no code changes yet.
**Source audit:** Compliance diagnosis run on branch `claude/review-play-store-compliance-DW47z` (2026-04-25).
**Scope:** All findings classified as Blocker, Warning, or Hardening, with concrete file-level fixes, owners, sequencing, and verification steps.

**Inputs from team (answers to open questions):**
- **Legal entity:** registered company (data-controller and ToS counterparty).
- **Data retention:** see §13 — *"forever" is defensible if account deletion is real and we self-prune inactive accounts.*
- **Moderation owner:** Victor (sole moderator).
- **Region rollout:** Romania only at launch — GDPR + DSA fully apply; localised legal copy mandatory.
- *(DPO contact still TBD — see Open questions §end.)*

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
- Publish privacy policy at `https://defensivepedal.com/privacy` covering (controller is the **registered company** — fill in legal name, registered office, **CUI** (Romanian fiscal code) and **J-number** from ONRC):
  - Identity: company legal name, registered office address, CUI / J-number, contact email (e.g. `privacy@defensivepedal.com`).
  - Data collected (per Phase 2 §9 inventory): location (precise + breadcrumbs, stored), email/name/avatar, telemetry, crash logs, push token, photos.
  - Purposes: navigation, hazard sharing, leaderboards, crash diagnostics.
  - Legal bases (GDPR Art. 6): contract performance (auth, navigation, trip history), legitimate interest (crash diagnostics, security, fraud prevention), consent (PostHog analytics, optional Sentry in EU).
  - Third parties: Supabase (DB/auth), Mapbox (tiles + geocoding), Sentry (errors), PostHog (product analytics), Expo Push, Open-Meteo (weather lat/lon).
  - International transfers: declare Standard Contractual Clauses (SCCs) for any sub-processor outside the EEA. Sentry, PostHog, Mapbox typically have EU-region options — pick those during configuration so the privacy policy can say "all processing in EU/EEA."
  - Retention: see §13 — "kept while the account is active; deleted on request via in-app or web; auto-purged after 24 months of inactivity."
  - User rights (GDPR Arts. 15–22): access, rectification, erasure (link to in-app + web flow), portability (JSON export from `/v1/profile/export`), restriction, objection, withdraw consent, complain to **ANSPDCP** (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal, B-dul G-ral. Gheorghe Magheru 28-30, București — `anspdcp@dataprotection.ro`).
  - Children: not directed at <16 (Romania's GDPR age of consent). Add an age-attest checkbox at signup.
  - DSA notice: in-app reporting, point of contact for authorities and users, transparency report if traffic crosses thresholds.
- Publish terms at `https://defensivepedal.com/terms` — Romanian consumer law (Legea 363/2007 on unfair B2C practices, OUG 34/2014 on consumer rights). Specify: governing law = Romania, venue = Bucharest courts, withdrawal right not applicable (digital service performed immediately with consent), no automatic renewal (no IAP), liability limits.
- **Romanian translations are mandatory** for both privacy policy and terms when the audience is RO-only consumers. Publish at `…/ro/privacy` and `…/ro/terms` and link the localised version from the in-app screens when device locale is `ro`.

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

**Operational (sole moderator: Victor)**
- A simple internal Supabase view + email alert on new `content_reports` rows. Email goes to `victor@defensivepedal.com` (or wherever Victor reads daily) — no Slack needed for one-person ops.
- **SLAs (single-moderator + DSA-compatible):**
  - **Illegal content** (CSAM, terrorism, hate speech, violent threats, doxxing): triage **within 24h**, removal immediate on confirmation. DSA Art. 16 obliges this regardless of team size.
  - **Other policy violations** (spam, harassment, off-topic): triage within **48h**, action within **7 days**.
  - **Holiday / OOO coverage:** when Victor is unavailable for >48h, **disable comment posting platform-wide** via a feature flag (`commentsEnabled` in app extras / API config) until back. Existing comments stay visible; new comments queued or rejected with "Comments temporarily paused" toast. This is acceptable to Play — pausing UGC ≠ removing the report mechanism.
  - Document an escalation path: if Victor is incapacitated, Supabase admin access is delegated to a named co-founder / lawyer with read access to `content_reports`.
- **Reduce inbound volume** (so 1 person can keep up):
  - Length limits: comments ≤ 280 chars (already), hazard descriptions ≤ 280 chars (already), display name ≤ 32 chars.
  - Server-side regex prefilter for obvious slurs — auto-`is_hidden=true` plus a `content_reports` row tagged `auto_filter=true` for Victor to review later. Use a Romanian + English wordlist; iterate.
  - Rate limit: 3 comments / 15 min / user; 5 hazards / 30 min / user.
  - Anonymous (Supabase anon) users **cannot** comment or post hazards — only OAuth users (already partially gated; tighten in `feed-comments.ts` and `hazards.ts`).
  - Strip URLs from comments by default (or auto-flag any comment containing `http://` / `https://` for review).
- **DSA point of contact** (Art. 11–12) — publish `dsa@defensivepedal.com` (or use the same `privacy@…` mailbox) in the privacy policy and on the website footer. Required even at low scale.
- Add to Play listing: contact email for content concerns (same mailbox).
- **Annual transparency report** — only required if monthly active recipients in EU exceed thresholds, but it's good practice. One paragraph in `/transparency` listing reports received / actioned / time-to-action is enough for the first year.

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
- Retention: while account active; **raw GPS breadcrumbs auto-truncated after 90 days**; inactive-account purge at 24 months. (Per §13.)
- Data committed to Play *Families* policy: **No** (not child-directed; min age 16 in RO).
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

### 13. Data retention — recommendation (answer to open question §3)

**Bottom line:** Play Store itself does **not cap** retention duration. *"Retain forever while the account is active"* is allowed **provided** all of the following are true; otherwise it triggers GDPR + Data-Safety risk, not a Play removal per se.

**Conditions for "forever-while-active" to be defensible:**
1. **Real, complete deletion on request.** Phase 1 §1 (account deletion) makes this true. Without it, indefinite retention is a Data-Safety violation regardless of what the policy says.
2. **Disclosed in privacy policy and Data Safety form.** Use the wording: *"We keep your trips, hazard reports, profile and analytics for as long as your account is active. You can delete your account at any time, which removes all of it within 30 days."*
3. **Stated, lawful purpose for each category.** Lifetime stats (badges, leaderboards, "lifetime CO₂") justify retaining trip summaries forever; navigation does not justify retaining individual GPS breadcrumb arrays forever.
4. **Inactive-account auto-purge.** GDPR Art. 5(1)(e) ("storage limitation") expects a defined ceiling. Without one, regulators (ANSPDCP) — not Play — will raise it.

**Concrete recommendation for Defensive Pedal (RO launch):**

| Data | Retention default | Justification |
|---|---|---|
| `auth.users` row, `profiles` | While account active; deleted on request | Account management |
| `trips` (summary: distance, duration, CO₂, route mode) | While account active | Lifetime stats, badges, XP integrity |
| `trip_tracks.gps_trail` (raw breadcrumb array) | **90 days, then auto-truncate** keeping only summary stats | Limits the high-sensitivity precise-location dataset; users who want full history can opt in via a toggle |
| `hazards` | 45 days past `expires_at` (existing `hazard_resurrection_grace_45d` migration) | Already implemented |
| `feed_comments`, `feed_likes`, `trip_loves` | While account active; deleted on user delete or comment delete | Community feed coherence |
| `rider_xp_log` | While account active | Tier integrity |
| `leaderboard_snapshots` | 24 months rolling | Already a snapshot table; older ones aren't queried |
| `mia_*` telemetry events | 12 months | Diagnostic, not user-facing |
| **Inactive-account purge** | **24 months without app open** → soft-delete, with 30-day email warning | GDPR storage-limitation defence |

**Implementation tasks for §13:**
1. New migration `202604280001_retention_policies.sql`:
   - Function `truncate_old_gps_trails()` that nulls `gps_trail` (or replaces with `[]`) on `trip_tracks` older than 90 days. Schedule daily via Cloud Scheduler `retention-gps-truncate-cron` (3 AM Bucharest).
   - Function `purge_inactive_users()` that flags users whose latest `trips.created_at` and `auth.users.last_sign_in_at` are both >24 months old. Schedule weekly. Send one warning email at 23 months via Supabase Edge Function.
   - Confirm both jobs respect anonymisation rules in the leaderboard snapshots already established.
2. `useDataRetention` settings panel in profile: toggle "Keep my full GPS history" (default off after migration; opt-in to override the 90-day truncate). Persisted in `profiles.preferences.keep_full_gps_history`.
3. Document the policy in the privacy policy and the Data Safety form.

**Why not "literally forever even if inactive":** ANSPDCP enforcement guidance follows EDPB; sustained inactive retention is the most common Romanian DPA finding. A 24-month inactive cap is conservative and leaves room for sporadic users.

---

### 14. Romania-only launch — country-specific items

**Why:** Restricting to Romania at launch concentrates GDPR + DSA obligations and adds Romania-specific consumer-protection rules. Most of these are paperwork, not engineering.

**Play Console**
- Country availability: select **Romania only**. Reopen for additional EU countries one at a time after privacy policy + ToS are also localised for them.
- Default language: **Romanian (ro-RO)**. Provide Romanian store listing (title, short description ≤80 chars, full description ≤4000 chars), and Romanian feature graphic + screenshots.
- Content rating: complete IARC questionnaire honestly — UGC + map of user-reported hazards = **PEGI 12** likely (mild risk references). Re-run after every UGC change.
- Pricing: free, no IAP — no VAT registration required for the app itself.
- Tax: company is RO-resident, so Play's payments tax setup uses RO VAT identity.

**In-app**
- Default device locale `ro` → render UI in Romanian. Audit `useT()` keys: every user-visible string must have a `ro` translation. The legal-copy strings (consent screen, deletion warning, FAQ "Privacy & Data", auth footer) are non-negotiable.
- App name on store listing remains "Defensive Pedal" (English brand is fine in RO).
- Date / number / unit formats: km (already), 24h time (already), Romanian month names.

**Legal**
- ToS governing law and forum: Romania, Bucharest courts.
- Romanian consumer-rights statement under OUG 34/2014: include in ToS — note that since the service is digital and performed immediately upon account creation **with explicit consent**, the 14-day withdrawal right does not apply (Art. 16(m)). Capture that consent at signup with a checkbox: *"Sunt de acord cu prestarea imediată a serviciului și înțeleg că pierd dreptul de retragere de 14 zile"* — log timestamp + IP.
- ANSPDCP registration: not required for routine processing, but a **DPIA (Data Protection Impact Assessment)** is recommended given continuous precise-location processing. One-page DPIA stored internally, reviewed annually.
- Cookie policy: not required in-app, but if `defensivepedal.com` uses analytics cookies, publish a Romanian-language cookie banner per Legea 506/2004.

**Romania-specific edge cases**
- Romanian special characters (`ăâîșț`) in display names and comments: confirm Postgres `text` columns and JSON-Schema validation on `feed_comments.body` accept them; confirm Mapbox SymbolLayer renders them (test on physical device).
- Phone-number entry not used (no SMS auth) — skip RFC compliance for now.
- Public holidays in scheduled jobs: Cloud Scheduler in `Europe/Bucharest` already handles DST and 1-Dec, 1-May, 25-Dec correctly — no changes.

---

## Sequencing & gating

```
Week 1  ── Blocker #1 (deletion)  ── Blocker #4 (FG service)  ── Blocker #5 (signing)
        └── Company info collected (CUI, J-number, address) for §3 + §14.
Week 2  ── Blocker #3 (privacy + FAQ, EN + RO copy)  ── Warning #8 (asset links)  ── Warning #10 (AAB default)
        └── Internal alpha build, ad-hoc smoke test on 2 devices.
Week 3  ── Blocker #2 (UGC moderation, with Victor SLA + pre-filters)  ── Warning #7 (consent)
        └── §13 retention migrations + GPS truncate cron deployed.
Week 4  ── Warning #9 (Data Safety form filled in Console)  ── Warning #6 short-term (network config)
        └── §14 RO-specific: ro-RO store listing, content rating, ANSPDCP DPIA drafted.
        └── Closed testing track open (20 RO testers, 14-day requirement for production rollout).
Week 5+ ── Phase 3 hardening (TLS for OSRM)  ── Production rollout request (RO only).
```

**Do not submit for production review until:**
- All five blockers (#1, #2, #3, #4, #5) are merged + verified on a real Android 14+ device.
- 14-day closed-test period has elapsed with ≥20 active testers.
- Data Safety + Background Location declaration forms are filled.
- Privacy policy URL responds 200 from a fresh IP.
- `assetlinks.json` validates via Google's tester.

---

## Open questions for the team

1. ~~**Legal entity**~~ — **Resolved:** registered company. Need: legal name, registered office, **CUI**, **J-number** to drop into the privacy policy and ToS templates.
2. **DPO appointment** — under GDPR Art. 37, a Data Protection Officer is mandatory only when core activities consist of "large-scale, regular, systematic monitoring of data subjects." A small RO-only navigation app most likely doesn't meet that bar, but precise-location processing of all users continuously is the kind of activity ANSPDCP scrutinises. **Recommendation:** name a *privacy contact* (does not have to be a formal DPO) — typically the founder or external counsel — and publish that contact email. Re-evaluate when MAU passes ~5,000 in RO.
3. ~~**Data retention defaults**~~ — **Resolved by §13:** active = while account active, raw GPS auto-truncated at 90 days, inactive accounts auto-purged at 24 months.
4. ~~**Moderation staffing**~~ — **Resolved:** Victor is sole moderator. SLA, OOO pause-comments switch, and pre-filter automation defined in §7.
5. ~~**Region rollout**~~ — **Resolved:** Romania-only launch. RO-specific items captured in §14.

**New questions surfaced by the answers above:**

6. **Privacy contact mailbox** — `privacy@defensivepedal.com` and `dsa@defensivepedal.com` aliases. Are they provisioned, or do we route both to Victor's mailbox initially?
7. **Sub-processor regions** — confirm the Sentry, PostHog, Mapbox, and Supabase projects are all on EU-region tenants. If not, schedule a migration before launch so the privacy policy can truthfully say "all processing in EU/EEA."
8. **DPIA owner** — one-page Data Protection Impact Assessment for continuous precise-location processing. Outside-counsel quote vs. Victor-drafted is a $0 / $500 trade-off.
9. **Opt-in toggle for full GPS history** (§13) — UX decision: bury under Profile → Privacy, or surface during onboarding? Default-off keeps the 90-day truncate honest; default-on shifts liability.

---

*End of plan. No code has been changed.*
