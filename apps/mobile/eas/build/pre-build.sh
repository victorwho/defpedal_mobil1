#!/usr/bin/env bash
set -euo pipefail

# Inject Mapbox download token into gradle.properties so Gradle can
# authenticate with Mapbox's Maven repository during the native build.

if [ -n "${RNMAPBOX_MAPS_DOWNLOAD_TOKEN:-}" ]; then
  GRADLE_PROPS="android/gradle.properties"
  if [ -f "$GRADLE_PROPS" ]; then
    echo "" >> "$GRADLE_PROPS"
    echo "MAPBOX_DOWNLOADS_TOKEN=$RNMAPBOX_MAPS_DOWNLOAD_TOKEN" >> "$GRADLE_PROPS"
    echo "[eas-hook] Injected MAPBOX_DOWNLOADS_TOKEN into gradle.properties"
  else
    echo "[eas-hook] WARNING: $GRADLE_PROPS not found"
  fi
else
  echo "[eas-hook] WARNING: RNMAPBOX_MAPS_DOWNLOAD_TOKEN not set"
fi
