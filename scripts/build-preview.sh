#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# build-preview.sh — Build a preview APK (or AAB) from C:\dpb
#
# Handles: source sync, cache cleaning, bundle embedding,
#          bundle verification, and APK installation.
#
# Usage:
#   bash scripts/build-preview.sh                     # preview APK (default)
#   bash scripts/build-preview.sh install             # preview + install via ADB
#   bash scripts/build-preview.sh dev                 # development APK
#   bash scripts/build-preview.sh dev install         # development + install
#   bash scripts/build-preview.sh prod                # production APK
#   bash scripts/build-preview.sh prod bundle         # production AAB (Play Store)
#   bash scripts/build-preview.sh prod bundle apk     # production AAB + APK
# ──────────────────────────────────────────────────────────

set -euo pipefail

SRC="${SRC:-C:/dev/defpedal}"
DST="${DST:-C:/dpb}"
ADB_DEVICE="R5CX61E737J"

# ── Parse arguments ──
FLAVOR="preview"
DO_INSTALL=false
DO_BUNDLE=false
DO_APK=true
EXPLICIT_ARTIFACT=false
for arg in "$@"; do
  case "$arg" in
    dev|development) FLAVOR="development" ;;
    prod|production) FLAVOR="production" ;;
    preview)         FLAVOR="preview" ;;
    install)         DO_INSTALL=true ;;
    bundle)          DO_BUNDLE=true; DO_APK=false; EXPLICIT_ARTIFACT=true ;;
    apk)             DO_APK=true; DO_BUNDLE=false; EXPLICIT_ARTIFACT=true ;;
  esac
done

# Compliance guard: production builds default to AAB (Play Store accepts AAB only
# for new apps). Caller can still opt back to APK via explicit `apk` arg, or both
# via `bundle apk`.
if [ "$FLAVOR" = "production" ] && [ "$EXPLICIT_ARTIFACT" = false ]; then
  echo "── production flavor: defaulting to AAB (Play Store) ──"
  DO_BUNDLE=true
  DO_APK=false
fi

# Capitalize first letter for Gradle task name
FLAVOR_CAP="$(echo "${FLAVOR:0:1}" | tr '[:lower:]' '[:upper:]')${FLAVOR:1}"
GRADLE_TASKS=()
if [ "$DO_APK" = true ]; then
  GRADLE_TASKS+=("assemble${FLAVOR_CAP}Release")
fi
if [ "$DO_BUNDLE" = true ]; then
  GRADLE_TASKS+=("bundle${FLAVOR_CAP}Release")
fi
APK_DIR="$DST/apps/mobile/android/app/build/outputs/apk/${FLAVOR}/release"
APK_PATH="$APK_DIR/app-${FLAVOR}-release.apk"
AAB_DIR="$DST/apps/mobile/android/app/build/outputs/bundle/${FLAVOR}Release"
AAB_PATH="$AAB_DIR/app-${FLAVOR}-release.aab"

# Marker string to verify bundle freshness — pick something unique to the current code
VERIFY_STRING="XP earned"

echo "── Build: $FLAVOR flavor ──"
echo ""

echo "── Step 1: Sync source files ──"
# Sync all directories that contribute to the JS bundle.
# robocopy exit code 1 = files copied (success), 0 = nothing to copy.
robocopy "$SRC/apps/mobile/app"       "$DST/apps/mobile/app"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/src"       "$DST/apps/mobile/src"       //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/apps/mobile/assets"    "$DST/apps/mobile/assets"    //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/packages/core/src"     "$DST/packages/core/src"     //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
robocopy "$SRC/services/mobile-api/src" "$DST/services/mobile-api/src" //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true

# Sync config files that affect bundling and native build
for f in app.config.ts metro.config.js tsconfig.json package.json; do
  cp -f "$SRC/apps/mobile/$f" "$DST/apps/mobile/$f" 2>/dev/null || true
done
cp -f "$SRC/package.json" "$DST/package.json" 2>/dev/null || true
cp -pf "$SRC/package-lock.json" "$DST/package-lock.json" 2>/dev/null || true

# Sync workspace package.json files (in case new deps were added)
cp -f "$SRC/apps/mobile/package.json" "$DST/apps/mobile/package.json" 2>/dev/null || true
cp -f "$SRC/packages/core/package.json" "$DST/packages/core/package.json" 2>/dev/null || true
cp -f "$SRC/services/mobile-api/package.json" "$DST/services/mobile-api/package.json" 2>/dev/null || true

# Ensure node_modules on DST match the synced package-lock.json.
#
# Previous approach hard-coded a sentinel module list and missed any new
# dependency not on the list (e.g. expo-clipboard added for route-share
# slice 8b broke the 2026-04-20 build). Now we compare the lockfile mtime
# against the marker npm writes inside node_modules on every install —
# any change to dependencies, regardless of which workspace added them,
# triggers a reinstall.
if [ "${SKIP_NPM_INSTALL:-0}" != "1" ]; then
  NEEDS_INSTALL=false
  if [ ! -f "$DST/node_modules/.package-lock.json" ]; then
    NEEDS_INSTALL=true
    REASON="node_modules missing or never installed"
  elif [ "$DST/package-lock.json" -nt "$DST/node_modules/.package-lock.json" ]; then
    NEEDS_INSTALL=true
    REASON="package-lock.json newer than last install"
  fi

  if [ "$NEEDS_INSTALL" = "true" ]; then
    echo "── Step 1a: Install npm deps on DST ($REASON) ──"
    ( cd "$DST" && npm install --no-audit --no-fund )
  else
    echo "── Step 1a: DST node_modules up to date with lockfile (skipping npm install) ──"
  fi
fi

# Sync the entire Android source + config tree (icons, manifest, gradle, etc.)
# This prevents dev/release icon and config drift — no more cherry-picking files.
# Excludes build/ output to avoid syncing gigabytes of cached artifacts.
robocopy "$SRC/apps/mobile/android/app/src" "$DST/apps/mobile/android/app/src" //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true
for f in build.gradle google-services.json; do
  cp -f "$SRC/apps/mobile/android/app/$f" "$DST/apps/mobile/android/app/$f" 2>/dev/null || true
done
for f in build.gradle settings.gradle gradle.properties; do
  cp -f "$SRC/apps/mobile/android/$f" "$DST/apps/mobile/android/$f" 2>/dev/null || true
done

# Sync the Expo config plugins directory. `app.config.ts` references plugins by
# relative path (./plugins/...), and a missing or stale plugin file breaks the
# `:expo-constants:createExpoConfig` Gradle task with an opaque PLUGIN_NOT_FOUND.
# //MIR mirrors deletes too — so a plugin removed in SRC (e.g. the legacy
# withAndroidCleartextTraffic.js) gets pruned from DST.
robocopy "$SRC/apps/mobile/plugins" "$DST/apps/mobile/plugins" //MIR //NFL //NDL //NJH //NJS //nc //ns //np || true

echo "── Step 1b: Set APP_VARIANT in .env ──"
# The JS bundle reads APP_VARIANT to determine the scheme, package name,
# and API URLs. Must match the Gradle flavor being built.
if grep -q '^APP_VARIANT=' "$DST/apps/mobile/.env" 2>/dev/null; then
  sed -i "s/^APP_VARIANT=.*/APP_VARIANT=$FLAVOR/" "$DST/apps/mobile/.env"
else
  echo "APP_VARIANT=$FLAVOR" >> "$DST/apps/mobile/.env"
fi
echo "  APP_VARIANT=$FLAVOR"

echo "── Step 1c: Ensure deep link scheme in AndroidManifest ──"
# Each flavor needs its scheme in the manifest for OAuth deep links.
# The manifest is prebuilt with the dev scheme only. Patch it here
# instead of running expo prebuild (which breaks source files).
MANIFEST="$DST/apps/mobile/android/app/src/main/AndroidManifest.xml"
SCHEME_MAP_dev="defensivepedal-dev"
SCHEME_MAP_preview="defensivepedal-preview"
SCHEME_MAP_production="defensivepedal"
eval "TARGET_SCHEME=\$SCHEME_MAP_${FLAVOR}"
if [ -n "$TARGET_SCHEME" ] && ! grep -q "android:scheme=\"$TARGET_SCHEME\"" "$MANIFEST" 2>/dev/null; then
  # Add the scheme after the existing dev scheme line
  sed -i "s|<data android:scheme=\"defensivepedal-dev\"/>|<data android:scheme=\"defensivepedal-dev\"/>\n        <data android:scheme=\"$TARGET_SCHEME\"/>|" "$MANIFEST"
  echo "  Added scheme: $TARGET_SCHEME"
else
  echo "  Scheme $TARGET_SCHEME already present"
fi

echo "── Step 1d: Ensure route-share universal link intent filter ──"
# Slice 0 of the route-share PRD: the app must advertise itself as the
# handler for https://routes.defensivepedal.com/r/*. Expo's intentFilters
# in app.config.ts only land in the manifest via `expo prebuild`, which
# we explicitly avoid on C:\dpb (error-log #27 — it overwrites source).
# So inject the filter here, idempotently, after the robocopy sync.
if ! grep -q 'android:host="routes.defensivepedal.com"' "$MANIFEST" 2>/dev/null; then
  # Insert a new <intent-filter> block just before </activity> of MainActivity.
  # autoVerify="true" + https + host + pathPrefix triggers Android App Links
  # verification against /.well-known/assetlinks.json on the host.
  sed -i 's|    </activity>|      <intent-filter android:autoVerify="true">\n        <action android:name="android.intent.action.VIEW"/>\n        <category android:name="android.intent.category.DEFAULT"/>\n        <category android:name="android.intent.category.BROWSABLE"/>\n        <data android:scheme="https" android:host="routes.defensivepedal.com" android:pathPrefix="/r/"/>\n      </intent-filter>\n    </activity>|' "$MANIFEST"
  echo "  Added route-share intent filter (https://routes.defensivepedal.com/r/*)"
else
  echo "  Route-share intent filter already present"
fi

echo "── Step 1e: Strip SYSTEM_ALERT_WINDOW (Play Store P0) ──"
# Some debugging libraries inject SYSTEM_ALERT_WINDOW transitively. Play Store
# rejects apps drawing over other apps without an approved declaration, and a
# navigation app has no use for it. Force the manifest to mark the permission
# as removed (`tools:node="remove"`) regardless of upstream source state. This
# parallels the AD_ID stripping (line 15 of the manifest in source).
if grep -q 'android:name="android.permission.SYSTEM_ALERT_WINDOW"' "$MANIFEST" 2>/dev/null; then
  if ! grep -q 'android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"' "$MANIFEST" 2>/dev/null; then
    sed -i 's|<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>|<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>|' "$MANIFEST"
    echo "  Stripped SYSTEM_ALERT_WINDOW (added tools:node=\"remove\")"
  else
    echo "  SYSTEM_ALERT_WINDOW already stripped"
  fi
else
  echo "  SYSTEM_ALERT_WINDOW not present (no action needed)"
fi

echo "── Step 2: Clean Gradle bundle cache ──"
# Forces Gradle to re-run the Metro bundle task instead of reusing stale output.
rm -rf "$DST/apps/mobile/android/app/build/generated/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/merged_res/"
rm -rf "$DST/apps/mobile/android/app/build/outputs/"

echo "── Step 3: Build $FLAVOR release (${GRADLE_TASKS[*]}) ──"
cd "$DST/apps/mobile/android"
./gradlew "${GRADLE_TASKS[@]}"

# ── Step 4: Verify output artifacts ──
if [ "$DO_APK" = true ] && [ ! -f "$APK_PATH" ]; then
  # Fall back to old non-flavored path (before product flavors were added)
  APK_PATH_FALLBACK="$DST/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
  if [ -f "$APK_PATH_FALLBACK" ]; then
    APK_PATH="$APK_PATH_FALLBACK"
  else
    echo "ERROR: APK not found at $APK_PATH"
    echo "  Available APKs:"
    find "$DST/apps/mobile/android/app/build/outputs/apk/" -name "*.apk" 2>/dev/null || echo "  (none)"
    exit 1
  fi
fi
if [ "$DO_BUNDLE" = true ] && [ ! -f "$AAB_PATH" ]; then
  echo "ERROR: AAB not found at $AAB_PATH"
  echo "  Available AABs:"
  find "$DST/apps/mobile/android/app/build/outputs/bundle/" -name "*.aab" 2>/dev/null || echo "  (none)"
  exit 1
fi

# Compliance audit — only for preview/production release artefacts.
# Scans the AAB/APK for dev-only artefacts (devAuthBypass, dev-bypass token,
# debuggable=true, EX_DEV_CLIENT_NETWORK_INSPECTOR=true). Fails the build on leak.
if [ "$FLAVOR" != "development" ]; then
  echo ""
  echo "── Step 4b: Audit release artefact for dev-only leaks ──"
  AUDIT_SCRIPT="$SRC/scripts/audit-release-artifacts.sh"
  if [ -f "$AUDIT_SCRIPT" ]; then
    if [ "$DO_BUNDLE" = true ] && [ -f "$AAB_PATH" ]; then
      bash "$AUDIT_SCRIPT" "$AAB_PATH"
    fi
    if [ "$DO_APK" = true ] && [ -f "$APK_PATH" ]; then
      bash "$AUDIT_SCRIPT" "$APK_PATH"
    fi
  else
    echo "WARNING: audit script not found at $AUDIT_SCRIPT — skipping"
  fi
fi

echo ""
echo "── Step 4: Verify bundle freshness ──"
# Hermes compiles JS to bytecode (.hbc), so plaintext grep won't work.
# Instead, verify the bundle task actually ran by checking its output timestamp.
BUNDLE_FILE="$DST/apps/mobile/android/app/build/generated/assets/createBundlePreviewReleaseJsAndAssets/index.android.bundle"
if [ ! -f "$BUNDLE_FILE" ]; then
  # Try other flavor paths
  BUNDLE_FILE=$(find "$DST/apps/mobile/android/app/build/generated/assets/" -name "index.android.bundle" 2>/dev/null | head -1)
fi
if [ -n "$BUNDLE_FILE" ] && [ -f "$BUNDLE_FILE" ]; then
  BUNDLE_AGE=$(( $(date +%s) - $(stat -c %Y "$BUNDLE_FILE" 2>/dev/null || stat -f %m "$BUNDLE_FILE" 2>/dev/null) ))
  if [ "$BUNDLE_AGE" -lt 300 ]; then
    echo "Bundle verified: generated ${BUNDLE_AGE}s ago (fresh)"
  else
    echo "WARNING: Bundle is ${BUNDLE_AGE}s old — may be stale"
  fi
else
  echo "Bundle file not found — skipping freshness check"
fi

echo ""
if [ "$DO_APK" = true ]; then
  echo "APK built: $APK_PATH"
fi
if [ "$DO_BUNDLE" = true ]; then
  echo "AAB built: $AAB_PATH"
fi

# ── Step 5: Install if requested (APK only — AAB can't be installed directly) ──
if [ "$DO_INSTALL" = true ] && [ "$DO_APK" = true ]; then
  echo "── Step 5: Installing on device ──"
  adb -s "$ADB_DEVICE" install -r "$APK_PATH"
  echo "Installed $FLAVOR on $ADB_DEVICE"
fi

echo "Done."
