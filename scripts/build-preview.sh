#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# build-preview.sh — Build a preview APK from C:\dpb
#
# Handles: source sync, cache cleaning, bundle embedding,
#          bundle verification, and APK installation.
#
# Usage:
#   bash scripts/build-preview.sh              # preview flavor (default)
#   bash scripts/build-preview.sh install      # preview + install via ADB
#   bash scripts/build-preview.sh dev          # development flavor
#   bash scripts/build-preview.sh dev install  # development + install
#   bash scripts/build-preview.sh prod         # production flavor
# ──────────────────────────────────────────────────────────

set -euo pipefail

SRC="${SRC:-C:/dev/defpedal}"
DST="${DST:-C:/dpb}"
ADB_DEVICE="R5CX61E737J"

# ── Parse arguments ──
FLAVOR="preview"
DO_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    dev|development) FLAVOR="development" ;;
    prod|production) FLAVOR="production" ;;
    preview)         FLAVOR="preview" ;;
    install)         DO_INSTALL=true ;;
  esac
done

# Capitalize first letter for Gradle task name
FLAVOR_CAP="$(echo "${FLAVOR:0:1}" | tr '[:lower:]' '[:upper:]')${FLAVOR:1}"
GRADLE_TASK="assemble${FLAVOR_CAP}Release"
APK_DIR="$DST/apps/mobile/android/app/build/outputs/apk/${FLAVOR}/release"
APK_PATH="$APK_DIR/app-${FLAVOR}-release.apk"

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

echo "── Step 2: Clean Gradle bundle cache ──"
# Forces Gradle to re-run the Metro bundle task instead of reusing stale output.
rm -rf "$DST/apps/mobile/android/app/build/generated/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/assets/"
rm -rf "$DST/apps/mobile/android/app/build/intermediates/merged_res/"
rm -rf "$DST/apps/mobile/android/app/build/outputs/"

echo "── Step 3: Build $FLAVOR release APK ──"
cd "$DST/apps/mobile/android"
./gradlew "$GRADLE_TASK"

# ── Step 4: Verify bundle freshness ──
# Check that the APK exists
if [ ! -f "$APK_PATH" ]; then
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
echo "APK built: $APK_PATH"

# ── Step 5: Install if requested ──
if [ "$DO_INSTALL" = true ]; then
  echo "── Step 5: Installing on device ──"
  adb -s "$ADB_DEVICE" install -r "$APK_PATH"
  echo "Installed $FLAVOR on $ADB_DEVICE"
fi

echo "Done."
