# Play Console — Data Safety form (paste-ready)

Reference doc for compliance plan **Item 9 — Data Safety form**. Use this when filling out
**Play Console → App content → Data safety** for `com.defensivepedal.mobile`.

- **Last verified:** 2026-04-27, against the production app behavior on Cloud Run revision
  `defpedal-api-00068-blq` and migrations through `202604280001_retention_policies.sql`.
- **App version this covers:** v0.2.x.

When the next compliance items ship (3, 6-long, 14 long-form), revisit the asterisked rows.

---

## 1. Privacy practices section (yes/no questions)

| Question | Answer |
|---|---|
| Is all user data encrypted in transit? | **Yes** (with caveat — see note below) |
| Do you provide a way for users to request that their data be deleted? | **Yes** |
| Method of deletion request | **In-app and web** |
| Does your app comply with Play Families Policy? | **No** (not child-directed; minimum age 16) |
| Has the app had an independent security review? | Leave blank |
| Privacy policy URL | `https://routes.defensivepedal.com/privacy` |
| Account-deletion URL (when "web" is selected) | `https://routes.defensivepedal.com/account-deletion` |

### Encryption-in-transit caveat

Until compliance plan **item 6-long** ships (TLS in front of OSRM), routing requests to
`34.116.139.172:5000` and `:5001` are plaintext HTTP. All other endpoints (Cloud Run API,
Supabase, Mapbox, Open-Meteo, Sentry, PostHog, Expo Push) are HTTPS.

Two postures are defensible:

1. **Answer "Yes" + disclose OSRM exception in the privacy policy.** Common practice when
   one of N endpoints is a known exception during a launch window.
2. **Ship item 6-long first**, then answer "Yes" clean.

For the soft-launch path we are taking option 1. The privacy policy at
`routes.defensivepedal.com/privacy` lists all sub-processors and will be updated to call
out the OSRM endpoint explicitly when item 3 (full Privacy Policy) lands.

---

## 2. Data types collected (the main grid)

For each row: in Play Console click **Manage** on the category, toggle the type, and
answer "collected", "shared with third parties", "required vs. optional", and "purposes".

| Category | Type | Collected | Shared with 3rd parties | Required or Optional | Purposes |
|---|---|---|---|---|---|
| **Location** | Approximate location | Yes | Yes — Supabase, Mapbox, Open-Meteo | Required | App functionality (routing, weather, hazards) |
| **Location** | Precise location | Yes | Yes — Supabase, Mapbox | Required | App functionality; Analytics (opt-in only) |
| **Personal info** | Email address | Yes | Yes — Supabase | Required | Account management |
| **Personal info** | Name | Yes | Yes — Supabase | Optional | Account management |
| **Personal info** | User IDs | Yes | Yes — Supabase, Sentry, PostHog | Required | Account management; Analytics |
| **Photos and videos** | Photos | Yes | Yes — Supabase Storage | Optional | App functionality (avatar, share cards) |
| **App activity** | App interactions | Yes | Yes — PostHog | Optional (user consent required) | Analytics |
| **App activity** | Other user-generated content | Yes | Yes — Supabase | Required | App functionality (hazards, feed posts, comments) |
| **App info and performance** | Crash logs | Yes | Yes — Sentry | Optional (user consent required) | App functionality; Diagnostics |
| **App info and performance** | Diagnostics | Yes | Yes — Sentry | Optional (user consent required) | Diagnostics |
| **Device or other IDs** | Device or other IDs | Yes | Yes — Expo (push), our API | Required | App functionality (push notifications) |

---

## 3. Data types you must explicitly leave OFF

These come up in the form. Leave each as **Not collected** to avoid declaring something
the app does not actually do. If we ever start collecting any of these, this list must
move into the grid above first.

- Financial info / Payment info (no in-app purchases, no payments)
- Health and fitness — CO₂ savings and microlives are *derived* metrics, not collected
  health data; we never read heart rate, weight, sleep, etc.
- Messages (no DMs, no in-app messaging)
- Contacts
- Calendar
- Audio files
- Files and docs
- Web browsing
- **Advertising ID** — `com.google.android.gms.permission.AD_ID` was stripped from the
  manifest in session 30 (preview v0.2.21). Declare **No collection of advertising ID**.

---

## 4. Retention strings (when Play asks "how long is each type kept?")

Use these strings verbatim. Sources: `supabase/migrations/202604280001_retention_policies.sql`
and `docs/ops/retention-runbook.md`.

| Data | Retention answer |
|---|---|
| Account data (profile, email, display name) | While the account is active |
| Trip summaries (distance, duration, CO₂, route mode) | While the account is active |
| Raw GPS breadcrumbs (`trip_tracks.gps_trail`) | **Truncated automatically after 90 days** (user can opt to keep longer in Profile → Account) |
| Hazard reports | **45 days past their expiry**, then deleted |
| Inactive accounts | **Deleted after 24 months without sign-in**; warning email at 23 months |
| Crash reports / diagnostics (Sentry) | 90 days (Sentry default; free tier) |
| Product analytics events (PostHog) | Per PostHog default retention |
| Push notification tokens | While account active and the device retains the token |

---

## 5. App access section

Play asks whether all app functionality is available without an account.

- **Anonymous access:** Yes — anonymous Supabase sessions allow browsing, navigation, and
  hazard reading. Some write actions (commenting, hazard voting) require a full account
  (Google OAuth or email signup). Declare honestly: **"Some features require a Google
  account or email registration."**

---

## 6. Pre-submission verification

Before submitting, verify each declaration against shipped code:

- [ ] Privacy policy URL resolves with HTTP 200: `curl -I https://routes.defensivepedal.com/privacy`
- [ ] Account-deletion URL resolves with HTTP 200: `curl -I https://routes.defensivepedal.com/account-deletion`
- [ ] Newest production AAB does not contain `com.google.android.gms.permission.AD_ID` —
  re-run `apps/mobile/scripts/audit-release-artifacts.sh` against the build output.
- [ ] Privacy & analytics screen in app shows Sentry + PostHog as toggleable (matches
  the "Optional (user consent required)" rows above).

When item 6-long (TLS) and item 3 (full privacy policy + cookies) land, revisit:

- Encryption-in-transit answer becomes a clean "Yes".
- Add cookies row to the form if `apps/web` introduces analytics cookies (Legea 506/2004).

---

## 7. After submission

If Google's automated post-submission check flags a mismatch, the listing can be removed
without warning. The most common false-declaration triggers for an app like ours:

- Declaring "no precise location" while requesting `ACCESS_FINE_LOCATION` — we declare
  precise location *Yes* above.
- Forgetting an SDK that collects analytics — we list Sentry and PostHog explicitly.
- Account-deletion URL not publicly accessible — the Vercel deploy at
  `routes.defensivepedal.com/account-deletion` is `index: true, follow: true`.
