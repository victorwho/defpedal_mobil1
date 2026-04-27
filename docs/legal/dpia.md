# Data Protection Impact Assessment — Defensive Pedal

> **Status: DRAFT — pending Romanian legal counsel review.** This document is
> a working draft assembled from the shipped behavior of the application. It
> follows the CNIL / EDPB DPIA template structure and is intended to satisfy
> GDPR Article 35 prior to closed-test launch in Romania. **Do not treat this
> as the final filed version** until counsel has reviewed and signed the
> back-page certification block.

- **Document version:** 0.1
- **Date drafted:** 2026-04-27
- **Author:** Victor Rotariu (data controller)
- **Reviewers required before sign-off:** Romanian legal counsel; ANSPDCP
  consultation if counsel recommends it.
- **Next review trigger:** any of the following — adding paid features, adding
  ad SDKs, expanding beyond Romania, migrating Supabase out of US region,
  introducing new processors, or after 12 months elapsed.

---

## 1. Context

### 1.1 Processing operations covered

This DPIA covers the personal-data processing performed by the **Defensive
Pedal** mobile application (Android, package `com.defensivepedal.mobile`),
its accompanying API (`defpedal-api` on Google Cloud Run), the supporting
Supabase database, and the auxiliary services listed in section 1.4.

### 1.2 Why a DPIA is required

Per GDPR Art. 35(3) and the EDPB / WP29 criteria, a DPIA is required when
the processing involves at least two of the following nine criteria.
Defensive Pedal triggers **three**, which clearly establishes the obligation:

| Criterion | Why it applies |
|---|---|
| **Tracking / monitoring** | Real-time GPS tracking during navigation; persisted breadcrumb trails |
| **Innovative use of technology / large data sets** | Custom safety-scored routing built on aggregated road-risk data |
| **Data shared between data subjects** | Hazard reports + ride shares are visible to other riders, with the originator's username attached |

The processing is also of **special category** sensitivity in one indirect
respect: the precision of GPS data combined with regular commute patterns
makes inferring **home and workplace addresses** trivially possible. The
mitigations in section 4 explicitly address this re-identification risk.

### 1.3 Purposes of processing

| Purpose | Lawful basis (GDPR Art. 6) |
|---|---|
| Provide cycling navigation and safety-scored routing | (b) Performance of contract — the user installed the app to use this feature |
| Maintain trip history, achievements, leaderboard, badges | (b) Performance of contract |
| Detect and warn about hazards reported by other riders | (b) Performance of contract; (f) Legitimate interest in rider safety |
| Capture crash reports for diagnostics | (f) Legitimate interest with `sendDefaultPii: false` ; **opt-out available** |
| Capture product analytics for usage measurement | (a) **Explicit consent** required (PostHog anonymous-event posture is partial mitigation; full consent at first launch and re-consent screen in Profile) |
| Send push notifications (daily weather, weekly impact, social digest) | (b) Performance of contract for transactional notifications; per-channel toggles available in Profile for marketing-style channels |
| Comply with legal obligations (DSA UGC moderation, GDPR rights, OUG 34) | (c) Compliance with legal obligation |

### 1.4 Data flows and processors

| Processor | Role | Region | What it sees |
|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Primary database, user authentication, profile photos | US (`uobubaulcdcuggnetzei`) — see §4 risk R7 | Account data, trip data, GPS breadcrumbs, hazards, comments, profile photos |
| **Google Cloud Run** (`defpedal-api`) | Stateless API server, request handling | EU (`europe-central2`) | Transit-level access to all of the above |
| **Mapbox** | Map tiles, geocoding, routing fallback | EU + US edge POPs | Route start / end coordinates, search queries |
| **Open-Meteo** | Weather + AQI lookups | EU (Germany) | Approximate location (rounded for weather lookup) |
| **OSRM** (self-hosted on GCP) | Safety-scored routing engine | EU (`europe-central2-c`, IP `34.116.139.172`) | Route start / end coordinates **(plaintext HTTP, see R5)** |
| **Sentry** | Crash reports (opt-in) | EU (`de.sentry.io`) | Stack traces, device model, OS version. **No PII** (`sendDefaultPii: false`) |
| **PostHog** | Product analytics (opt-in) | EU | Event names, anonymous ID, screen names. **No GPS, no PII** |
| **Expo Push** | Push notification delivery | US (Expo / Cloudflare) | Push token + notification payload (no GPS in payload) |
| **Resend** (planned, see retention runbook) | Inactive-warning email mailer | EU | Email address only |

### 1.5 Data subjects

- **Romanian cyclists** using the app for navigation, hazard reporting, and the
  community feed.
- **Minimum age 16** per Terms of Service. The app does **not** target
  children under 13 and does not knowingly collect data from them.
- Anonymous use is supported (Supabase anonymous sessions) so users can
  evaluate the app without creating an identifiable account; in this mode the
  data tied to them is purely device-local (`device_id`).

### 1.6 Data categories

| Category | Examples | Sensitivity |
|---|---|---|
| Account identifiers | User ID (UUID), email address | Standard |
| Profile data | Display name, username, avatar photo | Standard |
| **Precise location data** | Real-time GPS during navigation, breadcrumb trails (≤90 days), hazard coordinates | **Elevated** (re-identification risk — see R1) |
| Approximate location | City / neighborhood label for community stats | Standard |
| Behavioral data | Trip count, distances, badges, XP, streak history | Standard |
| User-generated content | Hazard descriptions, ride-share captions, comments | Standard, post-moderation |
| Device / technical | Device model, OS version, app version, push token | Standard |
| Crash diagnostics (opt-in) | Stack traces, breadcrumbs | Standard |
| Product analytics events (opt-in) | Anonymous event names, screen names | Standard |
| Server access logs | IP address, request timestamp | Standard, 12-month retention |

No special-category data (Art. 9) is processed: no health data, no political
opinions, no religious affiliation, no biometric identifiers, no sexual
orientation. CO₂ savings and "microlives" are **environmental** metrics
derived from distance and bike type — not health data.

---

## 2. Fundamental principles

### 2.1 Necessity and proportionality

| Principle | Assessment |
|---|---|
| **Lawfulness** | Each purpose tied to a specific Art. 6 basis (see §1.3). Analytics + crash defaults to ON for first-time users; counsel review is flagged in `docs/plans/compliance-implementation-plan.md` and the Privacy & Analytics screen makes opt-out one-tap. |
| **Fairness and transparency** | Privacy policy at `routes.defensivepedal.com/privacy` summarises all data flows. In-app FAQ corrects the previously-misleading statement about GPS tracks (corrected in commit `cea1d2b`). |
| **Purpose limitation** | Each data category is used only for the purpose that justified its collection. We do not sell data. We do not use it for advertising. |
| **Data minimisation** | GPS breadcrumbs are retained at full resolution for 90 days only, then truncated to `[]`. Profile photos and display names are optional. Anonymous use is supported. |
| **Accuracy** | Users can edit profile fields directly. Hazard reports have an up/down vote system that surfaces stale or false reports. |
| **Storage limitation** | Retention pipeline (item 13) implements: 90-day GPS truncate, 45-day hazard expiry, 24-month inactive-account purge with 30-day warning. See `docs/ops/retention-runbook.md`. |
| **Integrity and confidentiality** | All transit encrypted **except** OSRM endpoint (see R5). At-rest encryption per Supabase + GCP defaults. Service-role keys held server-side only. |
| **Accountability** | This DPIA, the moderation runbook, the retention runbook, and the privacy policy form the documentation. |

### 2.2 Data subject rights

| Right | Implementation |
|---|---|
| Information (Art. 13–14) | Privacy policy at `/privacy`, in-app FAQ, signup-screen footer |
| Access (Art. 15) | Email request to `privacy@defensivepedal.com`. Export endpoint **not yet implemented** — TODO before scaling beyond closed test |
| Rectification (Art. 16) | In-app profile editing |
| Erasure (Art. 17) | In-app via Profile → Account → Delete account; web fallback at `/account-deletion`. Cascade FKs ensure orphan-free deletion. See `docs/playdatainstructions.md`. |
| Restriction (Art. 18) | Email request — manual handling |
| Portability (Art. 20) | Email request — manual handling. Same scaling note as Art. 15 |
| Object (Art. 21) | In-app analytics toggles (Sentry + PostHog); email request for other processing |
| Automated decision-making (Art. 22) | Not applicable — no automated decisions with legal effect |
| Complaint to supervisory authority | ANSPDCP at `dataprotection.ro`, listed in privacy policy |

---

## 3. Risk assessment

For each risk we identify the threat, the data subjects affected, the
likelihood (rare / possible / likely), the severity (negligible / limited /
significant / maximum), and the resulting risk level.

### R1 — Re-identification of "anonymous" GPS data

- **Threat:** Even with usernames hidden, regular GPS commute patterns
  (work-hours weekday rides between two points) make inferring home and
  workplace addresses trivial. An attacker with access to leaked breadcrumb
  trails could de-anonymise a user.
- **Affected:** All users who share rides or have unblocked breadcrumb trails.
- **Likelihood:** Possible (depends on a data leak occurring).
- **Severity:** Significant.
- **Risk before mitigation:** **High.**
- **Mitigations:**
  - 200 m privacy-zone trim at start and end of every shared ride (`packages/core/src/sharePrivacy.ts`).
  - 90-day automatic truncation of `trip_tracks.gps_trail`.
  - User opt-in to retain raw breadcrumbs longer (default off).
  - Database access restricted to service-role keys; no public read of
    `trip_tracks`.
  - RLS policies on Supabase enforce row-level access by `user_id`.
- **Residual risk:** **Limited.**

### R2 — Stalking via shared rides or hazard reports

- **Threat:** A bad actor identifies a target rider through their public
  username on a shared ride or hazard, then uses location data attached to
  that content to follow or harass.
- **Affected:** Any user who shares rides or reports hazards.
- **Likelihood:** Possible.
- **Severity:** Significant (physical safety implications).
- **Risk before mitigation:** **High.**
- **Mitigations:**
  - Privacy-zone trim hides home and start/end addresses (R1).
  - Ride sharing is opt-in per ride, never automatic.
  - **Block** mechanism (compliance plan item 7): blocked users' content
    disappears server-side via RLS, and they cannot see the blocking
    user's content either.
  - **Report** mechanism with DSA-Art-16-aligned SLAs (24 h for illegal
    content, 48 h for other policy violations) — `docs/ops/moderation-runbook.md`.
  - Comments require a full Google account (no anonymous-account
    harassment).
- **Residual risk:** **Limited.**

### R3 — UGC harassment / hate speech / threats

- **Threat:** Other users post harassing comments, slurs, threats, or
  doxxing.
- **Affected:** Any user reading or being targeted by abusive UGC.
- **Likelihood:** Likely (any UGC platform attracts some abuse).
- **Severity:** Limited to significant depending on content.
- **Risk before mitigation:** **High.**
- **Mitigations:**
  - Two-layer auto-filter: inline write-time check via `commentSanitize.ts`
    (URL / spam) and `moderationFilter.ts` (RO + EN slur / threat / doxx
    wordlist), plus a 15-minute sweep cron
    (`moderation-auto-filter-sweep-cron`).
  - Block + report flows accessible from every UGC surface.
  - Per-user rate limits: 3 comments / 15 min, 5 reports / 10 min, 20
    blocks / hour.
  - `COMMENTS_ENABLED=false` Cloud Run kill-switch for OOO procedure.
  - DSA Art. 16 compliance documented.
- **Residual risk:** **Limited.**

### R4 — Account takeover

- **Threat:** Attacker gains access to a user's Google OAuth credentials
  and signs in as them, gaining access to trip history and the ability to
  post abusive content under the victim's name.
- **Affected:** Any user.
- **Likelihood:** Possible.
- **Severity:** Significant.
- **Risk before mitigation:** **Medium.**
- **Mitigations:**
  - Auth handled by Supabase + Google OAuth — both have mature 2FA and
    suspicious-login detection.
  - We never store OAuth tokens directly; refresh tokens are managed by
    Supabase Auth.
  - Account deletion is one-tap (limits damage if compromise is
    detected).
  - Audit log of write operations retained for 12 months (server access
    logs).
- **Residual risk:** **Limited.**

### R5 — Plaintext HTTP routing requests (OSRM)

- **Threat:** Route requests to the self-hosted OSRM at `34.116.139.172`
  travel as plaintext HTTP. A network attacker on the path can observe
  origin and destination coordinates of every routing request.
- **Affected:** All users.
- **Likelihood:** Rare (path requires AS-level adversary or compromised
  Wi-Fi).
- **Severity:** Limited (route start / end are also visible to Mapbox via
  TLS, so the OSRM leak adds little marginal information **for users
  whose location is already shared via the community feed**; for users
  who never share, it does add a leak).
- **Risk before mitigation:** **Medium.**
- **Mitigations (current):**
  - Per-domain network security config restricts cleartext to the OSRM
    IP only — all other traffic is TLS-enforced (compliance plan item 6
    short-term, shipped session 31).
  - iOS NSAppTransportSecurity exception is also domain-scoped.
  - Privacy policy explicitly discloses this exception.
- **Mitigation (planned, item 6 long-term):**
  - GCP HTTPS Load Balancer or Caddy with Let's Encrypt in front of
    OSRM. Once shipped, the per-domain cleartext exception is **deleted**
    entirely. Estimated cost: ~$5–20/month. **Tracked in
    `docs/plans/compliance-implementation-plan.md` item 6 long-term.**
- **Residual risk before item 6 long-term:** **Limited.**
- **Residual risk after item 6 long-term:** **Negligible.**

### R6 — Default-ON analytics consent

- **Threat:** First-time users get Sentry + PostHog opt-in checked by
  default. A user who does not read the screen carefully consents
  inadvertently.
- **Affected:** All first-time users.
- **Likelihood:** Likely.
- **Severity:** Limited (no PII collected; `sendDefaultPii: false`; PostHog
  events are anonymous).
- **Risk before mitigation:** **Medium.**
- **Mitigations:**
  - Both toggles are visible on the consent screen with descriptive copy.
  - Privacy & Analytics screen reachable from Profile any time.
  - Toggle off takes effect within the same render cycle (telemetry
    client teardown is observed).
  - Privacy policy discloses the default ON behavior.
- **Open question for counsel:** Is a default-ON consent for product
  analytics (PostHog) defensible under ANSPDCP / Law 506/2004
  interpretation? Sentry's defense (Art. 6(1)(f) legitimate interest with
  no PII) is well-established; PostHog's is thinner. **Counsel review
  flagged in compliance plan item 8.**
- **Residual risk:** Pending counsel review. May escalate to "default OFF
  for PostHog" depending on counsel's read.

### R7 — Supabase data residency in US region

- **Threat:** Primary database resides in Supabase's US region. Personal
  data of EU residents is therefore subject to US legal process and the
  Schrems-II implications of cross-Atlantic transfers.
- **Affected:** All users.
- **Likelihood:** Lawful access requests are rare; data leakage from US
  legal process is a tail risk.
- **Severity:** Limited (no special-category data; minimal payment / health
  / financial data — none in fact).
- **Risk before mitigation:** **Medium.**
- **Mitigations (current):**
  - Privacy policy discloses US region.
  - Supabase contract includes Standard Contractual Clauses for
    EU-to-US transfers.
- **Mitigation (planned):**
  - **Migrate Supabase to EU region.** Tracked as a long-term task in the
    compliance plan; not blocking for closed-test launch but should
    happen before scaling beyond Romania-only.
- **Residual risk:** **Limited until migration; negligible after.**

### R8 — Server access log retention (IP addresses)

- **Threat:** Server access logs retain the requester IP for 12 months.
  An IP can be linked to an individual via the ISP, exposing the
  rider's general identity for the past year.
- **Affected:** All users.
- **Likelihood:** Rare (logs are not exposed publicly).
- **Severity:** Limited.
- **Risk before mitigation:** **Low.**
- **Mitigations:**
  - 12-month rolling deletion automated on Cloud Run logging.
  - Logs accessible only to the data controller.
  - Privacy policy and account-deletion page disclose the retention.
- **Residual risk:** **Negligible.**

### R9 — Push token leakage

- **Threat:** Push tokens stored in `push_tokens` table could be used by
  an attacker to send unauthorised notifications to a user's device.
- **Affected:** Users who have signed in with notifications enabled.
- **Likelihood:** Rare.
- **Severity:** Limited.
- **Risk before mitigation:** **Low.**
- **Mitigations:**
  - Push tokens are server-side only (`SUPABASE_SERVICE_ROLE_KEY` required
    to read).
  - Tokens deleted on account deletion via cascade FK.
  - Tokens regenerate on every sign-in / device change, limiting the
    useful window of a leaked token.
- **Residual risk:** **Negligible.**

### Summary risk matrix (post-mitigation)

| Risk | Likelihood | Severity | Risk level |
|---|---|---|---|
| R1 — Re-identification of GPS data | Possible | Limited | **Limited** |
| R2 — Stalking via UGC | Possible | Limited | **Limited** |
| R3 — UGC harassment | Likely | Limited | **Limited** |
| R4 — Account takeover | Possible | Limited | **Limited** |
| R5 — Plaintext OSRM (until item 6-long ships) | Rare | Limited | **Limited** |
| R6 — Default-ON analytics | Likely | Limited | **Limited (pending counsel)** |
| R7 — Supabase US region | Rare | Limited | **Limited** |
| R8 — Server access logs | Rare | Limited | **Negligible** |
| R9 — Push token leakage | Rare | Limited | **Negligible** |

After mitigations, **no residual risk is rated High.** This is the standard
threshold for proceeding without prior consultation with the supervisory
authority under GDPR Art. 36(1).

---

## 4. Action plan

### 4.1 Pre-launch (before closed-test submission)

- [x] Account deletion (in-app + web) — shipped session 31 + PR #26
- [x] UGC moderation (block + report + auto-filter) — shipped session 31
- [x] Pre-collection consent for analytics — shipped session 31
- [x] GDPR retention pipeline (90-day GPS truncate, 24-month inactive purge) — shipped session 31
- [x] Per-domain network security config (item 6 short-term) — shipped session 31
- [x] Privacy policy + ToS (placeholder) live at `routes.defensivepedal.com` — shipped PR #25
- [x] Account-deletion web fallback live — shipped PR #26
- [x] In-app a11y pass on compliance screens — shipped PR #27
- [x] Romanian listing copy — shipped PR #28
- [x] IARC questionnaire reference + screenshot script — shipped PR #29
- [ ] **Counsel review of this DPIA**
- [ ] **Counsel review of full Privacy Policy + ToS** (compliance plan item 3)
- [ ] **Romanian counsel decision on default-ON PostHog consent** (R6)
- [ ] **DSAR (data-subject access request) export endpoint** — currently
      manual via email; needed before scaling beyond closed test

### 4.2 Post-launch (closed-test → open / production)

- [ ] **TLS in front of OSRM** (compliance plan item 6 long-term) — closes R5
      residual risk fully
- [ ] **Migrate Supabase to EU region** — closes R7 residual risk
- [ ] **ANSPDCP filing** if counsel determines it's required (precautionary
      filing recommended in compliance plan)
- [ ] **Inactive-warning email mailer** — currently logged-only; Resend via
      Supabase Edge Function planned (`docs/ops/retention-runbook.md`)
- [ ] **Cookie banner on `defensivepedal.com`** if any analytics cookies
      are introduced on the marketing web property (Legea 506/2004)

### 4.3 Triggers for re-running this DPIA

- Adding paid features or in-app purchases
- Adding ad SDKs of any kind
- Expanding beyond Romania
- Migrating Supabase region (re-evaluate R7)
- Introducing new processors not listed in §1.4
- Any data-breach event
- 12 months elapsed since last review

---

## 5. Consultation

### 5.1 Data Protection Officer

The data controller is **Victor Rotariu**, operating Defensive Pedal as a
sole proprietorship at the present scale. **No formal DPO** has been
appointed — Romanian / EU thresholds for mandatory DPO appointment (Art.
37) are not met (this is not a public authority, processing scale does not
trigger the threshold, no special-category data at scale, no systematic
monitoring of public spaces). DPO appointment will be re-evaluated when:
- Active user count exceeds ~10,000 monthly users, or
- Any of the §4.3 triggers fire.

### 5.2 Data subject consultation

Consultation with data subjects (Art. 35(9)) is conducted via the closed-
test programme on Google Play. Beta testers can provide feedback through:
- The in-app feedback flow (post-ride)
- Direct email to `privacy@defensivepedal.com`

Material concerns raised by beta testers about data handling will be
recorded here in subsequent revisions.

### 5.3 Counsel review

| Step | Status |
|---|---|
| Romanian counsel retained | **TODO** |
| Full Privacy Policy reviewed | **TODO** (compliance plan item 3) |
| ToS reviewed (incl. OUG 34/2014 immediate-performance clause) | **TODO** |
| This DPIA reviewed | **TODO** |
| ANSPDCP precautionary filing decision | **TODO** |

### 5.4 Supervisory authority consultation

Per Art. 36(1), prior consultation with ANSPDCP is required only if the
DPIA identifies residual high risks that the controller cannot mitigate.
**The summary risk matrix in §3 shows no residual high risks**, so prior
consultation is not required. Counsel may still recommend a precautionary
filing — see §4.1.

---

## 6. Sign-off (for the final filed version)

> _This block remains blank in the draft. Counsel and the data controller
> sign here when the final version is ready to file._

- **Data controller:** Victor Rotariu (`victorrotariu@gmail.com`)
  - Signature: ____________________________
  - Date: ______________
- **Counsel review:** _________________________
  - Signature: ____________________________
  - Date: ______________

---

## Appendix A — Source-of-truth pointers

- Compliance plan + per-item status: `docs/plans/compliance-implementation-plan.md`
- Moderation operations: `docs/ops/moderation-runbook.md`
- Retention operations: `docs/ops/retention-runbook.md`
- Sentry setup: `docs/ops/sentry-setup.md`
- Data Safety form (Play Console): `docs/playdatainstructions.md`
- Privacy policy (placeholder): `apps/web/app/privacy/page.tsx` →
  `routes.defensivepedal.com/privacy`
- Account deletion (web): `apps/web/app/account-deletion/page.tsx` →
  `routes.defensivepedal.com/account-deletion`
- Privacy zone trim: `packages/core/src/sharePrivacy.ts`
- Cascade FKs migration: `supabase/migrations/202604200001_cascade_user_fks.sql`
- Retention RPCs migration: `supabase/migrations/202604280001_retention_policies.sql`
- UGC moderation migration: `supabase/migrations/202604270001_ugc_moderation.sql`

## Appendix B — Glossary

- **ANSPDCP** — Autoritatea Națională de Supraveghere a Prelucrării Datelor
  cu Caracter Personal (Romanian data protection supervisory authority).
- **DPIA** — Data Protection Impact Assessment under GDPR Art. 35.
- **DSA** — EU Digital Services Act (Regulation (EU) 2022/2065). Article 16
  governs UGC notice-and-action mechanisms.
- **EDPB** — European Data Protection Board.
- **OUG 34/2014** — Romanian Government Emergency Ordinance transposing the
  Consumer Rights Directive (2011/83/EU).
- **RLS** — Postgres Row-Level Security; the Supabase mechanism that
  enforces per-row access control based on the authenticated user.
- **SCC** — Standard Contractual Clauses; EU-approved contracts for
  international data transfers post-Schrems II.
- **WP29** — Article 29 Working Party (the EDPB's predecessor body).
