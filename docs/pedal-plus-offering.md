# Pedal Plus — what is actually in it

**Source of truth for the offering.** Every number here is read from the code
or queried from the live Play / App Store Connect APIs — never from intent. If this file and `docs/plans/pedal-plus-premium-tier.md`
disagree, this file is right — see [Superseded claims](#superseded-claims).

Last verified: **2026-09-19** (code, Play Developer API, App Store Connect API).

- Limits: `packages/core/src/premiumCatalog.ts` (`FREE_LIMITS`, `PLUS_LIMITS`)
- Gates: `packages/core/src/entitlement.ts`
- Client read path: `apps/mobile/src/hooks/usePremium.ts`
- Server enforcement: `services/mobile-api/src/lib/premiumEnforcement.ts`

> **Nothing below is live.** `profiles.premium_ui_enabled` is `false` for every
> account. Applying `supabase/migrations/202610010001_pedal_plus_go_live.sql`
> is what turns it on, and that is a deliberate act with preconditions — they
> are listed in the migration.

---

## The offering

Plus is **two routing modes plus seven ceilings removed**. There is nothing
else in it.

### The two routing modes

These are capability — things the free tier cannot do at all. They are the only
part of Plus that is a feature rather than a quantity.

| Mode | What it does | Coverage |
|---|---|---|
| **Cool** | Routes under tree canopy where it can, and reports how much of the ride is shaded | 31 covered countries (widened from Romania on 2026-09-17) |
| **E-bike** | Prices climbs for a motor rather than legs — different routes and materially different ETAs | 31 covered countries, one graph |

Both are **free to every rider until `PLUS_MODES_FREE_UNTIL` (2026-10-01,
exclusive)**, then Plus-only. The promotion is announced in-app by a one-time
notice naming both modes.

⚠️ **Neither is grandfathered.** Every ceiling below is waived for pre-launch
accounts; these two are not. That is deliberate and it is load-bearing — see
[What existing riders get](#what-existing-riders-get). A test in
`entitlement.test.ts` pins it, so widening grandfathering cannot silently give
either away.

### The seven ceilings

These apply **only to accounts created on or after `PLUS_LAUNCH_AT_ISO`
(2026-10-01)**.

| | Free | Plus |
|---|---|---|
| Saved routes | 5 | unlimited |
| Imported GPX courses | 2 | unlimited |
| Offline map packs | 1 | unlimited |
| Offline pack lifetime | auto-deleted after 5 days | never expire |
| Offline storage budget | 200 MB | 2 GB |
| Ride history | rolling 90 days | everything |
| Loop searches | 3 / month | unlimited |

Two properties worth stating plainly:

- **Nothing is ever deleted for tier reasons.** Content above a cap stays
  usable; the cap only refuses *additions*. History is hidden by a read
  filter, never removed — subscribing reveals it instantly.
- **They are all quantity, not capability.** Every one is "more of something
  free already does". That is why the two routing modes carry the offer.

### What is NOT in Plus

- **Flat routing.** Free and unlimited for everyone. It was nominally 3/month
  but never metered anything — the gate and the consume action were both
  unreachable — and metering it in 2026 would have taken back a mode that
  shipped free months earlier. Flat *loops* are still covered by the loop-search
  meter, because a flat loop is a loop.
- Safety-first routing, risk overlays, hazards, community, badges, tiers,
  navigation, GPX import, weather. All free, all staying free.

---

## What existing riders get

**Nothing, except the two routing modes.**

Accounts created before 2026-10-01 are grandfathered and exempt from all seven
ceilings — unlimited saved routes, courses, packs, history and loop searches,
with no pack expiry. That was a deliberate decision on 2026-09-18: the previous
rule ("content stays, additions are capped") produced a rider with twelve saved
routes who keeps all twelve and then cannot save a thirteenth. Their app got
worse on an ordinary Tuesday because we introduced a price.

The consequence, stated so it is not discovered at launch: for the **~3,365
accounts that exist today, Cool and E-bike ARE Pedal Plus.** Remove those two
and the product is empty for them. Any future work to make Plus more compelling
to the existing base has to be a new capability — the ceilings cannot do it.

---

## Where each gate is actually enforced

A client check is a courtesy; a server check is a control. Both are gated on
`premium_ui_enabled` and both fail **open**.

| Gate | Client | Server | Notes |
|---|---|---|---|
| Saved routes | ✅ | ✅ `assertCanSaveRoute` | |
| Ride history | — | ✅ read filter | Server-side by nature |
| Imported GPX courses | ✅ | ❌ **impossible** | No server-side existence: JSON files in `documentDirectory` + a device-scoped store slice |
| Offline packs | ✅ | ❌ **impossible** | Mapbox tile packs on the handset |
| Loop searches | ✅ | ❌ not built | `POST /v1/loops` is a real endpoint, so this one *could* be server-metered — needs a per-user counter table |
| Cool | ✅ `blockCoolRouting` | ❌ | App routes client-side against OSRM; server never sees it |
| E-bike | ✅ `blockEbikeRouting` | ❌ | As above |

So only **two** of the seven are binding against a modified client, and two
more can never be without first giving them server-side existence.

Both mode gates fold in `uiEnabled` deliberately: if the paywall flip slips
past `PLUS_MODES_FREE_UNTIL`, they would otherwise withdraw Cool and E-bike on
the promised date while leaving no way to buy them back. Dark paywall therefore
means the modes stay free.

---

## Pricing and billing setup

Verified against the live Play and App Store Connect APIs on **2026-09-19**, not
from intent. An earlier version of this file said no products existed anywhere;
that was wrong, asserted from a code read instead of querying the stores.

### Google Play — complete and live

| Product | Base plan | State | Period | Regions | Price |
|---|---|---|---|---|---|
| `pedal_plus_monthly` | `pedal-monthly` | ACTIVE | P1M | 173 | **EUR 3.59** (USD 3.51 fallback) |
| `pedal_plus_annual` | `pedal-plus-annual` | ACTIVE | P1Y | 173 | **EUR 35.99** |

**Free trial: 7 days, ACTIVE on both** (offer `freetrial-7d`, created
2026-09-19). Free in all 173 regions plus the `otherRegions` fallback, so it
cannot be silently missing anywhere the plan sells. Eligibility is
`anySubscriptionInApp` — never subscribed to ANY subscription in this app —
rather than per-subscription, which would have let a rider take 7 free days on
monthly and another 7 on annual.

RevenueCat's Android offering `default` maps `$rc_monthly` and `$rc_annual` to
exactly these product and base-plan IDs, and the app looks for entitlement
`pedal_plus` (`PLUS_ENTITLEMENT_ID`). That chain is complete.

⚠️ **The annual is only a 16% discount** on 12 monthly payments (EUR 35.99 vs
EUR 43.08). Typical annual plans discount 30-40%. The annual plan is what
protects against monthly churn, so this is worth revisiting before launch.

### Apple — products exist, NOT finishable from here

| | State |
|---|---|
| Subscription group `Pedal Plus` (22397898) | created, localized en-US |
| `pedal_plus_monthly` (6813978807), ONE_MONTH | `MISSING_METADATA` |
| `pedal_plus_annual` (6813978720), ONE_YEAR | `MISSING_METADATA` |
| Localizations | 1 each (en-US) |
| **Prices** | **0 — blocked** |
| **Introductory offers (trial)** | **0 — blocked behind prices** |

`POST /v1/subscriptionPrices` rejects every documented payload shape with
`409 ENTITY_ERROR.RELATIONSHIP.INVALID — An error occurred while processing the
pricing information`, including with and without `startDate` /
`preserveCurrentPrice`, and with an explicit `territory` relationship. The
price points themselves resolve correctly (USD 3.59 and USD 35.99 both exist as
exact points for these subscriptions). **Finish pricing in the ASC UI**, then
the 7-day introductory offer, then the review screenshot each subscription
needs before it can be submitted.

### RevenueCat — iOS is pointed at the Test Store

`EXPO_PUBLIC_REVENUECAT_IOS_KEY` begins **`test_`**. Real Apple SDK keys begin
`appl_`. Its offering returns generic `monthly` / `yearly` with no base-plan
identifiers — RevenueCat's sandbox defaults, not App Store Connect products. So
on iOS the paywall would show test data and no real purchase is possible.

Fixing it is dashboard work and **cannot be scripted from here**: no RevenueCat
secret or v2 API key exists on this machine, and the public SDK key can only
read offerings. Required: point the RevenueCat iOS app at App Store app
6778694757, map both products to the `pedal_plus` entitlement, add them to the
`default` offering, then put the real `appl_` key in `apps/mobile/.env` and all
three EAS environments.

The server already has `POST /v1/billing/webhook` for RevenueCat.

### Blockers for launch

1. Apple prices + 7-day offer + review screenshots (ASC UI).
2. RevenueCat iOS reconfiguration and a real `appl_` key.

Android has no remaining billing blockers.

## Dates and commitments

| Date | What |
|---|---|
| **2026-10-01** | `PLUS_MODES_FREE_UNTIL` — Cool and E-bike become Plus-only |
| **2026-10-01** | `PLUS_LAUNCH_AT_ISO` — accounts created from here are not grandfathered |

These are the same instant on purpose. It also means **the paywall must be live
by then**: a rider who signs up after it while the paywall is still dark would
be capped retroactively the day it is flipped, which is precisely what
grandfathering exists to prevent.

**If it slips, extend the promotion.** Move `PLUS_MODES_FREE_UNTIL` and
`PLUS_LAUNCH_AT_ISO` together in a shipped release, before the date. Riders
lose nothing and no promise is broken. Do not ship untested billing to hit a
calendar date, and do not let the modes quietly stay free past a date the app
has already named in three languages.

---

## Superseded claims

`docs/plans/pedal-plus-premium-tier.md` is the original plan and remains the
record of *why* the tier exists. These specific claims in it are now wrong:

| Plan doc says | Actually |
|---|---|
| "Cool routing — Romania only at launch" | All 31 covered countries since 2026-09-17 |
| "Unlimited Flat routing … 3 flat-route rides per calendar month" | Flat is free and unlimited for everyone; it was never metered |
| "the caps only bite when adding something new" (for existing riders) | Pre-launch accounts are exempt from the caps entirely |
| Plus = Cool + four ceiling groups | Plus = Cool + **E-bike** + seven ceilings |

The same "Romania for now" wording was live in the production paywall until
2026-09-19 and has been corrected in all three locales.
