# Municipal bike-counter availability survey — 2026-09-14

Question: can City Heartbeat show a genuinely large *people cycling* number
sourced from municipal cycle counters, the way it already ingests civic hazard
feeds?

Short answer: **yes in France/Germany, no in Romania** — which is where
essentially all our riders are. That inverts the feature's value and is the
finding that should drive the design decision. Everything below was verified by
live request on 2026-09-14, not read off a description.

## Verified working

### Paris — opendata.paris.fr (Opendatasoft v2.1)

The strongest source found, and usable today.

```
https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/
  comptage-velo-donnees-compteurs/records
```

* No API key, no auth, no rate-limit hit in testing.
* Aggregation pushed server-side (`select=sum(sum_counts)`, `where=date>=now(days=-7)`),
  so one request returns the headline number — no bulk download, no local rollup.
* Hourly granularity, 13 rolling months, updated daily (J-1). Backed by
  Eco-Counter.

Measured live:

| Window | Cyclists counted | Counters |
|---|---|---|
| Last 24 h | **102,774** | — |
| Last 7 days | **1,929,105** | 108 |

1.93 million in a week is three orders of magnitude above anything in our own
database, and it is a real count of real people on bicycles.

### Cologne — Eco-Visio (Eco-Counter's platform)

Cologne publishes automatic counting-station data back to 2009. It is reachable
through Eco-Counter's public API rather than the city portal:

```
https://www.eco-visio.net/api/aladdin/1.0.0/pbl/publicwebpageplus/{idOrganisme}
https://www.eco-visio.net/api/aladdin/1.0.0/pbl/publicwebpage/data/{idPdc}
```

No API key for public endpoints. ⚠️ **Not yet proven end-to-end here**: the host
answers, but a guessed `idOrganisme` returned 404, so the organisation IDs have
to be harvested per city before this is real. Treat as "very likely" rather than
"verified". Spec: `github.com/bundesAPI/eco-visio-api`.

**This is the leverage point.** Eco-Visio is the shared backend for counters in
dozens of European cities, so ONE adapter plus a table of organisation IDs would
cover a large slice of the continent — the same shape as the `signalen` adapter,
where a second Dutch city is a registry row rather than new code.

## Verified absent

### Romania — nothing

`data.gov.ro` package search:

| Query | Results |
|---|---|
| `biciclete` | 1 — *Statiile Cluj Bike* |
| `ciclist` | 0 |
| `velo` | 0 |

The single hit is **bike-share dock locations**, not counts. Its live feed
(`data.e-primariaclujnapoca.ro/biciclete.json`, HTTP 200, 3.1 KB) returns
`{lat, lon, title}` per station and no usage figures whatsoever. Portal metadata
last modified 2020-11-27.

No cyclist counters found for Bucharest, Cluj or Brașov. Eco-Counter's public
world map surfaces no Romanian sites either.

## Why this matters more than it looks

Our riders are overwhelmingly Romanian — the live clusters are Brașov (185
shares), Bucharest (~95), Iași, Cluj, Constanța, Timișoara. A **per-city**
counter feature would therefore be dark for almost every rider we have, while
lighting up beautifully in two cities where we have nearly none. That is the
opposite of useful, and it is not obvious from the outside; it only shows up
once you check what Romania publishes.

## Options

**A. European aggregate.** One number, labelled as Europe rather than "near
you": *"1.9 million cyclists counted across Europe this week."* Works for every
rider regardless of city, is enormous and true, and Paris alone already carries
it. Cost: one adapter, one daily cron, one cached row. The honesty constraint is
the label — it must never imply local activity.

**B. Per-city, shown only where counters exist.** Truer to "your city", but
visible to ~0% of current riders and invisible in Romania indefinitely. Only
worth building if the rider base shifts west.

**Recommendation: A**, with the Eco-Visio adapter added afterwards to widen
coverage city by city. B can be layered on later — the same ingested rows
support it, since each counter carries a location.

## If built

* Cache server-side; never call the city API from the device. Paris answers in
  ~1 s and the number changes daily, so a daily cron into one row is ample.
* Store per-source rows (source id, city, window, count, fetched_at) so the
  aggregate is recomputable and a broken source is visible rather than silently
  dropping the total.
* Licence check per source before shipping — the same discipline as the hazard
  imports, where Amsterdam shipped on an explicit owner override and Zaragoza's
  licence is still unverified.
* The number is NOT our activity. It must never be summed with rides, shown in
  the community card, or phrased so a rider could read it as app usage.

## Shipped 2026-09-14

Built as Option A. Registry (`bike_counter_sources`) + readings
(`bike_counter_readings`) + `get_bike_counter_totals`, migrations
`202609140008/09`, adapters in `services/mobile-api/src/lib/bikeCounters.ts`,
cron endpoint `POST /v1/bike-counters/run`, surfaced as the CYCLING IN EUROPE
card.

Scheduler: **`bike-counters-cron`**, `0 7 * * *` Europe/Bucharest. Verified by
forcing a run and confirming a reading landed one second after the job fired —
the job existing is not evidence it works.

Two things confirmed against live data rather than reasoned about:

* Repeat runs do not double-count. With two stored readings the aggregate
  returns 1,929,105 where a naive `sum()` returns 3,858,210; the helper takes
  `distinct on (source_id)` ordered by `fetched_at desc`.
* A zero reading is rejected at the adapter rather than stored, so a broken
  query shape cannot quietly halve the headline.

Next, to widen: harvest Eco-Visio `idOrganisme` values per city, starting with
Köln (already seeded, disabled, licence marked UNVERIFIED). Re-read error-log
#98 first — "it speaks the same protocol" has broken three ways before.
