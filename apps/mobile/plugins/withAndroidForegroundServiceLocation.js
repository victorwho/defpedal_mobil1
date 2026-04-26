/**
 * withAndroidForegroundServiceLocation
 *
 * Android 14+ (API 34) requires every foreground service that uses location
 * to declare android:foregroundServiceType="location" on its <service> node,
 * AND the app to hold the FOREGROUND_SERVICE_LOCATION permission. Missing
 * either crashes the app on startForegroundService() during navigation.
 *
 * Expo SDK 55's expo-location autolinker already adds both, but we wrap that
 * behaviour in this plugin as a regression guard:
 *
 *   1. Walk every <service> node in the merged manifest.
 *   2. If the service name matches a known location-handling service and is
 *      missing android:foregroundServiceType, set it to "location".
 *   3. Idempotent — re-runs leave the manifest unchanged.
 *
 * If the autolinker stops emitting the attribute (Expo regression, library
 * downgrade, etc.), this plugin transparently keeps shipping it. If a future
 * service is added that needs a different type, extend `LOCATION_SERVICE_NAMES`.
 *
 * Pattern based on plugins/withAndroidCleartextTraffic.js.
 */
const { createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins');

const LOCATION_SERVICE_NAMES = [
  'expo.modules.location.services.LocationTaskService',
];

const withAndroidForegroundServiceLocation = (config) =>
  withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];

    if (!application || !Array.isArray(application.service)) {
      return configWithManifest;
    }

    for (const service of application.service) {
      if (!service.$) {
        continue;
      }

      const name = service.$['android:name'];

      if (!LOCATION_SERVICE_NAMES.includes(name)) {
        continue;
      }

      if (!service.$['android:foregroundServiceType']) {
        service.$['android:foregroundServiceType'] = 'location';
      }
    }

    return configWithManifest;
  });

module.exports = createRunOncePlugin(
  withAndroidForegroundServiceLocation,
  'with-android-foreground-service-location',
  '1.0.0',
);
