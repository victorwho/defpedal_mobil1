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

## After every code change

Run `npm run check:bundle` to verify the bundle builds before testing on phone.

## Before pushing to GitHub

The pre-push hook (`.git/hooks/pre-push`) runs both `npm run typecheck` AND `npm run lint:mobile:check` — mirrors CI. If the hook is missing (fresh clone, worktree), reinstall it. If lint fails, either fix the new violations or run `npm run lint:baseline` from `apps/mobile/` if the regression is intentional. Never bypass with `--no-verify` (Error #35).
