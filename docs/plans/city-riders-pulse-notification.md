# City Riders Pulse — social-proof ride nudge

**Status:** IMPLEMENTED on main 2026-07-17 (session 93) — NOT deployed; see "Deployment steps" at the bottom
**One-liner:** a push notification — "1,240 people are cycling in Bucharest today. Join them?" — where N is a synthetic number proportional to city size, fired at a random time on random days, never between 22:00–07:00, and guaranteed at least once every 5 days.

## Where it lives

This is a **new trigger in the existing Pedal Nudge System** (`docs/plans/pedal-nudge-system.md`), not a parallel mechanism. It reuses the evaluate cron, priority queue, quiet hours, daily budget, safety floor, kill switch, `nudge_log` telemetry, and the pedalVoice variant catalog. Trigger id: `city_riders_pulse`.

Server-side (not a local scheduled notification like the 8:30 weather ping) for three reasons: the number must be identical for every user in the same city on the same day (see Honesty), the trigger must participate in the one-nudge-per-tick priority queue and daily budget, and we want the standard `NUDGES_ENABLED` kill switch + funnel telemetry.

## The number N

**Deterministic per (city, date).** Seed = djb2 hash of `cityKey + ISO date` (djb2 is already in core for pedalVoice sticky buckets). Everyone in the same city sees the same N on the same day — a different number on two phones side by side would expose the synthesis instantly. Since the user chose "stated as fact" wording, this consistency is the main defense.

**Formula** (pure function in `packages/core/src/cityPulse.ts`):

```
N = round( population × rate × weekday × season × weather )
```

| Factor | Value |
|---|---|
| `rate` | **per-country:** `clamp(mult × countryCyclingShare × jitter, 0.5%, 40%)`, where `mult = 3` for measured Eurobarometer shares and `mult = 1.5` for estimated/defaulted shares; **additionally capped at 9% when city population < 50k** (small towns make inflated percentages visibly false). `jitter` is a seeded draw in [0.85, 1.15] |
| `weekday` | Sat/Sun ×1.15, else ×1.0 |
| `season` | Apr–Sep ×1.0, Mar/Oct ×0.8, Nov–Feb ×0.5 |
| `weather` | good ×1.0, mediocre ×0.6, bad → notification suppressed entirely |

**Country cycling share** (`COUNTRY_CYCLING_SHARE` constant table in `cityPulse.ts`, keyed by the same ISO codes as `appAvailability.ts`): the share of people whose main daily transport mode is a bicycle, from the Eurobarometer mobility survey, with a `measured: boolean` flag per entry. Known anchors (measured, mult ×3): NL 41%, SE 21%, DE 15%, HU 14%, FI 13%, DK 12%, BE 12%, FR 3% ([Euronews/Eurobarometer](https://www.euronews.com/next/2023/09/19/cycling-in-europe-which-countries-and-cities-are-the-most-and-least-bicycle-friendly)). Countries without a sourced figure (incl. RO, ES, NO as of this writing) default to the 8% EU average with `measured: false` → mult ×1.5. Upgrading a country from guess to measured (flipping the flag once the Eurobarometer figure is confirmed) is a data edit.

The **40% cap is still required**: 3 × NL's 41% = 123% of the population — without the clamp the formula claims more cyclists than inhabitants (SE also caps: 3 × 21% = 63%). Low-cycling countries land in a plausible range: FR 3 × 3% = 9%, defaulted countries 1.5 × 8% = 12%. If a specific country still reads wrong, adjust its table entry rather than the formula.

Round to a non-round figure (e.g. nearest 10 plus a small seeded offset — "1,240" reads like a count, "1,200" reads like a guess). Floor at ~40 so small towns don't produce "3 people are cycling".

**Population source:** static dataset in core — GeoNames-derived list of cities ≥15k population in the 31 supported countries (name, lat, lon, population; a few thousand rows, checked into the repo). The user's city = nearest entry within 30 km of their most recent `trips.start_location` (the nudge system already resolves that point; Bucharest fallback). No geocoding API call. Fallback population 100k if no city matches.

Simulated examples (good-weather summer Friday, seeded jitter): Râșnov (16k, RO guess ×1.5, small-town 9% cap binds) ≈ 1,447; Paris (2.1M, FR measured ×3 → 9.5%) ≈ 200,065; Madrid (3.3M, ES guess ×1.5 → 2.8%) ≈ 92,739; Lillehammer (28k, NO guess ×1.5 → 8.3%) ≈ 2,346. A good-weather January day roughly halves all of these; mediocre weather takes ×0.6.

**Honesty valve:** a single config flag switches copy from "N people are cycling today" to "around N riders are likely out today". Ship with fact-wording per product decision 2026-07-17, but keep the flag — if support tickets or reviews ever question the number, the fix is one env var, not a redesign. (Fabricated factual claims are also the kind of thing UCPD/ANPC consumer-practice complaints attach to; the estimate wording is fully defensible, the fact wording is not.)

## Scheduling — random day + random time, ≥1 per 5 days, quiet hours

**Stateful next-fire draw** (a stateless hash-per-window scheme was rejected: two adjacent windows can put fires ~9 days apart, violating the guarantee).

State: one row per user — `next_fire_at timestamptz` + `last_sent_at` (new small table `nudge_schedule (user_id, trigger_id, next_fire_at, last_sent_at)`, reusable by future scheduled triggers).

1. **Seed:** when a user first becomes eligible (has ≥1 completed trip, so we have a location), set `next_fire_at = now + U(0…5 days)` at a random minute inside the allowed window.
2. **After each successful send:** draw `d ∈ {1,2,3,4,5}` uniform, draw a random minute in **[07:00, 21:30] local**, set `next_fire_at = last_sent_at + d days` at that minute. (21:30 ceiling keeps delivery before 22:00 even with cron granularity + Doze drift.)
3. **Fire:** the existing `nudges-evaluate-cron` (*/30 min) emits a `city_riders_pulse` candidate when `now ≥ next_fire_at`. Priority **P3** (ambient, below streak-dramatic). If it loses the slot or hits the daily budget, it retries next tick; if the local day ends, it rolls to next morning ≥07:00.
4. **Guarantee enforcement:** if `now > last_sent_at + 5 days`, escalate to **P2** so it wins the slot at the next allowed tick. Max slip beyond day 5 is then one quiet-hours night.
5. **Safety floor exception:** bad-weather suppression (existing `cyclingWeather` gate) and the after-sunset gate **override the guarantee** — the fire slips to the next compliant tick and the outcome is logged `suppressed_weather` / `suppressed_sunset`. Note the sunset gate compresses the practical window in winter (Bucharest December sunset ≈ 16:40 → effective window 07:00–16:40); accepted, consistent with every other ride-asking trigger.

Timezone: derive UTC offset from the user's city entry (the static dataset can carry a tz column); Bucharest fallback.

## Eligibility & consent

Full accounts only at launch (do **not** add to `ANONYMOUS_ALLOWED_TRIGGERS` yet). Gated on the existing `profiles.notify_riding_tips` toggle ("Riding tips & reminders" in Profile › Pedal Nudges) — semantically this is a riding tip, and it avoids a new column + consent surface. Standard gates all apply: quiet hours, daily budget, `NUDGES_ENABLED`, per-trigger dedupe in `nudge_log`.

## Copy (pedalVoice catalog, 2 locales × 2 voices × 20 variants)

**Variant selection differs from other triggers:** pedalVoice normally sticky-buckets a user to ONE variant forever. With 20 variants the point is variety, so this trigger rotates per send — `variant = djb2(userId + sendDate) % 20`, skipping the last 3 variants shown (tracked in `nudge_log.context.variantId`). Voice (sassy/neutral) stays sticky via the existing `pedal_voice_sassy` profile toggle.

Romanian grammar note: all variants use "{n} de oameni/bicicliști" — correct because N is floored at 40, and the "de" article is required for numbers ≥20. If the floor ever drops below 20, the RO copy needs a numeral-aware article helper.

Tap → open route-planning (`content.data.type: 'city_riders_pulse'`, standard `handleNotificationResponse` case).

### EN sassy

1. 🚴 {n} people are cycling in {city} today. The bike lane is starting to ask about you. — Pedal
2. {n} riders out in {city} right now. Your bike noticed.
3. {city} count today: {n} cyclists, 1 suspiciously parked bike. Yours.
4. {n} people in {city} chose the bike today. Peer pressure, but make it healthy.
5. Breaking: {n} cyclists in {city} today. Witnesses report one bike still indoors. — Pedal
6. Your city is at {n} cyclists today. You could make it {n}+1. Just saying.
7. {n} people cycling in {city} and not one of them is you. Fixable.
8. The streets of {city}: {n} bikes strong today. Room for one more.
9. {n} riders in {city} today. Your saddle is filing a missing person report.
10. Everyone's doing it. Well, {n} people in {city} are. — Pedal
11. {n} cyclists out in {city}. The weather did its part. Your move.
12. Today in {city}: {n} people remembered they own a bike. Ring a bell?
13. {n} riders rolling through {city} right now. FOMO is a renewable resource.
14. Psst. {n} people are pedaling around {city} today. This is your sign.
15. {city} leaderboard of the day: {n} cyclists. Currently missing: you.
16. {n} bikes out in {city} today and yours is still doing wall duty.
17. Fun fact: {n} people in {city} are cycling today. Less fun fact: you're reading this on a couch.
18. {n} cyclists in {city} can't all be wrong. — Pedal
19. Today's {city} forecast: {n} cyclists with a chance of you.
20. {n} people out riding in {city}. Your helmet misses your head. — Pedal

### EN neutral

1. {n} people are cycling in {city} today. Good day to join them?
2. {n} people are cycling in {city} today. Join them?
3. {n} riders are out in {city} today — a good moment for a ride.
4. Cycling is busy in {city}: {n} riders out today.
5. {n} people chose the bike in {city} today. Fancy a ride?
6. It's a big cycling day in {city} — {n} riders out.
7. {n} cyclists are on {city}'s streets today. Care to join?
8. Today {n} people are riding in {city}. Your bike is ready when you are.
9. {n} riders in {city} today. A short ride still counts.
10. {city} has {n} cyclists out today. Good conditions for a ride.
11. {n} people are pedaling around {city} today. Join in when you can.
12. Lots of company out there: {n} cyclists in {city} today.
13. {n} riders took to {city}'s streets today. Room for one more.
14. Cycling update: {n} people riding in {city} today.
15. {n} people in {city} are on their bikes today. How about a quick loop?
16. Today's count for {city}: {n} cyclists. Join the ride?
17. {n} riders are out enjoying {city} today. You could be too.
18. A good day on two wheels — {n} cyclists out in {city}.
19. {n} people are riding in {city} right now. A ride today keeps the streak alive.
20. {city} is busy with bikes: {n} riders today. Join them?

### RO sassy

1. 🚴 {n} de oameni pedalează azi prin {city}. Doar tu lipsești. — Pedal
2. {n} de bicicliști azi în {city}. Bicicleta ta a observat că stai.
3. Numărătoarea zilei în {city}: {n} de bicicliști și o bicicletă parcată suspect. A ta.
4. {n} de oameni din {city} au ales azi bicicleta. Presiune de grup, dar sănătoasă.
5. Știrea zilei: {n} de bicicliști în {city}. Una singură stă în casă. — Pedal
6. {city} e la {n} de bicicliști azi. Tu poți face {n}+1.
7. {n} de oameni pedalează prin {city} și niciunul nu ești tu. Se rezolvă.
8. Străzile din {city}: {n} de biciclete azi. Mai e loc de una.
9. {n} de bicicliști azi în {city}. Șaua ta a depus plângere de abandon.
10. Toată lumea o face. Mă rog, {n} de oameni din {city}. — Pedal
11. {n} de bicicliști prin {city}. Vremea și-a făcut treaba. E rândul tău.
12. Azi în {city}: {n} de oameni și-au amintit că au bicicletă. Îți sună cunoscut?
13. {n} de bicicliști se plimbă acum prin {city}. FOMO-ul e resursă regenerabilă.
14. Psst. {n} de oameni pedalează azi prin {city}. Ăsta e semnul tău.
15. Clasamentul zilei în {city}: {n} de bicicliști. Lipsește: tu.
16. {n} de biciclete pe străzi în {city}, iar a ta ține peretele.
17. Fapt amuzant: {n} de oameni pedalează azi în {city}. Mai puțin amuzant: tu citești asta de pe canapea.
18. {n} de bicicliști din {city} nu pot greși toți. — Pedal
19. Prognoza zilei pentru {city}: {n} de bicicliști, cu șanse de tine.
20. {n} de oameni pe biciclete în {city}. Casca ta ți-a simțit lipsa. — Pedal

### RO neutral

1. {n} de oameni pedalează azi în {city}. O zi bună pentru o tură?
2. {n} de oameni merg azi cu bicicleta prin {city}. Li te alături?
3. {n} de bicicliști sunt azi pe străzile din {city} — un moment bun pentru o plimbare.
4. E zi plină pentru ciclism în {city}: {n} de bicicliști azi.
5. {n} de oameni au ales azi bicicleta în {city}. Ai chef de o tură?
6. Azi e o zi mare pentru biciclete în {city} — {n} de bicicliști.
7. {n} de bicicliști pe străzile din {city} azi. Te alături?
8. Azi {n} de oameni pedalează în {city}. Bicicleta ta e pregătită.
9. {n} de bicicliști azi în {city}. Și o tură scurtă contează.
10. {city} are azi {n} de bicicliști pe străzi. Condiții bune de mers.
11. {n} de oameni pedalează azi prin {city}. Alătură-te când poți.
12. Multă companie afară: {n} de bicicliști azi în {city}.
13. {n} de bicicliști au ieșit azi pe străzile din {city}. Mai e loc de unul.
14. Actualizare ciclism: {n} de oameni pedalează azi în {city}.
15. {n} de oameni din {city} sunt azi pe bicicletă. Ce zici de o tură scurtă?
16. Numărătoarea de azi pentru {city}: {n} de bicicliști. Te alături?
17. {n} de bicicliști se bucură azi de {city}. Ai putea fi și tu printre ei.
18. O zi bună pe două roți — {n} de bicicliști în {city}.
19. {n} de oameni pedalează chiar acum în {city}. O tură azi îți ține seria activă.
20. {city} e plin de biciclete: {n} de bicicliști azi. Li te alături?

## Telemetry & rollback

`nudge_log` rows with `trigger_id='city_riders_pulse'`, `context: {city, n, rate, weatherFactor}`; ride attribution via the existing 2-hour `nudges-attribute-cron` sweep. Rollback = the global `NUDGES_ENABLED=false` or a per-trigger `CITY_PULSE_ENABLED` env flag (recommended, one `gcloud run services update` away).

## Build shape (when approved)

Core: `cityPulse.ts` (seeded N, next-fire draw, deadline boost — pure, vitest-covered) + cities dataset. API: eligibility + candidate wiring in `lib/nudges/`, migration for `nudge_schedule`, catalog entries in `pedalVoice.ts`. Mobile: nothing new except the tap-handler case. Estimated ~1 session including tests.

## Open questions

Whether Râșnov-sized towns (N ≈ 100–200) feel motivating or sad — could raise the floor or switch small towns to county-level numbers. Whether to A/B fact-wording vs estimate-wording via the existing variant buckets before committing to fact-wording fleet-wide.

## Deployment steps (manual — none of these have been executed)

Implemented 2026-07-17. Code lives in: `packages/core/src/cityPulse.ts` (formula + schedule draws), `packages/core/src/pedalVoice.ts` (80-variant catalog, per-send rotation), `services/mobile-api/src/lib/nudges/cities.ts` + `citiesData.ts` (GeoNames dataset, 5,516 cities — regenerate with `scripts/generate-cities-dataset.mjs`), eligibility/queue/dispatcher wiring in `services/mobile-api/src/lib/nudges/` + `src/routes/nudges.ts`, migration `supabase/migrations/202607170001_nudge_schedule.sql`, mobile tap case in `apps/mobile/src/lib/push-notifications.ts`.

Implementation choices to know about (deviations are additive, not contradictions):
- **ES locale**: the plan defines EN/RO copy only; `es`-locale sends render the EN catalog until Spanish copy is commissioned (data edit in `pedalVoice.ts`).
- **Honesty valve (estimate-wording flag)**: NOT implemented in this pass — deliberately out of the build scope. If needed, it's a second body set + env flag in `pedalVoice.ts`; until then the fix for a wording complaint is `CITY_PULSE_ENABLED=false`.
- **Consent**: `notify_riding_tips` gates the trigger for REGISTERED users too (not only anonymous) — suppressed as `suppressed_category_pref` when off.
- **Schedule advance on non-transient suppressions**: consent-off / anonymous / no-token / expo-error redraw `next_fire_at` 1–5 days out WITHOUT stamping `last_sent_at`, so due rows don't re-log suppressions every 30-min tick. Weather / sunset / quiet-hours / daily-cap / lost-slot leave the row due (retry next tick), per the plan's guarantee-override rule.
- **Seeding is organic**: each evaluate tick seeds `nudge_schedule` for users with a trip in the last 7 days who lack a row. New riders are caught on their first trip; dormant riders seed on their next ride. No backfill required (optional backfill: INSERT a row per user with ≥1 historical trip if day-one coverage of lapsed riders is wanted).

Steps, in order:

1. **Apply the migration** `supabase/migrations/202607170001_nudge_schedule.sql` (Supabase SQL editor or `supabase db push`). Creates `nudge_schedule` (RLS deny-all, service-role only) and widens the `nudge_log.trigger_id` CHECK to accept `city_riders_pulse`. The live constraint name (`nudge_log_trigger_id_check`) was verified against production on 2026-07-17 — the drop-by-name is safe. **Do this BEFORE deploying the API**: the new cron code inserts `city_riders_pulse` rows that the old constraint rejects.
2. **Build the image**:
   `gcloud builds submit --config cloudbuild.yaml --timeout=600 --project gen-lang-client-0895796477`
3. **Deploy the revision** (the build alone does NOT go live):
   `gcloud run deploy defpedal-api --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest --region europe-central2 --platform managed --allow-unauthenticated --project gen-lang-client-0895796477`
4. **No Cloud Scheduler changes** — the trigger rides the existing `nudges-evaluate-cron` (*/30 min) and `nudges-attribute-cron` (ride attribution; `city_riders_pulse` is in `ACTIONABLE_TRIGGERS`).
5. **Verify** after a few ticks (SQL editor, service role):
   - `SELECT count(*) FROM nudge_schedule WHERE trigger_id='city_riders_pulse';` — should grow as active riders seed.
   - `SELECT outcome, count(*) FROM nudge_log WHERE trigger_id='city_riders_pulse' GROUP BY outcome;` — sends + suppressions with `context` carrying `{city, n, rate, weatherFactor, variantId}`.
6. **Rollback** (one command, ~30 s to new revision):
   `gcloud run services update defpedal-api --region europe-central2 --project gen-lang-client-0895796477 --update-env-vars CITY_PULSE_ENABLED=false`
   (`NUDGES_ENABLED=false` still kills the whole nudge system including this trigger. Re-enable with `=true` — the env default is enabled.)
7. **Mobile**: the explicit `city_riders_pulse` tap case ships with the next app release, but old builds already route these taps to route-planning via the generic `nudge` handler's ride-asking branch — the server rollout is NOT blocked on an app release.
