/**
 * Counts one app open per process launch — not per component mount.
 *
 * The root `OnboardingGuard` re-mounts when signup swaps the anonymous session
 * for the real account, so a "once per mount" counter counted signing up as an
 * extra app open: a first launch + one return + signup reached the Loop
 * intro's third-open threshold the moment the rider signed up (seen on
 * preview 0.2.196). Module state lives as long as the JS process, which is
 * exactly one launch. Returns from the background are counted separately, by
 * the guard's AppState listener.
 */
let launchCounted = false;

export const countLaunchOnce = (increment: () => void): void => {
  if (launchCounted) return;
  launchCounted = true;
  increment();
};

/** Test seam. */
export const resetLaunchCountForTest = (): void => {
  launchCounted = false;
};
