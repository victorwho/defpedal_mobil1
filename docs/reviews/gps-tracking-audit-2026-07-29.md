# GPS Trip-Tracking Follow-Up Audit — is the GPS-track error still happening?

Generated: 2026-07-29
Scope: verify whether the trip-tracking losses from `gps-tracking-audit-2026-07-15.md` still occur, against current code (main), the fielded fleet, and production data (Supabase 2026-06-01 → 2026-07-29, PostHog last 14–21 d).
Method: code verification of the July-15 fixes + direct production SQL/HogQL decomposition + per-user case reconstruction of every true-loss ride.

## Verdict

**The July-15 GPS-track error is fixed and fielded — but the headline metric still looks broken, and one small real loss path remains.**

- All five July-15 code fixes are on `main` AND on the dominant fleet version: **v0.2.119 carries 233 of ~320 active users (73%)** in the last 14 days. The old dominant cause (resume-prompt Discard destroying recorded trails) is effectively gone: only 4 `resume_guard_outcome: discard` events in 21 days vs 13 auto-resumes; `app_killed` recovery tracks are being written again (2 in week 07-20, 0 all July before the fix).
- Weekly "ended trips with a GPS track" is still low (**27%** in week 07-20), which is why it *appears* trips are not tracked. Decomposition shows that number is now dominated by **deliberate discards and one-ride churn**, not code bugs.
- **Real rides are mostly tracked**: of ended trips lasting 10 min–6 h with no explicit discard reason, **18/26 (69%)** have tracks; the 8 misses are consistent with discards (in-ride or resume-prompt on the residual old-version tail).
- **True losses in 14 days: 3 rides** (impact recorded → rider completed feedback → but neither `trip_end` nor `trip_track` ever arrived). All three share one signature, detailed below.

## Production data (last 14 days, by trip start date)

| Bucket | Count | Interpretation |
|---|---|---|
| Ended, tracked | 45 | healthy |
| Ended, no track, explicit `early_end_reason` | 26 | in-ride Discard — by design |
| Ended, no track, no reason, **< 10 min (median 1 min)** | 84 (73 distinct users, ~1 each) | trial rides discarded with the reason modal skipped — by design, but **indistinguishable from loss in the DB** |
| Ended, no track, no reason, 10 min–24 h+ | 21 | mixed: resume-prompt discards (4 observed in telemetry) + residual old-fleet zombies (13 in the 6 h+ range) |
| Stranded (`ended_at IS NULL`) > 48 h | 53 | **52/53 from users who never started another ride** — churned mid-ride or at ride end; their queued `trip_end` sits on the device forever |
| Impact recorded but NO track (true-loss signature) | **3** | see finding P1-A |

Weekly coverage trend (ended vs tracked): 06-22 30% → 06-29 27% → 07-06 31% → 07-13 14% → 07-20 27% → 07-27 33% (partial week). The floor is churn + discards, not regression.

## Findings

### P1-A — Ride end has a ~15 s sync race; churning users lose fully-recorded rides (3 confirmed in 14 d)
The three true losses all match one reconstruction (case study: user `4cf8184a…`, 2026-07-24, v0.2.119, verified in PostHog): rider finishes a real 40–60 min ride → `trip_end` + `trip_track` are enqueued → the feedback screen's **live** `POST /v1/rides/:tripId/impact` succeeds (device online, `trip_start` resolved) → the rider swipes the app away before the queue's next tick → **never opens the app again** (confirmed: zero events after 07-24).
`OfflineMutationSyncManager.tsx:363-380` drains on mount, on offline→online transition, and on a **15-second interval — nothing drains on enqueue**. Ride end is precisely the moment users background/kill the app, and the impact POST proves the network was up at that moment.
**Fix direction:** trigger an immediate `flushQueue()` whenever a trip-critical mutation (`trip_start`/`trip_end`/`trip_track`) is enqueued (debounced, e.g. 250 ms, so end-of-ride's 2–3 enqueues coalesce). This also converts a large share of the 53 stranded churn trips into delivered rides, since many of those devices were online at the moment of the last enqueue.

### P1-B — One-ride churn strands trip data by design (52 trips / 14 d)
52 stranded trips >48 h old, one per user, users never seen again — the trial population (registration wall + activation push is growing exactly this cohort). Server-side there is nothing to repair (the data never left the phone), but P1-A's immediate drain is the single highest-leverage mitigation. Optionally: drain once from a headless background task shortly after ride end (expo-task-manager already runs during navigation).

### P2-A — `end_action` discriminator still missing (July-15 rec #7 — not implemented)
There is still no explicit `saved / discarded / prompt_discarded / recovered` marker on `trip_end` (`git grep end_action` → nothing). This is why 84 quick discards, 26 reasoned discards, and 3 real losses all look identical as "ended, no track" — and why "trips are not being tracked" keeps re-surfacing as a scare. One nullable column + one client field ends the ambiguity permanently. The companion server-side stale-`in_progress` reaper (mark, don't delete) is also still unbuilt; 53 zombie rows accumulated in 14 days.

### P2-B — Telemetry doesn't survive the final app-kill, and 2 of 3 loss-case users are invisible in PostHog
In the 07-24 case the device's last ~30 min of events (including the diagnostic `trip_end_queued`) never reached PostHog — the batch died with the process. The other two loss-case users have **zero** PostHog events under their user id at all. When investigating ride loss, treat PostHog absence as non-evidence; the DB is ground truth. Consider an explicit telemetry flush at ride end (same moment as the P1-A queue flush).

### P3 — Residual old-fleet tail
~20 users still run pre-fix versions (v0.2.101 and older); their interrupted rides still lose data the old way until they update. One stranded trip from a returning user (started 07-21) is the only candidate for a still-unexplained queue miss in 14 days — consistent with this tail, not worth chasing individually.

## What was verified working (refuting "tracking is broken")

- **All July-15 fixes present in code and fielded**: unconditional `trip_start` enqueue (`route-preview.tsx:446-454`), `rideDataDisposition` preserve/dead on user transitions (`appStore.ts:1334+`), three-way resume prompt with Save-ride (`NavigationResumeGuard.tsx`), 12k-point client geometry bound (`navigation.tsx:482`), server 8 MiB + downsample on `/trips/track` (deployed 07-15, Cloud Run `00111-q55`).
- **Resume guard behaves in the field**: 13 auto-resume / 1 save / 4 discard in 21 d; `app_killed` recovery tracks reappeared.
- **Queue mechanics healthy for returning users**: 52/53 stranded trips are never-returned users; only 5 `offline_sync_failed` + 1 `offline_sync_dead` fleet-wide in 14 d.
- **Completed-ride path**: `navigation_completed` rides and saved manual stops land tracks at the same high rate as in the July-15 audit.
- **`trip_end_queued` ≈ `navigation_started`** daily in telemetry (68 vs 76 over 14 d) — the enqueue side fires reliably.

## Recommended actions (priority order)

1. **P1** Immediate queue drain on trip-critical enqueue (debounced) in `OfflineMutationSyncManager` — closes the ride-end race; largest lever on both true losses and stranded churn rides.
2. **P2** Add `end_action` to `trip_end` + a stale-`in_progress` reaper (mark `abandoned`, don't delete) — makes loss measurable and stops this recurring investigation.
3. **P2** Flush telemetry at ride end alongside the queue drain.
4. **P3** Nothing further on the old-fleet tail — it retires itself as v0.2.120/121 roll out.
