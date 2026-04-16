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

## After every code change

Run `npm run check:bundle` to verify the bundle builds before testing on phone.
