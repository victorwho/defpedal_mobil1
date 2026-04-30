# How the consent default-ON behaviour actually works

This is the focused walkthrough for counsel — to spare you reading 200+ lines of
React Native boilerplate in `06-consent-screen.tsx` to find the 12 lines that
matter. Source file: `apps/mobile/app/onboarding/consent.tsx`. Snapshot date:
2026-04-29.

---

## When this screen is shown

The consent screen is shown during the **first-run onboarding flow**, after the
location-permission screen and before the safety-score map. A user cannot
proceed past it without tapping Continue (which persists their choice). The flow
order is set in `apps/mobile/app/onboarding/index.tsx`:

```
location-permission  →  consent  →  safety-score  →  goal  →  signup
                       ↑ this screen
```

Returning users (who have onboarded before) do not see this screen. They can
revisit and revoke at any time from **Profile → Privacy & analytics**, which
opens `apps/mobile/app/privacy-analytics.tsx`.

---

## The default-ON code — exact source

From `06-consent-screen.tsx` lines 41–66:

```tsx
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const persistedSentry      = useAppStore((s) => s.analyticsConsent.sentry);
  const persistedPosthog     = useAppStore((s) => s.analyticsConsent.posthog);
  const persistedCapturedAt  = useAppStore((s) => s.analyticsConsent.capturedAt);

  // First-time defaults vs returning visitor:
  // - Both crash reports (Sentry) and product analytics (PostHog) default ON
  //   for first-time onboarding (capturedAt is null). User opts out from the
  //   same screen or anytime later in Profile → Privacy & analytics.
  // - Crash reports defense: GDPR Art. 6(1)(f) "legitimate interest" with
  //   sendDefaultPii=false (no IP / no user-agent / no cookies). Standard
  //   posture for product crash diagnostics.
  // - Product analytics defense: thinner — ANSPDCP / Law 506/2004 generally
  //   treats this as opt-in. PostHog's anonymous-event posture is partial
  //   mitigation. Privacy policy (item 3) MUST disclose both defaults +
  //   how to opt out. Counsel review recommended before production rollout.
  // - Returning users always see their previously-saved choice; we never
  //   silently flip a setting they already opted out of.
  const isFirstTimeConsent = persistedCapturedAt === null;
  const [crashReports, setCrashReports] = useState(
    isFirstTimeConsent ? true : persistedSentry,
  );
  const [productAnalytics, setProductAnalytics] = useState(
    isFirstTimeConsent ? true : persistedPosthog,
  );
```

**Plain English translation:**

- `persistedCapturedAt` is `null` only on the very first time the user sees this
  screen on this device install.
- When `isFirstTimeConsent === true`: both toggles are pre-set to ON. The user
  has to actively toggle them OFF and tap Continue to opt out.
- When `isFirstTimeConsent === false` (returning user reaching this screen,
  which only happens through Profile → Privacy & analytics): toggles reflect
  their last saved choice. We never silently flip an already-opted-out setting
  back to ON.

---

## When the user taps "Continue"

From `06-consent-screen.tsx` lines 67–73:

```tsx
  const handleContinue = () => {
    setAnalyticsConsent({
      sentry: sentryConfigured ? crashReports : false,
      posthog: posthogConfigured ? productAnalytics : false,
    });
    router.push('/onboarding/safety-score');
  };
```

This persists the choice to local device storage (Zustand + AsyncStorage), and
sets `capturedAt` to the current ISO timestamp so future visits know the
decision has been made. The `sentryConfigured` and `posthogConfigured` checks
ensure that if the build was created without an SDK key (e.g. dev builds
without secrets), telemetry is forced off regardless of toggle state.

---

## What happens if the user taps Back instead of Continue

The user CANNOT skip past this screen by tapping Back — the onboarding flow has
a guard (`apps/mobile/app/onboarding/_layout.tsx`) that prevents skipping
forward without an explicit choice. If they kill the app entirely without
tapping Continue, they will see the same screen on next launch.

---

## How telemetry is gated

`Sentry.init(...)` and the PostHog client are NOT called eagerly. They are
called from `apps/mobile/src/lib/telemetry.ts` only after `setTelemetryConsent`
is invoked from the consent slice. Until the user taps Continue, no events fire
to either provider.

`Sentry` is initialised with `sendDefaultPii: false` to prevent IP, user-agent,
and cookie capture — this is the engineering-team-claimed mitigation that
underpins the "legitimate interest" legal basis under Art. 6(1)(f).

---

## Specific questions for counsel re: this code

1. **Is the default-ON for crash reports (Sentry) defensible** as legitimate
   interest under Art. 6(1)(f) in Romania, given `sendDefaultPii: false`?
   Engineering position: yes, this is industry standard. Counsel call?

2. **Is the default-ON for product analytics (PostHog) defensible**, given that
   ANSPDCP enforcement and EDPB guidance generally treat product analytics as
   opt-in? Engineering position: contested edge — flagged for counsel review.
   This is the most likely finding to require remediation before production.

3. **If counsel says default-OFF is required for analytics**: the change is one
   line — flip line 65 from `isFirstTimeConsent ? true : persistedPosthog` to
   `isFirstTimeConsent ? false : persistedPosthog`. Same for line 62 if Sentry
   default needs to flip too. Engineering can ship this in <1 day.

4. **Is the wording of the consent screen text** (in `apps/mobile/src/i18n/`,
   under `consent.*` keys — not in this snapshot but available on request) clear
   enough to constitute informed consent under Art. 7?

5. **Is the absence of a "Reject all" single-tap button** a problem? Currently
   the user must toggle each row individually then tap Continue. Best practice
   under EDPB guidance is to offer a single "Reject all" button as prominent as
   "Accept all". We do NOT have an explicit Accept-all button — Continue acts
   as accept-current-state — but we also lack Reject-all.

---

## Where the rest of the legal context lives in this package

- **`02-compliance-plan.md` Item 8** — the original deviation note from the
  engineering plan, with per-channel legal posture
- **`01-dpia.md` Risk R6** — DPIA risk row covering this exact issue
- **`04-privacy-page.tsx`** — the public Privacy Policy text that will inform
  users about this default + how to opt out
