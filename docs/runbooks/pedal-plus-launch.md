# Pedal Plus — launch runbook

Everything still unfinished, in the order it has to happen.

**Deadline: 2026-10-01** — 11 days from writing. Three things land on that date
and they are the same instant on purpose:

- `PLUS_MODES_FREE_UNTIL` — Cool and E-bike stop being free
- `PLUS_LAUNCH_AT_ISO` — accounts created from here are not grandfathered
- The paywall must therefore be **live**, or riders who sign up after it get
  capped retroactively when you eventually flip it

What the offering actually is: `docs/pedal-plus-offering.md`.

> **If you are going to miss the date, act on [Step 0](#step-0--decide-by-27-september)
> rather than letting it pass.** The app has told riders in three languages that
> these modes become Plus on 30 September. Silently not doing it is the option
> that costs trust; extending the promotion costs one release.

---

## Step 0 — decide by 27 September

Look at where Steps 1–4 have got to. If Apple billing is not finished and
tested by then, **extend the promotion instead of shipping untested billing.**

To extend, in one commit:

1. `packages/core/src/premiumCatalog.ts` → `PLUS_LAUNCH_AT_ISO` → new date
2. `packages/core/src/entitlement.ts` → `PLUS_MODES_FREE_UNTIL` → same date
3. Ship a release carrying it **before 30 September**, so the in-app notice and
   the store copy both name the new date.

Both constants move together. Moving one without the other reopens the
retroactive-capping hole.

---

## Steps 1-2 — Apple pricing and trial — DONE (2026-09-20)

Both completed via the API. Recorded here because the reason they first failed
is not discoverable from the error message.

| Subscription | Price | Trial |
|---|---|---|
| `pedal_plus_monthly` (6813978807) | USD 3.59 base | 7 days free, **175 territories** |
| `pedal_plus_annual` (6813978720) | USD 35.99 base | 7 days free, **175 territories** |

⚠️ **`POST /v1/subscriptionPrices` fails until territory availability exists.**
It returns `409 ENTITY_ERROR.RELATIONSHIP.INVALID — An error occurred while
processing the pricing information`, which says nothing about territories. A
new subscription has NO `subscriptionAvailability` resource at all
(`GET .../subscriptionAvailability` 404s), and a price cannot attach to a
product that is sold nowhere. Create availability first:

```
POST /v1/subscriptionAvailabilities
  attributes.availableInNewTerritories = true
  relationships.availableTerritories   = all 175 from GET /v1/territories
```

Pricing then succeeds on the first try.

⚠️ **Introductory offers are PER TERRITORY.** Omitting the `territory`
relationship returns `409 … missing a required relationship`. There is no
"all territories" form — it is 175 POSTs per subscription, 350 in total. That
matches Play, where the trial is explicitly free in all 173 regions plus the
fallback.

Scripts used, in the session scratchpad: `asc-set-avail.mjs`,
`asc-price-retry.mjs`, `asc-intro-all.mjs`.

---

## Step 3 — review screenshot (ASC UI, ~5 min) — STILL REQUIRED

**The only thing left before the subscriptions can be submitted.** Both sit at
`MISSING_METADATA` solely because of this; localizations, prices and trials are
all in place.

Deliberately not automated. The API can upload one, but a review screenshot is
meant to show Apple's reviewer the actual purchase UI — a generated placeholder
is a misrepresentation and an easy rejection.

1. Run a preview build and reveal the paywall for your own account only:
   ```sql
   UPDATE profiles SET premium_ui_enabled = true WHERE id = '<your-user-id>';
   ```
2. Screenshot the paywall sheet with prices and the trial visible.
3. ASC → each subscription → **App Store Review Screenshot** → upload. The same
   image works for both.
4. Revert the flag.

State should move `MISSING_METADATA` → `READY_TO_SUBMIT`.

---

## Step 3b — submit them with a NEW app version

⚠️ **Apple requires the FIRST subscription to be submitted alongside an app
version.** Subsequent ones can go on their own; the first cannot.

v1.20 is already `READY_FOR_SALE`, so it cannot carry them. You need a fresh
version record:

1. Create version **1.21** in ASC (`PREPARE_FOR_SUBMISSION`) and attach a build
   — build 31 is uploaded and valid, or a newer one.
2. Add **1.21 and both subscriptions** as items on ONE review submission.
3. Submit.

Apple rejects a second *open* review submission, so there must be only one. A
stale empty one (`9f6ce98a-…`) was cleared on 2026-09-20 — note it could not be
cancelled (`409 … not in cancellable state`, which only applies to submissions
actually in review); the fix was deleting its items via
`DELETE /v1/reviewSubmissionItems/{id}`.

---

## Step 4 — RevenueCat iOS (dashboard, ~15 min)

**This is the one that cannot be scripted at all** — there is no RevenueCat
secret or v2 API key on this machine, and the public SDK key can only read.

Today `EXPO_PUBLIC_REVENUECAT_IOS_KEY` starts `test_`, which is RevenueCat's
**Test Store**. Its offering returns generic `monthly` / `yearly`. On iOS the
paywall would show sandbox data and no real purchase is possible.

In app.revenuecat.com, project Defensive Pedal:

1. **Apps** → the iOS app → point it at App Store app **6778694757**, with an
   App Store Connect shared secret or the ASC API key.
2. **Products** → import `pedal_plus_monthly` and `pedal_plus_annual`.
3. **Entitlements** → `pedal_plus` → attach both iOS products.
   The app reads this identifier (`PLUS_ENTITLEMENT_ID`); anything else and a
   real purchase grants nothing.
4. **Offerings** → `default` → add both as `$rc_monthly` / `$rc_annual`,
   matching the Android offering exactly.
5. **API keys** → copy the iOS **public** key. It must start **`appl_`**.

Then put it in four places:

```bash
# 1. apps/mobile/.env
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...

# 2-4. all three EAS environments
cd apps/mobile
npx eas-cli env:create --environment development --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --visibility sensitive --force
npx eas-cli env:create --environment preview     --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --visibility sensitive --force
npx eas-cli env:create --environment production  --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --visibility sensitive --force
```

**Verify** the key is real and mapped — this should return
`pedal_plus_monthly`, not `monthly`:

```bash
curl -s "https://api.revenuecat.com/v1/subscribers/probe/offerings" \
  -H "Authorization: Bearer appl_..." -H "X-Platform: ios" | head -c 400
```

---

## Step 5 — test a real purchase (device, ~30 min)

**Nothing in this entire batch has run on a handset.** This is the step that
matters most and the one most easily skipped.

Android, on a preview build with a licence-tester Play account:

1. Reveal the paywall for your own account only:
   ```sql
   UPDATE profiles SET premium_ui_enabled = true WHERE id = '<your-user-id>';
   ```
2. Open the paywall. **Prices must render** (EUR 3.59 / EUR 35.99) and the
   7-day trial must be offered. Empty prices mean the offering is not resolving.
3. Buy the monthly plan. Confirm:
   - `POST /v1/billing/webhook` fires and `subscriptions` gets a row
   - `usePremium().isPlus` becomes true
   - Cool and E-bike pills appear and route on the premium graphs
4. **Restore purchases** on a reinstall.
5. Cancel, and confirm access persists to period end rather than vanishing.

Then the same on iOS with a sandbox account, once Steps 1–4 are done.

Revert your own flag afterwards:
```sql
UPDATE profiles SET premium_ui_enabled = false WHERE id = '<your-user-id>';
```

---

## Step 6 — ship the client

Five commits are sitting unpushed at time of writing:

```bash
cd C:\dev\defpedal
git log --oneline origin/main..HEAD
git push origin main          # pre-push hook runs typecheck + lint
```

Then build and release. The client carrying the Cool/E-bike gates **must be
live in both stores before the paywall is flipped** — the gate ships in the
app, so an older build ignores it entirely.

```bash
# bump versionCode + versionName in
#   apps/mobile/android/app/build.gradle
#   apps/mobile/app.config.ts
cd C:\dpb\apps\mobile\android && ./gradlew --stop   # error-log #121, bites every back-to-back build
cd C:\dev\defpedal && npm run build:production
# verify signer, version and bundle content BEFORE upload (see CLAUDE.md)
node scripts/play-publish.mjs --aab apkreleases/DefensivePedal-Production-v<X>.aab \
  --track production --status inProgress --fraction 0.05 --notes <notes-dir>
```

iOS: `eas build -p ios --profile production`, then submit — remembering the two
recorded quirks, `APP_VARIANT=production` and the temporary `ascApiKey*` triplet
in `eas.json` (`docs/runbooks/ios-app-store-submission.md`).

---

## Step 7 — flip the paywall (the actual launch)

Only when Steps 1–6 are all done.

```bash
# supabase/migrations/202610010001_pedal_plus_go_live.sql
# Read its header first — it lists the preconditions.
```

It flips `premium_ui_enabled` to default true and backfills every row. There is
no undo that gives a rider back the moment they first saw a price.

Immediately after, verify a grandfathered account is still exempt:
```sql
-- expect premium_ui_enabled = true AND created_at < '2026-10-01'
SELECT premium_ui_enabled, created_at FROM profiles WHERE id = '<an-old-user-id>';
```
That rider should see the paywall and still be able to save a 6th route.

---

## Step 8 — advance the Android rollout

v0.2.170 is at **5%**. Before each tier increase, check crash-free users and
ANR for 24h on the previous tier.

```bash
node scripts/play-publish.mjs --aab <same aab> --track production \
  --status inProgress --fraction 0.20    # then 0.50, then --status completed
```

⚠️ Read the vitals gate as a **catastrophe detector, not a quality bar** —
production session volume is far too low for a 99.5% threshold to be
measurable. Direct rider reports are the real signal.

iOS 1.20 is `WAITING_FOR_REVIEW` with `releaseType: MANUAL`, so after Apple
approves **you must press publish** in ASC. It will not go live on its own.

---

## Not blocking launch, but open

| | |
|---|---|
| **Annual discount is thin** | EUR 35.99 vs EUR 43.08 of monthlies = **16%**. Typical is 30–40%. The annual plan is what protects against churn — consider EUR 29.99 (30%). |
| **Flat meter is dead code** | ~10 files (`flatRouteMeter.ts`, store slice, `ProfileDeviceSyncManager` sync, `canStartFlatRoute`). Flat is free and unlimited; nothing reads the meter. |
| **Loop metering is client-only** | `POST /v1/loops` is a real endpoint and could be server-metered — needs a per-user counter table. Courses and packs can never be server-enforced; they have no server-side existence. |
| **Privacy Policy** | Still does not name the `app_open` telemetry processing (pre-existing). |
