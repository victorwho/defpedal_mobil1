/**
 * `LOOP_SERVER_ENABLED` — whether the app should use `POST /v1/loops`.
 *
 * This is the rollout switch for moving loop generation off the handset. It is
 * delivered to the client through `GET /v1/profile`, which every session
 * already fetches at bootstrap, so flipping it takes effect on the riders' next
 * app open with no store release. That is the whole reason it lives here rather
 * than in the app's build config: the client path is the one that has been in
 * riders' hands for months, and a flag that needs a release to turn off is not
 * a rollback.
 *
 * Defaults to OFF, unlike every other kill switch in this codebase. Those guard
 * shipped features and fail open; this one guards an unvalidated path and has
 * to fail onto the code we already trust. Turning it on is the deliberate act:
 *
 *   gcloud run services update defpedal-api --region europe-central2 \
 *     --update-env-vars LOOP_SERVER_ENABLED=true \
 *     --project gen-lang-client-0895796477
 *
 * Read at call time rather than at module load, matching `nudges/killSwitch.ts`,
 * so it is testable and does not need a cold start to take effect.
 *
 * Note what it does NOT gate: the endpoint itself stays registered and
 * answerable whatever this says. A flag that also switched off the server would
 * make "turn it on" a two-step operation with a window in between where the
 * client asks and the server refuses.
 */
export const isLoopServerEnabled = (): boolean => {
  const raw = (process.env.LOOP_SERVER_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
};
