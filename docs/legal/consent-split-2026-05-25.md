# Consent split decision — 2026-05-25

> ⚠️ **Partially superseded 2026-07-19.** The **PostHog row** of this decision
> (default OFF, Art 6(1)(a) consent basis) was overridden by the controller:
> PostHog now defaults **ON** with a Settings opt-out (commit `a01aadb`,
> session 95b), without the ANSPDCP/ePrivacy review this memo's framework
> anticipated. Explicit user choices (`capturedAt !== null`) still survive
> every upgrade, and `capturedAt` is still never stamped by defaults. The
> **Sentry row is unchanged** (default ON, legitimate interest). Current
> policy source of truth: `.claude/CLAUDE.md` telemetry section +
> `docs/legal/dpia.md` amendment log. This memo remains the unedited record
> of the 2026-05-25 decision.

**Status:** decided and implemented in v0.2.77 (TBD release).
**Authoriser:** Victor Rotariu (sole controller, Defensive Pedal).
**Related work:** sentryfix.md item P0.1 (was blocking P3f fatal tagging).

---

## Decision

Split the previously-bundled `analyticsConsent` toggle into two independent
legal bases:

| Channel | Default | Legal basis | Notes |
|---|---|---|---|
| **Sentry crash reports** | ON | Legitimate interest (GDPR Art 6(1)(f)) | Service-stability diagnostics. User-objectable via Profile → Privacy & analytics (Art 21). |
| **PostHog product analytics** | OFF | Consent (Art 6(1)(a)) | Non-essential. ePrivacy / Law 506/2004 require informed opt-in. |

The change applies to:

- **New users** — get the new defaults from the store initial state.
- **Existing users with `capturedAt !== null`** — keep their previously-saved
  choice verbatim. No silent re-flip of an explicit decision.
- **Existing users with `capturedAt === null` AND `sentry === false`** — a
  small cohort that installed before the consent screen existed (or whose
  persisted state was wiped without re-triggering onboarding). They never
  saw a consent UI and never made an explicit choice; the old `false` value
  was a bundled default they never interacted with. A one-shot persist
  migration (`version: 1`, implemented in `appStore.ts`'s `persist` config)
  flips their `sentry` to `true` on first hydration after the upgrade —
  applying the new legitimate-interest default to a cohort that hasn't
  exercised any consent right yet. Everyone else's data passes through
  the migration untouched.

---

## Why this needed to change

The previous design (both flags default OFF, single bundled consent screen)
was a safe-but-blunt posture chosen during the 2026-04-29 counsel review when
the legal basis question was deferred. The MOBILE-8 + MOBILE-9 Sentry tag
investigation (sentryfix.md, P3f) surfaced that **most production fatals were
invisible to us** because the opt-in rate appears low and crashes that fire
before `Sentry.init` run in JS are captured natively without consent state at
hand.

We can't fix bugs we can't see. Splitting the basis lets us:

- Receive every production crash, not just the ~minority that opt in.
- Keep the strict opt-in posture for the genuinely non-essential channel
  (product analytics).
- Stop entangling P3f fatal-tagging work with a consent-state lookup.

---

## Compliance reasoning

**GDPR Art 6(1)(f) legitimate-interest test for crash reports:**

1. **Legitimate interest identified.** Diagnosing and fixing crashes is
   necessary to provide a safe, functional cycling-navigation service. A
   navigation app that crashes during a ride risks rider safety, not just
   user satisfaction.
2. **Necessity.** Crash diagnostics cannot be collected post-hoc; they must
   capture the failure at the moment it occurs. No less-intrusive alternative
   achieves the same purpose.
3. **Balancing.** Sentry receives anonymised stack traces, app version, device
   model, OS version. No GPS, no PII beyond a server-side-resolved user id
   used to dedupe (which we already process under a different basis).
   EU-region storage, no third-party sharing. Reasonable expectations of users
   installing a safety-focused app include "the developers can see and fix
   crashes" — opt-in framing arguably under-served those expectations.
4. **Right to object preserved.** The Profile → Privacy & analytics toggle
   remains visible and functional. Art 21 right is operative.

**ePrivacy / Law 506/2004 (RO):**

- The directive's strict consent requirement applies to "storage of or access
  to information" stored on the user's terminal — i.e., cookies / device
  identifiers used for tracking. Sentry's crash reports as configured
  (anonymised, EU-stored, scoped to error events) do not store tracking
  identifiers on the device beyond an anonymous install ID. The legitimate-
  interest basis is consistent with Recital 30 of the directive.
- PostHog stores anonymous user ids in AsyncStorage and tracks usage events —
  this is closer to traditional analytics-cookie territory, and we keep the
  opt-in posture there.

**Data Safety form (Play Console):**

- Section "Data Collection" — keep "Crash logs" + "App performance" marked
  as collected; update the "Optional" flag to **"Required"** for crash logs
  with the legitimate-interest disclosure linked.
- Section "App functionality" — keep PostHog-backed events under
  "Optional / opt-in" (no change).
- **HARD RULE (from CLAUDE.md):** update the Play form AFTER the production
  AAB ships with the new defaults, not before.

---

## Implementation summary

Code changes (2026-05-25):

- `apps/mobile/src/store/appStore.ts:308` — default literal changed from
  `{ sentry: false, posthog: false, capturedAt: null }` to
  `{ sentry: true, posthog: false, capturedAt: null }`. Comment block above
  the literal records the legal basis breakdown.
- `apps/mobile/app/onboarding/consent.tsx` — `crashReports` first-time
  default flipped to `true`; `productAnalytics` stays `false`. File header
  + inline comment block updated.
- `apps/mobile/app/privacy-analytics.tsx` — no code change. The screen
  surfaces both toggles independently as before; the new defaults flow
  through the store. Copy was updated via i18n.
- `apps/mobile/src/i18n/en.ts` + `apps/mobile/src/i18n/ro.ts` — subtitle,
  per-toggle descriptions, and intro copy on `onboardingConsent.*` and
  `privacyAnalytics.*` reframed to make the asymmetric defaults explicit.
- `apps/web/app/privacy/page.tsx` — Sentry and PostHog sub-processor
  entries updated. "What we collect" section split crash diagnostics
  (legitimate-interest) from product analytics (opt-in).

No DB migration. The client-side migration is a Zustand persist
`version: 1` bump with a `migrate` function in `apps/mobile/src/store/appStore.ts`
that selectively flips `sentry: false → true` only for users whose
`capturedAt === null` (no explicit choice made yet). All other persisted
states pass through untouched, so any user with a non-null `capturedAt`
keeps the values they previously chose.

---

## What still depends on this decision

- **P3f (fatal tagging)** — now unblocked. Under the split, the Sentry SDK
  can initialise eagerly (no consent-state lookup needed before `Sentry.init`)
  so native fatals captured via `ApplicationExitInfo` on the next launch
  will carry the correct `app_variant` tag from `initialScope`. See
  sentryfix.md section 4.
- **Data Safety form update** — to be applied AFTER the production AAB
  carrying this default ships and rollout reaches a percentage tier we're
  comfortable with (see CLAUDE.md > Play Store Release > rollout gate).
