# Play Store minimum — what's actually required to pass review

> **Scope.** This document is the inverse of the counsel opinion. It is the
> **least amount of work** to get past Google Play closed-test review and
> production review. It deliberately does NOT cover GDPR best-practices,
> ANSPDCP defensibility, DSA Art. 16/17/20, or anything else outside the
> Google Play Developer Program Policies.
>
> Read the one-paragraph note at the bottom (§ 7) before deciding to ship
> this version. If 3–12 closed-test users is the only audience for the
> next 14 days, this is fine. For public-launch Romania, the gap between
> "Play-passes" and "GDPR-passes" is real but not actively enforced by
> Google.

---

## 1. TL;DR — what Play Store actually checks

Play reviewers verify, in this order:

1. **A Privacy Policy URL exists**, is publicly accessible (no login wall),
   and is linked from both the Play Console listing and from inside the app.
2. **The Privacy Policy names the entity** (developer or company) responsible
   for the app.
3. **The Privacy Policy lists categories of personal/sensitive data** the
   app collects, how they are used, with whom shared, security and retention
   practices.
4. **The Data Safety form in Play Console matches** what the app actually
   does and what the Privacy Policy says.
5. **An in-app account-deletion path exists** AND a public web URL describes
   how to request deletion (mandatory since 2023 for any app that lets users
   create an account).
6. **`AD_ID` permission is either declared (with ad use) or removed.**
7. **Sensitive permissions are justified** (foreground location, background
   location).
8. **The Terms of Service link** is requested but not actively enforced
   (only required if you mention or imply paid features in the listing).

That's the operational checklist. Everything else in the counsel opinion
(DPIA, LIA, TIA, ePrivacy/Law 506/2004 default-OFF for PostHog, Schrems-II
disclosure, Romanian language, DSA Art. 16/17, etc.) is **not required for
Play to approve the app**.

---

## 2. What you already have that satisfies Play (no changes needed)

| Play requirement | Status | Source |
|---|---|---|
| In-app account deletion | ✓ shipped | `06-consent-screen.tsx` exists; Profile → Account → Delete account flow is in place per `02-compliance-plan.md` Item 1 |
| Web account-deletion fallback page (public URL, no login) | ✓ shipped | `05-account-deletion-page.tsx` → `routes.defensivepedal.com/account-deletion` |
| `AD_ID` permission stripped | ✓ shipped | session 31 / Item 4 of compliance plan |
| Foreground location justification | ✓ ready | navigation use case is the textbook accepted purpose |
| Background location | ✓ N/A | not requested per the package |
| Privacy Policy hosted at a public URL | ✓ ready | `routes.defensivepedal.com/privacy` will be live post-deploy |
| Privacy Policy linked from Play Console listing | ⚠ to be set | Play Console → Store listing → Privacy policy URL field |
| Privacy Policy linked from inside the app | ⚠ verify | Onboarding consent screen and Profile screen should both have a link to `/privacy` |
| Terms of Service | ✓ placeholder is sufficient for Play | `03-terms-page.tsx` — Play does not require a ToS for free apps without payments |
| Data Safety form in Play Console | ⚠ to be filled | Use the table in § 5 below |
| Target audience set in Play Console | ⚠ to be set | "Adults only" or "16+ (no children)" — the app is not directed at children |

The four ⚠ items are all 5–10 minute Play Console operations, not engineering.

---

## 3. The two small Privacy Policy edits required to pass Play

The current `04-privacy-page.tsx` will be flagged by Play reviewers for two
reasons. Both are easy fixes.

### Edit 1 — Strike the "Placeholder" warning notice

Play reviewers see a banner reading "Placeholder — A comprehensive
GDPR-compliant Privacy Policy is being prepared with legal counsel" and
will record it as a deficiency: the policy presents itself as not-yet-final.
Even though Play does not technically reject for this, it raises the
probability of a manual review escalation.

**Change** in `apps/web/app/privacy/page.tsx`:

Find the entire `<div style={styles.notice} role="note">` block (lines
116–122 in the snapshot):

```tsx
        <div style={styles.notice} role="note">
          <span style={styles.noticeLabel}>Placeholder</span>
          A comprehensive GDPR-compliant Privacy Policy is being prepared with
          legal counsel. The summary below describes the data practices that
          apply today; the full document will replace this page before
          additional categories of data are collected.
        </div>
```

**Delete it entirely.** No replacement.

### Edit 2 — Name the data controller

Play requires the Privacy Policy to name the entity responsible. "Defensive
Pedal" alone is the product name; the policy must name the natural or legal
person operating it.

**Change** in `apps/web/app/privacy/page.tsx`:

After the `<h1 style={styles.h1}>Privacy Policy</h1>` and `<p
style={styles.meta}>Last updated: 27 April 2026</p>` lines, **insert** a new
section before "What we collect":

```tsx
        <h2 style={styles.h2}>Who we are</h2>
        <p style={styles.body}>
          Defensive Pedal is operated by{' '}
          <span style={styles.bodyStrong}>Victor Rotariu</span>, sole
          proprietor, based in Brașov, Romania. Privacy and data-subject
          requests:{' '}
          <a href="mailto:privacy@defensivepedal.com" style={styles.link}>
            privacy@defensivepedal.com
          </a>
          .
        </p>
```

That's the entire change set for the Privacy Policy. Two diffs.

---

## 4. Drop-in minimum Privacy Policy (if you prefer to replace the whole page)

If editing the existing file is more friction than rewriting it, here is the
**absolute-minimum** Privacy Policy text that satisfies Play's requirements,
ready to drop into `apps/web/app/privacy/page.tsx`. It is shorter than the
counsel-opinion rewrite (Annex A in `11-privacy-policy-rewrite.md`) and
omits anything Play does not actively check.

```markdown
# Privacy Policy — Defensive Pedal

Last updated: [DD] [Month] 2026

## Who we are

Defensive Pedal is operated by Victor Rotariu, sole proprietor, based in
Brașov, Romania. For privacy and data-subject requests, contact
privacy@defensivepedal.com.

## What we collect

- Account data: email address, display name, optional profile photo.
- Ride data: planned routes, GPS breadcrumb trail, distance, duration,
  elevation, derived metrics like CO₂ savings.
- Community content you create: hazard reports, ride shares, comments,
  reactions, votes.
- Device and crash data: app version, device model, OS version, anonymised
  stack traces. Collected by default; you can switch this off in
  Profile → Privacy & Analytics.
- Product analytics: anonymous event names and screen names, when enabled.
  You can manage this in Profile → Privacy & Analytics.
- Server access logs: IP address and request timestamp, retained for up to
  12 months for security purposes.

## How we use your data

We use your data to provide cycling navigation, store your trip history,
warn riders about hazards, fix software defects, send notifications you
have asked for, and keep the service secure. We do not sell your data and
we do not use it for advertising.

## Who we share data with

We use the following service providers, each under a written processing
agreement: Supabase (database and authentication), Google Cloud Run (API
hosting), Mapbox (map tiles and routing fallback), Open-Meteo (weather),
Sentry (crash diagnostics, only when enabled), PostHog (product analytics,
only when enabled), Expo Push Service (push notifications), Resend
(transactional email).

## How long we keep it

- Account data: while your account is active.
- Raw GPS breadcrumb trails: 90 days, then automatically truncated.
- Hazard reports: 4 hours to 14 days TTL by hazard type, then 45 days
  more, then deleted.
- Inactive accounts: deleted after 24 months without sign-in. We send a
  warning email at 23 months.
- Server access logs: 12 months.

## Account deletion

You can delete your account at any time from Profile → Account → Delete
account inside the app, or from our public account-deletion page at
[/account-deletion](/account-deletion). Deletion is immediate from the live
database; backups taken before deletion may retain a copy for up to 7 days
before being overwritten by the normal backup-rotation cycle.

## Your rights

You have the right to access your data, correct it, request deletion,
export it, or object to specific processing. Contact
privacy@defensivepedal.com for any of these requests. We respond within 30
days.

For Romanian users, the supervisory authority is ANSPDCP at
https://www.dataprotection.ro.

## Children

The app is for users aged 16 and over. We do not knowingly collect data
from children under 16.

## Security

Personal data is encrypted in transit (TLS 1.2+) and at rest. Access is
limited to authenticated requests scoped by per-user database row-level
security.

## Changes

We will notify you in-app and by email before any change that materially
reduces your rights.

## Contact

privacy@defensivepedal.com
```

That's roughly 350 words. Play reviewers spend ~30 seconds on a Privacy
Policy; this length is appropriate.

> Convert this to JSX (preserving the existing `<p>`, `<h2>`, `<ul>`, `<li>`,
> `styles` references) and drop into `apps/web/app/privacy/page.tsx` if you
> want a clean rewrite over the placeholder.

---

## 5. Data Safety form values for Play Console

Match these to the Privacy Policy you publish. Play cross-checks the form
against the policy text; mismatches cause rejections.

| Data type | Collected? | Shared? | Required/Optional | Purpose | Encrypted in transit? | Can users delete? |
|---|---|---|---|---|---|---|
| Email address | Yes | No | Required | Account management | Yes | Yes |
| Name (display name) | Yes | No | Required | Account management, community feed display | Yes | Yes |
| Profile photo | Yes | No | Optional | Personalisation | Yes | Yes |
| User IDs (UUID) | Yes | No | Required | Account management | Yes | Yes |
| Precise location (GPS) | Yes | Yes (Mapbox for routing) | Required | App functionality (navigation), Analytics | Yes | Yes |
| Approximate location | Yes | Yes (Open-Meteo for weather) | Required | App functionality | Yes | Yes |
| Photos | Yes | No | Optional | Profile photo and hazard photos | Yes | Yes |
| App interactions | Yes (when enabled) | No | Optional | Analytics — disclose PostHog if enabled | Yes | Yes |
| Crash logs | Yes (default ON) | No | Required | App functionality (diagnostics) | Yes | Yes |
| Diagnostics | Yes (default ON) | No | Required | App functionality (diagnostics) | Yes | Yes |
| Device IDs | No (advertising ID stripped) | — | — | — | — | — |
| Other user-generated content | Yes | No (visible only to other riders by user choice) | Optional | App functionality (hazards, comments, ride shares) | Yes | Yes |

**Data security section:**
- ✓ Data is encrypted in transit
- ✓ You can request that data be deleted

**Privacy practices section:**
- Independent security review: not yet conducted (you can leave unchecked)
- Committed to Play Families Policy: Not applicable (target audience is 16+)

---

## 6. What this version does NOT change in the existing package

| Artefact | Status under Play minimum |
|---|---|
| `01-dpia.md` | **Not required by Play.** Keep as internal-only documentation; Play does not request a DPIA. (GDPR Art. 35 still requires one to exist; for ANSPDCP exposure assessment you'd want it. For Play passing, ignore.) |
| `02-compliance-plan.md` | Internal engineering doc, not Play-relevant |
| `03-terms-page.tsx` | **Placeholder is fine for Play.** Play does not require a ToS for free apps. The OUG 34/2014 paragraph creates no Play exposure |
| `06-consent-screen.tsx` (default-on PostHog) | **Default-ON is FINE for Play review.** Play does not enforce GDPR/ePrivacy consent posture. The compliance disclosure of analytics in the Privacy Policy and Data Safety form is what Play looks at |
| `07-privacy-analytics-screen.tsx` | No change |
| LIA for Sentry | Not required by Play |
| TIA for Supabase US | Not required by Play |
| DPA register | Not required by Play |
| Romanian-language Privacy Policy | Not required by Play (English is acceptable). The Play Console listing language matters for the listing copy, not for the Privacy Policy URL content |
| Breach response runbook | Not required by Play |
| DSA Art. 11/12/16/17/20 documentation | Not required by Play |
| Age-gate at signup | Not required by Play if target audience is 16+ and you set it correctly in Play Console |

---

## 7. Honest note on what you're trading away (1 paragraph, no lecture)

This minimum gets you past Play review. It does **not** make you defensible
if a user files a complaint with ANSPDCP, or if a regulator opens a
sectoral inquiry into mobile-app analytics consent in Romania. The biggest
single residual risk is the default-ON PostHog posture combined with the
Privacy Policy not stating the legal basis explicitly: this is the textbook
ANSPDCP fining pattern. For 3–12 closed-test users, the practical
ANSPDCP-complaint risk is essentially zero. For public-launch Romania, the
practical risk rises with user count and the volume of complaints; one
disgruntled user filing a ticket on `dataprotection.ro` is enough to start a
review, and the default-ON PostHog finding is the easiest possible
conclusion for a reviewer to draw. The remediation when that happens is the
same one-line code change recommended in the counsel opinion. So: shipping
the Play minimum now is fine; budgeting one engineering day to land the full
counsel-opinion remediation before public launch (or the moment user count
crosses ~100) keeps the regulatory risk negligible without much more effort
than this minimum.

---

## 8. Pre-submission checklist

- [ ] Edit 1 applied (delete Placeholder banner from `04-privacy-page.tsx`)
- [ ] Edit 2 applied (add "Who we are" section naming Victor Rotariu)
- [ ] Privacy Policy deployed and reachable at
      `https://routes.defensivepedal.com/privacy`
- [ ] Privacy Policy URL set in Play Console → Store listing
- [ ] Privacy Policy linked from inside the app (onboarding + Profile)
- [ ] Account-deletion page deployed at
      `https://routes.defensivepedal.com/account-deletion`
- [ ] In-app account deletion path verified working
- [ ] Data Safety form in Play Console filled per § 5 above
- [ ] Target audience in Play Console set (not children; 16+ or general)
- [ ] `AD_ID` confirmed absent from final manifest
- [ ] Permissions justification text drafted for foreground location
- [ ] IARC content-rating questionnaire submitted

That's it. Ship.
