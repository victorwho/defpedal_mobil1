/**
 * `LOOP_GENERATION_SERVER` — which loop generator this build should use.
 *
 * Two inputs, and the order matters.
 *
 *   1. A build-time override, `EXPO_PUBLIC_LOOP_GENERATION_SERVER`, so a dev or
 *      preview build can exercise the server path before anything is rolled
 *      out. It is honoured ONLY on non-production builds, checking both the
 *      variant and the env — the same double gate `coolMode.ts` and the
 *      diagnostics tools use, so a production APK with a mis-set env var and a
 *      preview binary pointed at production both land on the safe side.
 *
 *   2. Otherwise the server's own answer, `loopServerEnabled` from
 *      `/v1/profile`, which is what makes this a rollout switch rather than a
 *      release: it can be turned on and off from Cloud Run and takes effect on
 *      the rider's next app open.
 *
 * It fails CLOSED. An unset flag, an older server, a failed profile read and a
 * fresh install all mean "use the client generator", because that is the path
 * riders have been running for months. Every other switch in this codebase
 * fails open, and it is worth being clear why this one does not: those guard
 * shipped behaviour, where darkening the feature is the regression. This guards
 * the new path, where serving it by accident is.
 *
 * When the rollout finishes, this module and the client generator go together.
 */
import { mobileEnv } from './env';

/** True only on a build where the override is allowed to be read at all. */
const overrideAllowed = (): boolean =>
  mobileEnv.appVariant !== 'production' && mobileEnv.appEnv !== 'production';

const OVERRIDE_ON = new Set(['1', 'true', 'yes', 'on']);
const OVERRIDE_OFF = new Set(['0', 'false', 'no', 'off']);

/**
 * Resolve the flag.
 *
 * `serverEnabled` is passed in rather than read from the store so this stays a
 * pure function — the screen reads the store and hands the value over, which
 * keeps the decision testable without standing up Zustand.
 */
export const isLoopServerEnabled = (serverEnabled: boolean): boolean => {
  if (overrideAllowed()) {
    const raw = (
      process.env.EXPO_PUBLIC_LOOP_GENERATION_SERVER ?? ''
    )
      .trim()
      .toLowerCase();
    // An explicit override wins in BOTH directions, so a dev chasing a
    // difference between the two paths can pin either one.
    if (OVERRIDE_ON.has(raw)) return true;
    if (OVERRIDE_OFF.has(raw)) return false;
  }
  return serverEnabled === true;
};
