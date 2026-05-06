/**
 * withAndroidFirebaseAnalyticsDisabled
 *
 * Belt-and-suspenders defence against transitive Firebase Analytics pull-ins.
 * `firebase-analytics` is intentionally NOT declared in app/build.gradle
 * (Firebase App Distribution does not require it; shipping it would misalign
 * the Privacy Policy / Data Safety form). However, future expo-modules
 * autolinking or transitive deps via the Firebase BoM could quietly pull it
 * back in. These two meta-data flags ensure that if the SDK ever does end
 * up packaged, it stays inert until the user opts in via the consent flow.
 *
 *   firebase_analytics_collection_enabled=false   — no events on first run
 *   firebase_analytics_collection_deactivated=true — opt-out at SDK load
 *
 * Without this plugin, the same flags can be added by hand to the source
 * AndroidManifest.xml — but `expo prebuild` regenerates the manifest, so
 * a manual edit gets clobbered. This plugin survives prebuild.
 *
 * Pattern based on plugins/withAndroidForegroundServiceLocation.js.
 */
const { createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins');

const META_DATA = [
  { name: 'firebase_analytics_collection_enabled', value: 'false' },
  { name: 'firebase_analytics_collection_deactivated', value: 'true' },
];

const withAndroidFirebaseAnalyticsDisabled = (config) =>
  withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];

    if (!application) {
      return configWithManifest;
    }

    if (!Array.isArray(application['meta-data'])) {
      application['meta-data'] = [];
    }

    for (const { name, value } of META_DATA) {
      const existing = application['meta-data'].find(
        (entry) => entry?.$?.['android:name'] === name,
      );

      if (existing) {
        existing.$['android:value'] = value;
        continue;
      }

      application['meta-data'].push({
        $: {
          'android:name': name,
          'android:value': value,
        },
      });
    }

    return configWithManifest;
  });

module.exports = createRunOncePlugin(
  withAndroidFirebaseAnalyticsDisabled,
  'with-android-firebase-analytics-disabled',
  '1.0.0',
);
