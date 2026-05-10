# Error Prevention Rule

Before making any code changes, consult `.claude/error-log.md` for known pitfalls.

## Pre-change checklist

1. **Adding imports?** Verify the symbol exists in the target module and is exported (Error #1)
2. **Using native modules?** Use lazy `require()` not top-level `import *` (Error #2)
3. **Installing APK?** Debug vs release — check with dev menu test after install (Error #3)
4. **Building native?** Use short path `C:\dev\defpedal` or `C:\dpb` (Error #4)
5. **Adding store fields?** Clear app data after schema changes (Error #7)
6. **Adding Mapbox layers?** Use filter-based hiding, not conditional mount/unmount (Error #12)
7. **Using emoji in Mapbox?** Plain text only on Android (Error #13)
8. **Fetching POI data?** Prefer Mapbox vector tiles over Overpass API (Error #14)
9. **Using SafeAreaView?** Import from `react-native-safe-area-context`, not `react-native` (Error #15)
10. **Phone blank?** Check USB + port forwarding + Metro status first (Error #16, #17)
11. **Changed icons/manifest/res?** Build script syncs `android/app/src/` automatically, but verify with a preview build — dev and release use different source dirs (Error #20)
12. **Detecting Expo native modules?** Use `requireOptionalNativeModule()` from `expo-modules-core`, NOT `NativeModules` from React Native (Error #21)
13. **Installing Expo native packages?** Must be in `apps/mobile/package.json`, not just root — autolinking only reads the workspace (Error #22)
14. **Using community native modules (non-Expo)?** Check `NativeModules.<BridgeName>` BEFORE `require()` — the module's invariant throw can escape try/catch (Error #23)
15. **Adding `// eslint-disable-next-line some-rule`?** Confirm the rule is actually registered first by running `npx eslint <the-file>`. This repo does NOT ship `eslint-plugin-react-hooks`, so disables for `react-hooks/exhaustive-deps` and `react-hooks/rules-of-hooks` will themselves error and fail CI's lint-ratchet (Error #35)
16. **Adding a new Postgres SELECT?** Don't trust columns named in nearby/legacy code — verify they actually exist in the live schema with `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='X'` before depending on them. Especially "denormalized aggregate" columns on `profiles` (`total_rides`, `last_ride_at`, `streak_count`) — these are convenience fields maintained by triggers/cron and may have been removed without dropping the column, or planned but never added (Error #39)
17. **Local CI parity?** Pre-push hook only runs typecheck + lint, NOT `npm audit`. CI's Security audit step will fail on every push if a new high-severity advisory lands. Run `npm audit --audit-level=high` locally before relying on CI to catch dep regressions, and fix with `npm audit fix` for non-breaking advisories

## After every code change

Run `npm run check:bundle` to verify the bundle builds before testing on phone.

## Before pushing to GitHub

The pre-push hook (`.git/hooks/pre-push`) runs both `npm run typecheck` AND `npm run lint:mobile:check` — mirrors CI. The hook source of truth is `scripts/git-hooks/pre-push`; install on a fresh clone or worktree with `bash scripts/install-git-hooks.sh` (idempotent). If lint fails, either fix the new violations or run `npm run lint:baseline` from `apps/mobile/` if the regression is intentional. Never bypass with `--no-verify` (Error #35).
