import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const appRoot = __dirname;
const workspaceRoot = path.resolve(appRoot, '..', '..');

type AppVariant = 'development' | 'preview' | 'production' | 'test';

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((env, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return env;
    }

    const sanitized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = sanitized.indexOf('=');

    if (separatorIndex === -1) {
      return env;
    }

    const key = sanitized.slice(0, separatorIndex).trim();
    const value = sanitized.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');

    if (key) {
      env[key] = value;
    }

    return env;
  }, {});
};

const normalizeVariant = (value: string | undefined): AppVariant => {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'production':
      return 'production';
    case 'preview':
    case 'staging':
      return 'preview';
    case 'test':
      return 'test';
    default:
      return 'development';
  }
};

const appVariant = normalizeVariant(
  process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_ENV ?? process.env.EAS_BUILD_PROFILE,
);

const localEnv = [
  path.join(workspaceRoot, '.env'),
  path.join(workspaceRoot, `.env.${appVariant}`),
  path.join(appRoot, '.env'),
  path.join(appRoot, `.env.${appVariant}`),
].reduce<Record<string, string>>((env, filePath) => ({ ...env, ...parseEnvFile(filePath) }), {});

const resolveExpoExtraValue = (keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = process.env[key] ?? localEnv[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
};

const resolveMapboxDownloadToken = () => {
  const candidateKeys = [
    'RNMAPBOX_MAPS_DOWNLOAD_TOKEN',
    'MAPBOX_DOWNLOADS_TOKEN',
    'MAPBOX_SECRET_TOKEN',
    'MAPBOX_ACCESS_TOKEN',
    'VITE_MAPBOX_ACCESS_TOKEN',
    'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
  ];

  for (const key of candidateKeys) {
    const value = process.env[key] ?? localEnv[key];

    if (typeof value === 'string' && value.trim().startsWith('sk.')) {
      return value.trim();
    }
  }

  return '';
};

// Default appEnv to match the build variant. Previously preview defaulted to
// 'staging' for historical reasons, but every other surface (Gradle flavor,
// Android package, Firebase app, tester group) uses 'preview' — the mismatch
// just made Sentry filtering confusing. The build script now writes
// EXPO_PUBLIC_APP_ENV explicitly per flavor (step 1b), so this fallback only
// fires for local dev / Metro starts where it's harmless.
const appEnv = resolveExpoExtraValue(['EXPO_PUBLIC_APP_ENV'], appVariant);
const mobileApiUrl = resolveExpoExtraValue(['EXPO_PUBLIC_MOBILE_API_URL']);

// Sentry config plugin slugs. Read from env so we never commit org/project
// values; activate the plugin only when both are set. SENTRY_AUTH_TOKEN is
// expected to be an EAS secret (set via `eas secret:create`) for source-map
// uploads — never put it in .env. See docs/ops/sentry-setup.md for full
// setup steps.
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// Production builds MUST upload source-maps; otherwise Sentry crash reports
// are unreadable Hermes minified stacks. Fail the build instead of silently
// shipping unreadable telemetry. EAS profiles set EAS_BUILD_PROFILE; CI sets
// CI=true. Anything else (local dev, preview from a fresh checkout) is fine.
const easBuildProfile = process.env.EAS_BUILD_PROFILE;
if (
  appVariant === 'production' &&
  easBuildProfile === 'production' &&
  sentryOrg &&
  sentryProject &&
  !sentryAuthToken
) {
  throw new Error(
    'SENTRY_AUTH_TOKEN missing. Production builds require it for source-map upload. ' +
      'Set it as an EAS secret: `eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>`. ' +
      'See docs/ops/sentry-setup.md.',
  );
}

const sentryPluginEntries =
  sentryOrg && sentryProject
    ? [
        [
          '@sentry/react-native/expo',
          {
            organization: sentryOrg,
            project: sentryProject,
          },
        ] as [string, Record<string, unknown>],
      ]
    : [];

const mapboxDownloadToken = resolveMapboxDownloadToken();

if (mapboxDownloadToken) {
  process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN = mapboxDownloadToken;
}

const appNameByVariant: Record<AppVariant, string> = {
  development: 'Defensive Pedal Dev',
  preview: 'Defensive Pedal Preview',
  production: 'Defensive Pedal',
  test: 'Test DefPedal',
};

const appSchemeByVariant: Record<AppVariant, string> = {
  development: 'defensivepedal-dev',
  preview: 'defensivepedal-preview',
  production: 'defensivepedal',
  test: 'defensivepedal-test',
};

const appIdentifierByVariant: Record<AppVariant, string> = {
  development: 'com.defensivepedal.mobile.dev',
  preview: 'com.defensivepedal.mobile.preview',
  production: 'com.defensivepedal.mobile',
  test: 'com.defensivepedal.mobile.test',
};

export default () => ({
  expo: {
    name: appNameByVariant[appVariant],
    slug: 'defensive-pedal-mobile',
    scheme: appSchemeByVariant[appVariant],
    version: '0.2.70',
    icon: './assets/icon.png',
    // Global default is unlocked so non-map screens (history, community,
    // profile, settings, trophy case, onboarding) follow the OS auto-rotate
    // setting. Map / navigation screens lock themselves to portrait at the
    // screen level via useLockOrientation() — they're designed for handlebar
    // mounts and a landscape variant would need a side-panel redesign.
    orientation: 'default',
    userInterfaceStyle: 'automatic',
    // Disable new architecture for development — bridgeless mode fails to load
    // the Metro JS bundle over USB on Windows. Preview/production use new arch.
    newArchEnabled: appVariant !== 'development',
    // EAS Update OTA. runtimeVersion=appVersion ties OTA bundles to versionName,
    // so a versionName bump (this file's `version`) forces a new native build.
    // Channels in eas.json (preview / production) route OTAs to the right cohort.
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/f8bcd740-c785-47a3-beed-26891c89425a',
    },
    experiments: {
      typedRoutes: true,
    },
    plugins: [
      'expo-router',
      'expo-font',
      '@rnmapbox/maps',
      ...sentryPluginEntries,
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#FACC15',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Defensive Pedal uses your location to preview safer cycling routes and navigate live.',
          locationAlwaysAndWhenInUsePermission:
            'Defensive Pedal uses your location in the background so turn-by-turn navigation keeps working while the screen is locked.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      // Must run after expo-location so it operates on the service node the
      // autolinker just produced. Asserts foregroundServiceType="location".
      './plugins/withAndroidForegroundServiceLocation',
      // Belt-and-suspenders: keep Firebase Analytics inert even if a
      // transitive dep ever pulls it in. firebase-analytics is intentionally
      // NOT declared in app/build.gradle.
      './plugins/withAndroidFirebaseAnalyticsDisabled',
      [
        'expo-secure-store',
        {
          faceIDPermission: 'Allow Defensive Pedal to protect your session securely.',
        },
      ],
      [
        'expo-sqlite',
        {
          enableFTS: true,
          useSQLCipher: false,
        },
      ],
      'expo-web-browser',
    ],
    ios: {
      supportsTablet: false,
      bundleIdentifier: appIdentifierByVariant[appVariant],
      associatedDomains: ['applinks:routes.defensivepedal.com'],
      infoPlist: {
        UIBackgroundModes: ['location', 'processing', 'remote-notification'],
        NSPhotoLibraryUsageDescription:
          'Defensive Pedal needs access to your photos so you can attach images to hazard reports and ride shares.',
        NSPhotoLibraryAddUsageDescription:
          'Defensive Pedal saves share cards to your photo library so you can post them later.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F7D02A',
      },
      package: appIdentifierByVariant[appVariant],
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        // Android 14+ (API 34): foreground services that use location must
        // declare both this permission and the foregroundServiceType="location"
        // attribute on the service node. expo-location autolinks the service
        // attribute on LocationTaskService; the plugin
        // ./plugins/withAndroidForegroundServiceLocation.js asserts both.
        'FOREGROUND_SERVICE_LOCATION',
        'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK',
        'POST_NOTIFICATIONS',
      ],
      blockedPermissions: [
        'com.google.android.gms.permission.AD_ID',
        // SYSTEM_ALERT_WINDOW gets injected transitively by some debugging
        // libraries; Play rejects apps drawing over other apps without
        // justification, and a navigation app has no use for it.
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'routes.defensivepedal.com',
              pathPrefix: '/r/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    extra: {
      eas: {
        projectId: 'f8bcd740-c785-47a3-beed-26891c89425a',
      },
      appEnv,
      appVariant,
      mobileApiUrl,
      mapboxPublicToken: resolveExpoExtraValue([
        'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
        'MAPBOX_ACCESS_TOKEN',
        'VITE_MAPBOX_ACCESS_TOKEN',
      ]),
      supabaseUrl: resolveExpoExtraValue([
        'EXPO_PUBLIC_SUPABASE_URL',
        'SUPABASE_URL',
        'VITE_SUPABASE_URL',
      ]),
      supabaseAnonKey: resolveExpoExtraValue([
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_ANON_KEY',
        'VITE_SUPABASE_ANON_KEY',
      ]),
      // Web OAuth client ID used by native Google Sign-In. The ID token's
      // audience is this client, which Supabase's signInWithIdToken validates.
      // Reuses the same web client configured in the Supabase Google provider.
      googleWebClientId: resolveExpoExtraValue([
        'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
        'GOOGLE_WEB_CLIENT_ID',
      ]),
      sentryDsn: resolveExpoExtraValue(['EXPO_PUBLIC_SENTRY_DSN']),
      sentryEnvironment: resolveExpoExtraValue(
        ['EXPO_PUBLIC_SENTRY_ENVIRONMENT'],
        appEnv,
      ),
      sentryTracesSampleRate: resolveExpoExtraValue(
        ['EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE'],
        '0.2',
      ),
      posthogApiKey: resolveExpoExtraValue(['EXPO_PUBLIC_POSTHOG_API_KEY']),
      posthogHost: resolveExpoExtraValue(
        ['EXPO_PUBLIC_POSTHOG_HOST'],
        'https://eu.i.posthog.com',
      ),
      // Dev-bypass credentials are ONLY included in development builds.
      // Preview and production APKs must never ship these — the token would
      // be extractable by anyone decompiling the bundle.
      //
      // Both EXPO_PUBLIC_ and non-prefixed names are checked for backwards compatibility.
      // Despite the non-EXPO_PUBLIC_ naming, these values ARE shipped in the JS bundle
      // via Constants.expoConfig.extra — hence the development-only gate above.
      ...(appVariant === 'development'
        ? {
            devAuthBypassEnabled: resolveExpoExtraValue(
              ['EXPO_PUBLIC_DEV_AUTH_BYPASS_ENABLED', 'DEV_AUTH_BYPASS_ENABLED'],
              'false',
            ),
            devAuthBypassToken: resolveExpoExtraValue([
              'EXPO_PUBLIC_DEV_AUTH_BYPASS_TOKEN',
              'DEV_AUTH_BYPASS_TOKEN',
            ]),
            devAuthBypassUserId: resolveExpoExtraValue([
              'EXPO_PUBLIC_DEV_AUTH_BYPASS_USER_ID',
              'DEV_AUTH_BYPASS_USER_ID',
            ]),
            devAuthBypassEmail: resolveExpoExtraValue([
              'EXPO_PUBLIC_DEV_AUTH_BYPASS_EMAIL',
              'DEV_AUTH_BYPASS_EMAIL',
            ]),
          }
        : {
            devAuthBypassEnabled: 'false',
          }),
      validationBundleId: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_BUNDLE_ID']),
      validationSourceRoot: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_SOURCE_ROOT']),
      validationMetroPort: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_METRO_PORT']),
      validationMode: resolveExpoExtraValue(['EXPO_PUBLIC_VALIDATION_MODE']),
    },
  },
});
