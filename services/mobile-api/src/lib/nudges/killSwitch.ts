/**
 * Pedal Nudge — kill switch.
 *
 * Env var `NUDGES_ENABLED` set to "false" (case-insensitive) disables the
 * entire system: cron `/evaluate` becomes a no-op, `/event` becomes a
 * no-op, and the fire-and-forget P0 helpers return immediately.
 *
 * Default behaviour when the var is unset = enabled. This matches the
 * principle of "ship with the feature on" — flipping the switch to off
 * is the explicit ops action when something's wrong.
 *
 * One-line audit log every time something is suppressed by the switch so
 * the Cloud Run dashboard surfaces the state during incidents.
 */

export const areNudgesEnabled = (): boolean => {
  const raw = (process.env.NUDGES_ENABLED ?? '').trim().toLowerCase();
  // Treat only explicit "false" / "0" / "off" as disabled. Everything else
  // (unset, "true", typos) leaves the system live.
  return !(raw === 'false' || raw === '0' || raw === 'off');
};

/**
 * Anonymous-push kill switch (`ANON_PUSH_ENABLED`, 2026-07-16).
 *
 * Gates every server push to ANONYMOUS users (nudge eligibility + the
 * firstride cron). Unlike NUDGES_ENABLED this defaults to OFF — anonymous
 * push is a consent-sensitive rollout, so it must be enabled explicitly:
 *   gcloud run services update defpedal-api --region europe-central2 \
 *     --update-env-vars ANON_PUSH_ENABLED=true
 * Rollback is the same command with =false.
 */
export const isAnonPushEnabled = (): boolean => {
  const raw = (process.env.ANON_PUSH_ENABLED ?? '').trim().toLowerCase();
  // Only explicit "true" / "1" / "on" enables. Everything else (unset,
  // "false", typos) keeps anonymous push OFF — fail closed.
  return raw === 'true' || raw === '1' || raw === 'on';
};
