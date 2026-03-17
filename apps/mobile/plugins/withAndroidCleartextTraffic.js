const { createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins');

const withAndroidCleartextTraffic = (config, props = {}) =>
  withAndroidManifest(config, (configWithManifest) => {
    const appConfig = configWithManifest.modResults.manifest.application?.[0];

    if (!appConfig) {
      return configWithManifest;
    }

    if (!appConfig.$) {
      appConfig.$ = {};
    }

    if (props.enabled) {
      appConfig.$['android:usesCleartextTraffic'] = 'true';
    } else {
      delete appConfig.$['android:usesCleartextTraffic'];
    }

    return configWithManifest;
  });

module.exports = createRunOncePlugin(
  withAndroidCleartextTraffic,
  'with-android-cleartext-traffic',
  '1.0.0',
);
