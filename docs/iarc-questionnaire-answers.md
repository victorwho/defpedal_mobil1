# IARC Content Rating — answer sheet

Reference for compliance plan **item 12** when filling out the Play Console
content-rating questionnaire (Google Play → App content → Content rating).

The IARC questionnaire is a series of yes/no questions covering violence,
sexuality, profanity, gambling, user-generated content, location, and ads.
Answers below are derived from what the app *actually does today* — verified
against the shipped code and the Data Safety form (`docs/playdatainstructions.md`).

**Predicted final rating:** **PEGI 12 / ESRB Everyone 10+ / IARC: 7+** (driven
primarily by user-generated content + location sharing with other users; not
by any restricted-substance / violence / sexual content).

When you fill out the actual form, double-check each answer against the
source-of-truth columns. The questionnaire wording sometimes shifts; the
underlying truth about the app does not.

---

## Category 1 — Violence

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain violence? | **No** | No violent content; cycling navigation. |
| Does the app contain blood / gore? | **No** | — |
| Does the app contain depictions of cruelty? | **No** | — |
| Does the app glorify violence? | **No** | — |

## Category 2 — Sexual content

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain sexual content? | **No** | — |
| Does the app contain nudity? | **No** | — |
| Does the app contain depictions of romantic relationships? | **No** | — |

## Category 3 — Language

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain profanity in pre-written content? | **No** | All in-app copy reviewed; no profanity. |
| Can users post text that may contain profanity? | **Yes** | UGC channels: hazard report descriptions, feed comments. |
| Is profanity filtered? | **Yes** | `moderationFilter.ts` slur/threat/doxx wordlist runs at write-time + 15-min sweep cron (`moderation-auto-filter-sweep-cron`). See `docs/ops/moderation-runbook.md`. |

## Category 4 — Controlled substances

| Question | Answer | Source of truth |
|---|---|---|
| Does the app reference alcohol, tobacco, or drugs? | **No** | — |
| Does the app encourage their use? | **No** | — |

## Category 5 — Gambling

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain real-money gambling? | **No** | No paid features at all. |
| Does the app simulate gambling? | **No** | Badges + XP + tier progression are achievement systems, not gambling. No randomised reward boxes, no chance-based purchases. |

## Category 6 — User-generated content (UGC)

This is where most of our affirmative answers land.

| Question | Answer | Source of truth |
|---|---|---|
| Can users create / submit content visible to other users? | **Yes** | Hazard reports, ride shares to community feed, comments, reactions. |
| Are users moderated? | **Yes** | Reports + blocks in-app (compliance plan item 7). DSA Art. 16-compliant SLAs in `docs/ops/moderation-runbook.md`. |
| Is content pre-screened by moderators before publication? | **No** | Post-hoc moderation. Auto-filter runs inline at write time (slur/threat/doxx wordlist) plus a 15-min sweep cron. Human review SLA: 24h for illegal content, 48h for other violations. |
| Can users contact each other privately? | **No** | No DMs / private messages. All UGC is public. |
| Can users report inappropriate content? | **Yes** | Long-press on feed cards opens `ReportSheet` molecule with seven reason categories. `POST /v1/reports` endpoint. |
| Can users block other users? | **Yes** | Long-press on feed cards → "Block user". `POST /v1/users/:id/block`. Blocked users' content is filtered server-side via RLS. List + unblock at Profile → Account → Blocked users. |

## Category 7 — Personal information

| Question | Answer | Source of truth |
|---|---|---|
| Does the app share personal information with other users? | **Yes — limited** | Username and display name on hazard reports, comments, and shared trips. No email, phone, or contact info shown. Avatar photo if set. See `apps/mobile/app/community-feed.tsx`. |
| Does the app share personal information with third parties? | **Yes — disclosed** | Supabase (DB + auth), Mapbox (maps), Sentry (crash reports — opt-in), PostHog (analytics — opt-in). Full list in privacy policy at `routes.defensivepedal.com/privacy`. |
| Can users edit / remove their personal info? | **Yes** | Profile editing in app. Full account deletion at Profile → Account → Delete account, or via web at `routes.defensivepedal.com/account-deletion`. |

## Category 8 — Location

| Question | Answer | Source of truth |
|---|---|---|
| Does the app share user location with other users? | **Yes — with privacy zone trim** | Shared rides and hazards include coordinates. Default privacy: route start and end are trimmed by 200 m (the privacy zone) before sharing — see `packages/core/src/sharePrivacy.ts` (`trimPrivacyZone`). |
| Does the app share user location in real time with other users? | **No** | The app does live-track the rider's GPS during navigation, but that location is **not broadcast** to other users in real time. Shares are post-ride only, with the privacy zone trim. |
| Does the app share user location with third parties? | **Yes — disclosed** | Mapbox (route visualization), Open-Meteo (weather), Supabase (storage). Plain-text HTTP fallback to `34.116.139.172` for OSRM routing — listed exception in privacy policy until item 6-long ships TLS. |

## Category 9 — Communication

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain user-to-user communication? | **Yes** | Public comments on shared rides; reactions (likes, loves) on rides + hazards; hazard up/down votes. |
| Is the communication moderated? | **Yes** | Same moderation pipeline as hazards / shares — see Category 6. Comments require a full Google account (anonymous testers cannot comment), giving us trace-back capability for abuse. |
| Is the communication anonymous? | **Public username only** | Comments and shares always show the author's username. Hazard reports also show username. We do not allow truly-anonymous (no-name) UGC. |

## Category 10 — Digital purchases

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain in-app purchases? | **No** | No IAP, no premium features, no subscriptions. App is free; Romania-only at launch. |
| Does the app contain real-money gambling features? | **No** | — |

## Category 11 — Advertising

| Question | Answer | Source of truth |
|---|---|---|
| Does the app contain ads? | **No** | No ad SDK integrated. Advertising ID permission stripped in session 30 (preview v0.2.21). |
| Does the app target ads at children? | **No** | App is not child-directed; minimum age 16 per Terms of Service. |

## Category 12 — Children

| Question | Answer | Source of truth |
|---|---|---|
| Is the app designed for children under 13? | **No** | Minimum age 16 per Terms of Service. |
| Is the app primarily designed for children? | **No** | Target audience is adult cyclists. |
| Does the app collect personal info from users under 13? | **No** | Age is not collected, but ToS requires 16+. Advertising ID stripped. |

## Category 13 — Health and fitness

(IARC has begun including this category in some forms; answer if asked.)

| Question | Answer | Source of truth |
|---|---|---|
| Does the app track health metrics? | **No** | We track distance, duration, and elevation. We do not read heart rate, weight, sleep, or any clinical metric. CO₂ savings + microlives are *derived environmental* numbers, not health claims. |
| Does the app make medical claims? | **No** | — |

---

## After submission

- IARC issues separate ratings for each region: PEGI (Europe), ESRB (US), USK (Germany), GRAC (Korea), CERO (Japan), Classind (Brazil), and IARC generic. The cycling-app + UGC + location-sharing combination usually maps to:
  - PEGI: **12**
  - ESRB: **Everyone 10+**
  - USK: **6** or **12** (UGC tips it to 12)
  - IARC generic: **7+**
- The questionnaire takes ~10–15 minutes to fill once you have these answers.
- Re-submit if any category answer changes (e.g., when adding IAP or ads later — neither planned for soft launch).

## Source of truth pointers

- Moderation pipeline: `docs/ops/moderation-runbook.md`
- Data inventory + retention: `docs/playdatainstructions.md`
- Privacy posture: `apps/web/app/privacy/page.tsx`
- Account deletion mechanics: `apps/web/app/account-deletion/page.tsx`
- UGC code: `services/mobile-api/src/routes/moderation.ts`,
  `services/mobile-api/src/lib/moderationFilter.ts`,
  `apps/mobile/src/design-system/molecules/ReportSheet.tsx`
- Privacy zone trim: `packages/core/src/sharePrivacy.ts` (`trimPrivacyZone`)
