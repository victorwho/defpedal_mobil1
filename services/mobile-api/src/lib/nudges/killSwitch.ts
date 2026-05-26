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
