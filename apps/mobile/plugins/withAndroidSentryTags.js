/**
 * withAndroidSentryTags
 *
 * P3f (error-reduction plan, 2026-05-25): pre-JS fatal tagging.
 *
 * @sentry/react-native sets io.sentry.auto-init=false in its merged manifest
 * so the native SDK waits for the JS bridge to call Sentry.init from
 * enableSentry() in lib/telemetry.ts. The existing P0 beforeSend hook (see
 * error-log #46) tags every event with app_variant / app_env — including
 * ApplicationExitInfo-captured ANRs from prior process boots.
 *
 * These manifest meta-data entries are belt-and-suspenders: when the native
 * SDK initialises via the bridge, SentryAndroidOptions reads any
 * io.sentry.tags.KEY meta-data and applies them to the initial scope BEFORE
 * the JS-side beforeSend hook is registered. That closes the narrow window
 * between native crash-handler install and JS hook registration. The
 * placeholder values are filled in per gradle flavor via manifestPlaceholders
 * in android/app/build.gradle (one mapping per development / preview /
 * production), so events natively-tagged here match what
 * mobileEnv.appVariant / mobileEnv.appEnv resolve to in JS.
 *
 * The companion manifestPlaceholders declarations live in
 * apps/mobile/android/app/build.gradle's productFlavors block — keep both
 * sides in sync if the placeholder names ever change.
 *
 * Pattern based on plugins/withAndroidFirebaseAnalyticsDisabled.js.
 * This project does not run `expo prebuild` as part of the build pipeline,
 * so the durable runtime answer is the hand-edited
 * apps/mobile/android/app/src/main/AndroidManifest.xml. This plugin exists
 * so any future prebuild run reconstructs the meta-data automatically.
 */
const { createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins');

const META_DATA = [
  { name: 'io.sentry.tags.app_variant', value: '${SENTRY_APP_VARIANT}' },
  { name: 'io.sentry.tags.app_env', value: '${SENTRY_APP_ENV}' },
];

const withAndroidSentryTags = (config) =>
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
  withAndroidSentryTags,
  'with-android-sentry-tags',
  '1.0.0',
);
