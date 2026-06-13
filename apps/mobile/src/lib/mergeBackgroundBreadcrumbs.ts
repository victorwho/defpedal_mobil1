/**
 * Merge background-recorded location samples into the active trip's breadcrumb
 * trail (review 2026-06-12 P1).
 *
 * The foreground watcher (`useForegroundNavigationLocation`) is paused by the
 * OS while the screen is locked / the app is backgrounded — only the
 * `expo-task-manager` background task records during that window, persisting
 * samples to AsyncStorage. Those samples were NEVER read back into the trip:
 * `navigation.tsx` declared `useBackgroundNavigationSnapshot()` and never used
 * it, so every screen-off stretch was dropped from the trail, under-counting
 * distance / CO2 / XP for any ride that spent time locked.
 *
 * This helper drains the persisted background trail into the store's
 * breadcrumb buffer via `appendGpsBreadcrumb`, which keeps all the existing
 * safety guards (pre-session-start rejection, implausible-jump / teleport
 * filtering, 2000-crumb ring buffer). It's idempotent — only samples newer
 * than the last breadcrumb are appended, so repeated calls are cheap no-ops.
 *
 * Call sites:
 *   - NavigationLifecycleManager: on every app foreground transition while
 *     navigating (covers the dominant screen-off → screen-on case).
 *   - NavigationResumeGuard: before building a kill-recovered trip_track.
 */
import { getPersistedNavigationLocationHistory } from './backgroundNavigation';
import { useAppStore } from '../store/appStore';

/**
 * Append any background samples newer than the current trail tail into the
 * active navigation session. Returns the number of samples merged (0 when
 * there's no active session or nothing fresh to merge).
 */
export const mergeBackgroundBreadcrumbsIntoSession = async (): Promise<number> => {
  const session = useAppStore.getState().navigationSession;
  if (!session) return 0;

  const history = await getPersistedNavigationLocationHistory();
  if (history.length === 0) return 0;

  const crumbs = session.gpsBreadcrumbs;
  const lastTs = crumbs.length > 0 ? crumbs[crumbs.length - 1].ts : 0;

  // Only samples strictly newer than the last breadcrumb, in time order.
  const fresh = history
    .filter((sample) => sample.timestamp > lastTs)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (fresh.length === 0) return 0;

  // appendGpsBreadcrumb re-reads the live store each call and applies the
  // teleport / pre-start guards, so feeding samples in ascending order is safe.
  const append = useAppStore.getState().appendGpsBreadcrumb;
  let merged = 0;
  for (const sample of fresh) {
    append(sample);
    merged += 1;
  }
  return merged;
};
