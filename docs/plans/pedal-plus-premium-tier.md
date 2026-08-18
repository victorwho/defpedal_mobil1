## Problem Statement

Defensive Pedal is free in full today. Every feature — safety-first routing, risk overlays, offline maps, saved routes, the badge and tier systems — costs riders nothing, and costs real money to run: OSRM instances for three routing profiles, a 67.9M-row PostGIS risk dataset, Mapbox tiles and Directions, Cloud Run, Supabase, Expo push. There is no revenue line at all, so every new rider makes the product more expensive to operate, and there is no mechanism that lets the riders who get the most value contribute to keeping it alive.

There is also no way to fund the work riders keep asking for. Features that are genuinely expensive to build and run — shade/heat-model routing needs an entire additional OSRM graph per country — have no funding path, so they either ship at a loss or do not ship.

From a rider's perspective the problem is narrower and more concrete: the people who use the app hardest have no way to support it, and no way to get more of it. A daily commuter with a dozen regular routes, a rider who plans around hills because of their knees, someone who wants their full riding history rather than a recent slice — all of them would happily pay a small amount, and today there is nothing to pay for.

## Solution

Introduce **Pedal Plus**, a EUR 3/month subscription (with a discounted annual plan and a 7-day free trial) alongside a free tier that stays genuinely useful. Free remains a complete, safe, everyday cycling app. Plus removes the ceilings and adds capability that did not exist before.

**Pedal Plus includes:**

1. **Cool routing** — the shade/heat-model routing profile, which has never been available to riders. Romania only at launch, widening as shade graphs are built.
2. **Unlimited saved routes** — free keeps 5.
3. **Persistent offline maps** — free keeps 1 pack under the existing 5-day auto-delete and 200 MB budget. Plus raises the pack count, lifts the 5-day expiry so packs survive, and raises the storage budget.
4. **Full ride history and advanced stats** — free sees a rolling 90-day window. Plus sees everything, forever.
5. **Unlimited Flat routing** — free accounts created after launch get 3 flat-route rides per calendar month.

**Free stays honest.** Nothing a current rider has is taken away. Existing saved routes and packs above the caps are kept and stay usable; the caps only bite when adding something new. Flat-route metering applies **only to accounts created after launch** — riders who already have unlimited flat routing keep it permanently. History is *hidden*, never deleted: subscribing reveals it again instantly.

**Built invisible first.** The entire feature ships to production dark. A server-owned `premiumUiEnabled` flag, served per user, controls whether any of it renders; it defaults off for everyone. We build, ship and test the real purchase flow against the real stores with the paywall visible only to allowlisted accounts, then reveal it gradually while watching crash-free rate, ANR and conversion.

**Entitlement is server-owned and fails in the rider's favour.** The server is the source of truth, the device caches the last known answer, and if the server cannot be reached the cached entitlement is honoured for a grace window. A paying rider mid-tour with no signal never loses what they paid for.

## User Stories

### Prospective subscriber

1. As a rider who loves the app, I want a clear way to support it financially, so that it keeps existing.
2. As a rider considering Plus, I want to see exactly what I get before paying, so that I can judge whether it is worth EUR 3.
3. As a rider considering Plus, I want a free trial, so that I can experience the features before being charged.
4. As a rider considering Plus, I want to see the annual price and how much it saves versus monthly, so that I can pick the plan that suits me.
5. As a rider in a country where cool routing is unavailable, I want the paywall to be honest about that, so that I do not pay for something I cannot use.
6. As a price-sensitive rider, I want to see the price in a currency and amount that makes sense where I live, so that the cost is not a surprise at checkout.
7. As a rider who hits a limit, I want the upgrade prompt to appear at that moment, so that the offer is relevant to what I just tried to do.
8. As a rider who is not interested, I want to dismiss upgrade prompts and not be nagged repeatedly, so that the app stays pleasant to use.

### Subscribing and managing

9. As a subscriber, I want to buy Plus without leaving the app, so that it takes seconds.
10. As a subscriber, I want my purchase to unlock features immediately, so that I do not have to restart the app or wait.
11. As a subscriber, I want a Restore Purchases option, so that I can recover my subscription after reinstalling.
12. As a subscriber on a new phone, I want Plus to follow my account, so that I do not pay twice.
13. As a subscriber, I want an obvious way to see when my subscription renews and what I am paying, so that I am never surprised by a charge.
14. As a subscriber, I want a direct link to manage or cancel my subscription in the store, so that cancelling is not a dark pattern.
15. As a subscriber whose payment fails, I want to be told clearly and given a chance to fix it before losing access, so that an expired card does not silently downgrade me.
16. As a subscriber who cancels, I want to keep Plus until the end of the period I paid for, so that I get what I paid for.
17. As a former subscriber, I want my saved routes and history to still be there if I resubscribe, so that cancelling is not destructive.
18. As a rider with both an Android phone and an iPhone, I want my subscription recognised on whichever device I signed in on, so that one subscription covers me.

### Using Plus

19. As a Plus subscriber, I want to choose cool routing when planning, so that I can avoid baking in direct sun on hot days.
20. As a Plus subscriber, I want unlimited saved routes, so that I can keep every commute, weekend loop and errand route.
21. As a Plus subscriber, I want my offline packs to stay downloaded, so that they are not deleted after five days and re-downloaded on mobile data.
22. As a Plus subscriber, I want more offline packs and more storage, so that I can cover a whole region or a tour.
23. As a Plus subscriber, I want my complete ride history, so that I can look back at a ride from last year.
24. As a Plus subscriber, I want deeper stats and trends over my full history, so that I can see how my riding has changed.
25. As a Plus subscriber, I want unlimited flat routing, so that I can always avoid hills without counting.
26. As a Plus subscriber, I want a visible marker on my profile, so that other riders can see I support the app.
27. As a Plus subscriber riding with no signal, I want my Plus features to keep working, so that being offline does not downgrade me.

### Free tier

28. As a free rider, I want the app to remain genuinely useful without paying, so that safety-first routing is not paywalled.
29. As a free rider, I want to see how many saved routes I have left, so that the limit is not a surprise when I try to save one.
30. As a free rider at the saved-route limit, I want to delete an old route to make room, so that I am not forced to pay.
31. As a free rider who runs out of flat routes, I want to still get a good safe route with an explanation, so that I am never left without navigation.
32. As a free rider, I want to know when my flat-route allowance resets, so that I can plan around it.
33. As a free rider, I want my older rides preserved even if I cannot see them, so that subscribing later brings them back.
34. As a free rider who never subscribes, I want the app to keep working as it does today, so that nothing I rely on disappears.

### Existing riders

35. As an existing rider with more than 5 saved routes, I want to keep all of them, so that the new limit does not delete my work.
36. As an existing rider, I want to keep unlimited flat routing, so that a feature I have used for months is not taken away.
37. As an existing rider, I want any change to what is free communicated clearly, so that I do not discover it by hitting a wall.
38. As an existing rider with several offline packs, I want them to remain usable, so that the new pack limit does not strand me mid-tour.

### Dark launch, QA and operations

39. As the developer, I want the entire premium feature to ship to production invisible to riders, so that I can test the real purchase flow without exposing an unfinished paywall.
40. As the developer, I want to turn the paywall on for my own account only, so that I can validate end to end against the live stores.
41. As the developer, I want to reveal the paywall to a percentage of riders gradually, so that I can watch crash-free rate and ANR before full exposure.
42. As the developer, I want an instant server-side kill switch, so that I can hide the paywall without shipping an app release.
43. As the developer, I want to test purchases without being charged, so that I can validate the flow repeatedly.
44. As the developer, I want subscription state changes delivered by webhook, so that entitlement is correct without the app polling.
45. As the developer, I want duplicate webhook deliveries to be harmless, so that a retry cannot corrupt entitlement.
46. As the developer, I want to grant Plus manually to an account, so that I can support a rider whose purchase failed or run a giveaway.
47. As the developer, I want entitlement and paywall visibility to be independent, so that a subscriber keeps their features even while the paywall is hidden.
48. As the developer, I want conversion instrumented from paywall view to purchase, so that I can see where riders drop off.
49. As the developer, I want to know how often riders hit each limit, so that I can tune the free tier on evidence rather than guesswork.
50. As the developer, I want entitlement checks to fail open on a cached answer, so that an API outage does not downgrade every paying rider at once.
51. As the developer, I want the free-tier limits defined in exactly one place, so that changing a number does not mean hunting through the codebase.

## Implementation Decisions

### Commercial and store setup

- **Billing rail: RevenueCat**, chosen over direct Play Billing plus StoreKit. It provides one SDK and one webhook across both stores and owns receipt validation, renewals, grace periods, billing retry, refunds and cross-platform entitlement. Free below roughly USD 2.5k monthly tracked revenue, then a percentage. The alternative would mean hand-building Google RTDN via Pub/Sub, App Store Server Notifications v2, and a full renewal state machine.
- **Both stores launch simultaneously.** Entitlement is stored store-agnostically so neither store's vocabulary leaks into the domain model.
- **SKUs:** monthly at EUR 3 and a discounted annual, each with a 7-day free trial configured as a store-native introductory offer. No custom trial logic is written; trial state is read from the entitlement.
- Both stores' small-business programmes apply at this scale, so net revenue is roughly EUR 2.55 per monthly subscription. The stores act as merchant of record in the EU and handle VAT.

### Entitlement model

- **The server is the source of truth.** A new subscriptions record per user holds store, product, status, current period end, trial and grace state, and the RevenueCat app user id. Rows are readable by their owner under RLS and writable only by the service role.
- **Entitlement is exposed on the existing profile read**, reusing the established server-owns-it, client-hydrates pattern. The client never computes entitlement from a receipt.
- **Visibility is separate from entitlement.** A `premiumUiEnabled` flag on the profile controls whether paywall UI renders; it defaults off. A subscriber is entitled regardless of the flag, so hiding the paywall never strips features from someone who paid.
- **Grandfathering needs no new column.** It is the account creation timestamp compared against a launch constant held in the catalog module.
- **Offline policy: fail open on cached entitlement with a grace window.** The device persists the last known entitlement, force-flushed on change so a hard kill cannot lose it, and honours it for a grace period when the server is unreachable.
- **RevenueCat identity is tied to the Supabase user id**, with explicit login and logout on auth change so entitlements cannot leak between accounts on a shared device.

### Feature gating

- Every gate is a **single named predicate exported from core** — can-save-another-route, can-download-another-pack, can-start-flat-route, is-cool-routing-entitled, history-retention-cutoff — per the existing rule that a per-feature gate must never be a call-site local constant. Cool routing composes the entitlement gate with the existing country-availability predicate, so an unentitled rider and a rider in an uncovered country are distinct states with distinct messaging.
- **Free limits live as data in one catalog module**: 5 saved routes, 1 offline pack, 90-day history window, 3 flat-route rides per calendar month.
- **History is filtered, never deleted.** The retention cutoff is applied as a query filter for free riders; all rows remain. Lifetime impact totals, badges, XP and leaderboard snapshots are computed over the full history regardless of tier, so the cap never rewrites a rider's achievements.
- **Offline pack behaviour for Plus** lifts the 5-day auto-delete, raises the pack count and raises the storage budget; the existing LRU eviction remains as a backstop.

### Flat-route metering

- **The metering event is starting navigation on a flat route** — not computing a preview. Previewing, comparing and cycling the route-preview mode pill never consume quota, which also sidesteps the fact that that pill refetches on every tap.
- **Metering applies only to accounts created after launch.** Existing accounts are permanently exempt.
- **Counting is local-first and reconciled on sync**, reusing the offline-queue pattern: the device keeps its own tally and the server is eventual source of truth. A rider is never blocked mid-ride by a missing network.
- **Period boundaries are timezone-aware**, resolved from the rider's stored timezone with a UTC fallback, consistent with the quiet-hours convention.
- **Exhausted quota falls back to Safe routing with an explanatory upsell**, never a hard refusal. A rider who needs to avoid hills still gets a usable route.

### Modules

Four deep modules carry the rules, each pure and independently testable:

- **entitlement** — resolves a server snapshot, a cached snapshot and the current time into a tier, applying grace, trial and grandfathering, and exposes the per-feature predicates.
- **flatRouteMeter** — period keys, immutable consume, remaining, and the merge of local and server tallies for offline reconciliation.
- **premiumCatalog** — free limits, SKU identifiers and the grandfathering cutoff as data.
- **revenuecatWebhook** — a pure mapper from webhook event to desired subscription state, covering initial purchase, renewal, cancellation, expiration, billing issue, product change and refund.

Thin adapters wrap them: a single purchases module that is the only importer of the store SDK, guarded by a native-module presence check before require with the destructure inside the same try, because a community native module's invariant throw escapes a naive wrapper; a persisted entitlement cache; a user-scoped store slice cleared on account switch; and server modules for entitlement resolution, the signed webhook endpoint, and meter reconciliation.

Paywall surfaces are in-context at each limit, a permanent Profile row that also hosts restore and manage-subscription, and a post-ride prompt that claims through the existing prompt-arbitration slot so it can never stack with the review or analytics asks. All copy is localised in English, Romanian and Spanish, and respects the reduced-motion setting.

### Phasing

- **Phase 0 — invisible foundations.** Schema, core modules and their tests. No UI, no SDK, nothing rendered.
- **Phase 1 — server entitlement.** Resolution and the profile field, with the visibility flag defaulting off.
- **Phase 2 — billing wired dark.** Store SKUs configured, SDK integrated, paywall built but gated off. Real purchases tested via the internal testing track and license testers on Android, sandbox accounts on iOS.
- **Phase 3 — enforcement wired.** Gates in place while every account still resolves to free-with-grandfathering, so no behaviour changes.
- **Phase 4 — reveal.** Flag on for allowlisted accounts, then a widening percentage, gated on crash-free and ANR thresholds at each step, consistent with the existing staged-rollout discipline.
- **Phase 5 — caps activate** for accounts created after launch.

## Testing Decisions

A good test here asserts externally observable behaviour — given this subscription state and this clock, is this rider entitled; given this webhook payload, what state should the subscription end in — and never reaches into how the answer was computed. The deep modules were shaped specifically so this is possible without a store, a network or a device.

**Core entitlement and flatRouteMeter.** Grace-window boundaries, trial state, the grandfathering cutoff on either side, month rollover across timezones, immutable consumption, and merging local and server tallies after an offline stretch. Prior art: the existing review-eligibility suite, which tests exactly this class of pure gate logic against a fixed clock.

**RevenueCat webhook mapper.** Table-driven over every event type including refund and product change, plus duplicate-delivery idempotency. Prior art: the nudge eligibility and kill-switch suites on the server.

**Persist migration and account-switch reset.** Locks that entitlement state is user-scoped and cleared when accounts switch, that a cached entitlement survives a restart, and that the new slice migrates cleanly from the current persisted shape. Prior art: the existing store-migration suite that guards consent defaults the same way.

**Paywall UI.** Render tests for the paywall sheet, each limit-reached card, the Safe-fallback notice, and the locked and unlocked states of the Flat control, including the distinct unentitled versus country-unavailable messaging for cool routing.

## Out of Scope

- Any web or desktop purchase path; both stores' in-app billing only.
- Alternative billing or external payment links under the DMA.
- Family sharing, gifting, promo codes, referral rewards, student or regional discounts.
- Lifetime or one-off purchases.
- A team, club or business tier.
- Advertising in the free tier.
- Cool routing coverage beyond Romania; widening it is separate infrastructure work.
- Any change to what riders can currently do for free, beyond the caps explicitly named here.
- Server-side cost optimisation of the routing and risk infrastructure.
- Removing the permanent grandfathered class at any future date.

## Further Notes

**iOS sandbox testing without Mac hardware is the highest risk in this plan.** The build and submit pipeline already works from Windows, but StoreKit purchase testing has the least prior art in this project. Mitigation: validate Android end to end first, and treat the iOS purchase path as the item most likely to need extra time, with the option to ship the iOS paywall hidden if it is not confidently proven.

**Adding in-app purchases changes the Play Data Safety declaration** — purchase history becomes collected data. The project's hard rule is that the form is updated only after the matching production build is live, never before.

**Terms and Privacy Policy need a subscription section** covering auto-renewal, the trial, cancellation, refunds handled by the stores, and EU withdrawal rights. The existing withdrawal-waiver wording predates any subscription and should be reviewed alongside the outstanding counsel items rather than self-edited.

**Permanent grandfathering means two entitlement classes forever.** This is a deliberate trade of code simplicity for rider trust, and the tests should lock the grandfathered path so it cannot be optimised away later by accident.

**Cool routing is Romania-only at launch**, so it carries almost no weight for the other 30 supported countries. The paywall must not imply otherwise, and the value proposition outside Romania rests on the caps and history. Whether that is enough to justify EUR 3 outside Romania should be watched closely in the conversion data.

**Pre-launch verification:** confirm cool routing has genuinely not reached production riders before gating it. If it has already shipped, it becomes a takeaway and needs the same permanent exemption as flat routing.
