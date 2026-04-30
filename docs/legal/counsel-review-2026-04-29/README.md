# Defensive Pedal — Counsel Review Package

**Date assembled:** 2026-04-29
**Assembled by:** Engineering (for handover to Romanian privacy counsel)
**Subject app:** Defensive Pedal — cycling navigation app
**Launch posture:** Romania-first Android soft launch via Google Play closed test track, then production
**Data controller:** Victor Rotariu (sole proprietor, Brașov, Romania) — pre-incorporation
**Supervisory authority:** ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal)

---

## Purpose of this package

The app's product code, moderation pipeline, retention pipeline, and consent UI are
all shipped and code-complete. Three categories of legal artefact remain blocked on
counsel review before public production launch:

1. **The Privacy Policy and Terms of Service web pages are placeholders.** They
   carry the operative substantive text the engineering team believes is correct
   under GDPR + Romanian law (Law 506/2004, OUG 34/2014), but neither has been
   reviewed by Romanian-qualified counsel.

2. **The Data Protection Impact Assessment (DPIA) is in DRAFT status** — the
   engineering team has filled in all 9 risk rows + mitigations + EDPB criteria
   analysis, but the sign-off block at the end is empty pending counsel review,
   and one specific risk (R6, default-on analytics consent) is explicitly flagged
   as needing a counsel call.

3. **The pre-collection consent screen** ships with both crash reporting (Sentry)
   and product analytics (PostHog) toggles defaulted to ON for first-time users.
   This is a deliberate deviation from the original opt-in plan and is the most
   regulator-exposed decision in the package. Counsel sign-off (or rejection +
   remediation) is required before public launch.

**What we need from counsel:**

| # | Question | Document(s) to read |
|---|---|---|
| 1 | Are the Terms of Service substantive enough to support the OUG 34/2014 immediate-performance + 14-day-waiver clauses for any future paid features? | `03-terms-page.tsx` |
| 2 | Does the Privacy Policy meet GDPR Art. 13 informed-consent requirements + ANSPDCP transparency obligations? Are the retention periods defensible? Are the legal bases per processing activity correct? | `04-privacy-page.tsx` + `02-compliance-plan.md` (Item 13 retention + Item 8 consent) |
| 3 | Is the default-ON posture for crash reports (Sentry, claimed legitimate-interest under GDPR Art. 6(1)(f)) defensible? | `02-compliance-plan.md` Item 8 lines 350–369; `06-consent-screen.tsx` lines 27-34 (header doc) and lines 60-65 (the actual defaults) |
| 4 | Is the default-ON posture for product analytics (PostHog) defensible under ANSPDCP enforcement posture + Law 506/2004 + EDPB guidance? OR must we flip to default-OFF before launch? | Same as #3 + `04-privacy-page.tsx` |
| 5 | Does the DPIA cover everything ANSPDCP would expect? Are there risks we missed? Does the residual-risk classification justify NOT triggering Art. 36(1) prior consultation? | `01-dpia.md` |
| 6 | Is the in-app + web account deletion flow sufficient under GDPR Art. 17? | `05-account-deletion-page.tsx` + `02-compliance-plan.md` Item 1 |
| 7 | Are the moderation SLAs and DSA Art. 16 procedure documented well enough to defend in a regulatory review? | `02-compliance-plan.md` Item 7 |

**What we need NOT from counsel:** infrastructure setup, signing keys, code review, UI/UX, OSRM TLS, or anything outside the legal/privacy posture. Those are tracked separately in engineering.

---

## Quick context — what the app collects + how

| Data category | Source | Storage | Retention | Legal basis (claimed) |
|---|---|---|---|---|
| Account email + display name | User signup (Google OAuth or email/pw) | Supabase Auth (EU region) | Until account deletion | Contract (GDPR 6(1)(b)) |
| GPS location (live during ride) | Phone GPS, every ~3s | In-memory only during ride; not transmitted | Discarded on ride end | Legitimate interest (6(1)(f)) — required for navigation |
| GPS trail (post-ride) | Aggregated breadcrumbs | Supabase `trip_tracks` (EU region, full polyline) | User-controlled toggle: keep full trail OR truncate to first/last 200 m after 14d | Contract (6(1)(b)) — required for the History feature |
| Trip metadata | App | `trips`, `trip_shares` | Indefinite (user-deletable) | Contract |
| Hazard reports | User input | `hazards` | 4h–14d TTL by hazard type, hard-deleted at 45d post-expiry | Legitimate interest (6(1)(f)) — community safety |
| Comments / likes / loves | User input | `feed_comments`, `feed_likes`, `trip_loves`, `activity_feed` | User-deletable; auto-hidden when reported | Contract |
| Crash reports | Sentry SDK | sentry.io EU region (de.sentry.io) | 90 days (Sentry default) | Legitimate interest (6(1)(f)) |
| Product analytics | PostHog SDK | eu.i.posthog.com | 7 years (PostHog default) | **Disputed legal basis** — currently default-ON, treated as legitimate interest. Counsel review needed. |
| Push tokens | Expo SDK → FCM | Supabase `push_tokens` | Until token rotation or unsubscribe | Legitimate interest |
| Server access logs | Cloud Run | GCP logs, EU region | 12 months (disclosed) | Legitimate interest (security + abuse) |

**Not collected:** financial info, advertising ID (`AD_ID` permission stripped), health data, biometrics, contacts, calendar, photos beyond avatar upload, microphone, camera (except the avatar picker).

**Third parties receiving data:** Supabase (data processor, EU region), Sentry (data processor, EU region), PostHog (data processor, EU region), Mapbox (rendering only, no PII), Open-Meteo (lat/lon only, no PII), Resend (data processor, transactional emails). All are listed in the Privacy Policy (`04-privacy-page.tsx`).

---

## Reading order

For a 90-minute review, read in this order:

1. **`02-compliance-plan.md`** — Items 8 (consent), 13 (retention), 14 (signup waiver), 7 (moderation), 1 (account deletion). This gives you the engineering perspective on what's been done and where the gaps are. Skim Items 4, 5, 6, 10, 11 (operational only).

2. **`01-dpia.md`** — full document. Pay particular attention to:
   - The three EDPB DPIA-required criteria triggered (tracking + monitoring, innovative tech, data shared between data subjects)
   - R6 (default-on analytics) — explicitly counsel-gated
   - The Art. 36(1) prior-consultation determination (we conclude no, asking you to confirm)
   - The empty sign-off block at the end

3. **`04-privacy-page.tsx`** — read as rendered text (it's a Next.js JSX file but the prose is straight text inside `<p>` and `<h2>` tags — readable inline).

4. **`03-terms-page.tsx`** — same format.

5. **`05-account-deletion-page.tsx`** — short, mostly procedural. Confirms the in-app + web fallback path Play Store requires.

6. **`06-consent-screen.tsx`** + **`07-privacy-analytics-screen.tsx`** — the actual UI source. The relevant code is:
   - `06-consent-screen.tsx` lines 27-34 — header doc explaining the posture
   - `06-consent-screen.tsx` lines 60-65 — the `useState` initializers that actually default to ON for first-time users
   - `06-consent-screen.tsx` lines 67-73 — the persist-on-Continue handler
   - `07-privacy-analytics-screen.tsx` — post-onboarding revoke screen

---

## Files in this package

| File | Source path in repo | Purpose |
|---|---|---|
| `01-dpia.md` | `docs/legal/dpia.md` | Data Protection Impact Assessment (DRAFT) |
| `02-compliance-plan.md` | `docs/plans/compliance-implementation-plan.md` | Engineering's compliance audit + per-item status. 14 items, all but counsel-gated ones shipped. |
| `03-terms-page.tsx` | `apps/web/app/terms/page.tsx` | Public Terms of Service web page (placeholder pending review). Lives at `routes.defensivepedal.com/terms` post-deploy. |
| `04-privacy-page.tsx` | `apps/web/app/privacy/page.tsx` | Public Privacy Policy web page (placeholder pending review). Lives at `routes.defensivepedal.com/privacy` post-deploy. |
| `05-account-deletion-page.tsx` | `apps/web/app/account-deletion/page.tsx` | Public account-deletion fallback page. Required by Google Play; lives at `routes.defensivepedal.com/account-deletion`. |
| `06-consent-screen.tsx` | `apps/mobile/app/onboarding/consent.tsx` | The pre-collection consent UI shown during first-run onboarding. **This is where the default-ON behaviour is implemented.** |
| `07-privacy-analytics-screen.tsx` | `apps/mobile/app/privacy-analytics.tsx` | Post-onboarding revoke screen, reachable from Profile → Privacy & analytics. |

---

## Snapshot dates

These files are point-in-time copies as of **2026-04-29**. The canonical sources may have evolved by the time counsel reviews — if there's any ambiguity, the engineering team will produce a fresh snapshot. Reference commits as of this snapshot:

- `e5e79b5` — branded notification icon + v0.2.24 bump
- `3bada2c` — `is_hidden` filter migration in 4 community-feed RPCs
- `74e838f` — Phase 1 Play Store gates (SYSTEM_ALERT_WINDOW strip, is_hidden filter, consent doc)
- `1bbf67c` — original 8-item compliance ship (sessions 31, items 1, 4, 5, 6, 7, 8, 10, 11, 13)

---

## Contact

For questions about anything in this package, contact Victor at the email on
record. For technical questions about the underlying code, the engineering team
can produce additional source-tree snapshots on request — please describe what
you need and we'll either send the additional file(s) or extract the relevant
section in plain prose.
