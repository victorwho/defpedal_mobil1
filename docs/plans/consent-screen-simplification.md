# Consent Screen Simplification — move both telemetry toggles to Settings

> ⚠️ **Premise superseded 2026-07-19.** This plan's "Legal model unchanged /
> No defaults flip" guarantee held only until 2026-07-19, when the
> controller flipped PostHog to default ON (commit `a01aadb`, session 95b)
> without the ANSPDCP review the guarantee referenced. The structural work
> this plan shipped (consent screen removed, Settings as single control
> surface, transparency notice) is still live — the notice now discloses
> BOTH default-ON channels. Current policy: `.claude/CLAUDE.md` telemetry
> section + `docs/legal/dpia.md` amendment log.

**Date:** 2026-07-16 · **Status:** implemented 2026-07-16
**Why:** first-install asks are stacking (location → region gate → consent toggles → signup). Crash reporting runs on legitimate interest (Art 6(1)(f)) — the objection control may live in Settings; only transparency at collection is required up front. Product analytics stays opt-in (consent basis) — its toggle moves to Settings too, where flipping it ON is still a valid affirmative act.
**Legal model unchanged:** Sentry = legitimate interest, default ON, right to object in Settings. PostHog = consent, default OFF, opt-in in Settings. No defaults flip. (CLAUDE.md rule "don't flip defaults ON without ANSPDCP review" is not violated — Sentry's default is already ON.)

Key fact for the implementer: **both toggles already exist in Settings** at `apps/mobile/app/privacy-analytics.tsx` (reached via Profile). This task removes the onboarding consent screen, adds a transparency notice, and fixes enable-timing — it does NOT build a new Settings surface.

---

## Prompt for Claude Code (paste everything below)

> Read `.claude/CLAUDE.md` and `.claude/error-log.md` first. Simplify onboarding by removing the consent screen (`apps/mobile/app/onboarding/consent.tsx`) from the flow. Both telemetry controls already exist in `apps/mobile/app/privacy-analytics.tsx` — that screen becomes the single control surface. Requirements:
>
> ### 1. Remove the consent screen from the onboarding flow
> - Current flow: intro/location → region-check → consent → signup-prompt. New flow: intro/location → region-check → signup-prompt.
> - Find every reference first: `grep -rn "consent" apps/mobile/app apps/mobile/src --include=*.ts --include=*.tsx` — update `computeOnboardingGateTarget.ts`, `useOnboardingGate.ts`, region-check's next-screen navigation, and any `_layout.tsx` stack registration. Update their tests (`useOnboardingGate.test.ts` etc.).
> - Delete `consent.tsx` only if nothing references it after rewiring; if the onboarding gate logic makes deletion risky, leave it orphaned like `safety-score.tsx`/`goal-selection.tsx` and note that in progress.md.
> - CRITICAL: do not break the anonymous re-prompt gate (`computeOnboardingGateTarget` also drives the 2nd/3rd-cold-open signup re-prompt). Run its full test suite.
>
> ### 2. Transparency notice (required — this is the legal condition for the move)
> - Add a compact static line to the FIRST onboarding screen (`apps/mobile/app/onboarding/index.tsx`), footer area, `textXs` muted: EN `We collect anonymous crash reports to keep the app stable. Manage this and analytics anytime in Profile › Privacy.` + tappable `Privacy Policy` link (reuse `PRIVACY_URL` from `src/lib/legal-urls`). Add RO and ES translations (i18n has en/ro/es — all three, keys under `onboarding.*`).
> - Do not remove the existing Terms/Privacy links on signup-prompt.
>
> ### 3. Fix telemetry enable-timing
> - Today, Sentry/PostHog enablement is driven by the consent screen writing `analyticsConsent` + `capturedAt` (see `apps/mobile/src/lib/telemetry.ts` and the provider that calls `enableSentry`/`enablePostHog` — likely `TelemetryProvider.tsx`). Inspect how `capturedAt` gates startup enablement.
> - New behavior: on app start, enable Sentry whenever `analyticsConsent.sentry !== false` (i.e., immediately on fresh installs — legitimate interest needs no capture event). PostHog enables only when `analyticsConsent.posthog === true`. The Settings toggles in `privacy-analytics.tsx` keep working exactly as they do now (they already call `setAnalyticsConsent` and the enable/disable functions must react — verify the provider subscribes to store changes, not just initial state).
> - `capturedAt` semantics: keep the field; from now on set it when the user *changes* either toggle in Settings (evidence of the affirmative act for PostHog / the objection for Sentry). Add a persist migration bump ONLY if the stored shape changes — preserving existing users' saved choices is mandatory: anyone who turned Sentry OFF stays OFF; anyone who opted PostHog ON stays ON. Write a migration test for both cases.
>
> ### 4. Settings screen polish (small)
> - In `privacy-analytics.tsx`, ensure the two rows have honest sub-labels reflecting the legal bases: crash reporting — EN `On by default to keep the app stable. Anonymous. Turn off anytime.`; product analytics — EN `Off by default. Anonymous usage events that help us decide what to build. No GPS tracks.` RO + ES equivalents. Keep default states as-is (sentry ON, posthog OFF).
> - In Profile, verify the row linking to this screen is labeled clearly (e.g., "Privacy & Analytics") in all three locales.
>
> ### 5. Checks
> - `npm run check:bundle` → HTTP 200 before phone test; `npm run typecheck` → 0 errors; all onboarding-gate and telemetry tests green; update `progress.md`.
> - Manual test matrix (state so before finishing): fresh install → onboarding has no consent screen, notice line visible, Sentry active (verify via Diagnostics smoke event path), PostHog inactive; toggle PostHog ON in Settings → events flow; toggle Sentry OFF → `disableSentry` runs; upgrade path → existing users' choices preserved and they do NOT see onboarding again.

---

## Manual steps for Victor

1. **Privacy Policy** (`apps/web/app/privacy/page.tsx`): if it describes toggles shown "during onboarding," reword to "in Profile › Privacy & Analytics; crash reporting is on by default and can be disabled anytime." Ship together with the app release.
2. **Counsel ping (cheap insurance):** "Moving the crash-reporting objection control from onboarding to Settings, same legitimate-interest basis, transparency notice stays at first run; analytics opt-in also moves to Settings, still unticked. Any concern?" — same channel as the April review.
3. Nothing changes on the Play Data Safety form — data collected and defaults are identical; only UI placement moved.

## Interaction with other plans
- `registration-conversion-workplan.md` WP1 (signup screen) is untouched but the flow shortens by one screen before it — retest the full onboarding path after both land.
- If WP4 (anonymous push) ships later, its "Riding tips & reminders" opt-in should NOT go on a resurrected consent screen — put it in the post-first-ride moment or Profile, per the same friction logic that motivated this change.
